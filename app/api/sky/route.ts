import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { glows, presence, reports, stars } from "../../../db/schema";
import { MAIN_SKY_CAPACITY, MAX_REPORTS_PER_DAY, publicName, validReportReason, validRoomId } from "../../../lib/room-utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const failure = (message: string, status = 400) => Response.json({ error: message }, { status, headers });

async function hashToken(token: unknown) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{24,128}$/.test(token)) return null;
  const input = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    const db = getDb();
    const now = Date.now();
    const [allStars, recentGlows, active] = await Promise.all([
      db.select({ id: stars.id, name: stars.name, x: stars.x, y: stars.y, hue: stars.hue, createdAt: stars.createdAt }).from(stars).orderBy(stars.createdAt).limit(MAIN_SKY_CAPACITY),
      db.select({ toStarId: glows.toStarId, createdAt: glows.createdAt }).from(glows).where(gte(glows.createdAt, now - 30 * 86400000)).orderBy(desc(glows.createdAt)).limit(2000),
      db.select({ ownerHash: presence.ownerHash }).from(presence).where(gte(presence.lastSeen, now - 48000)).limit(200),
    ]);
    const activeHashes = active.map((row) => row.ownerHash);
    const liveStars = activeHashes.length
      ? await db.select({ id: stars.id }).from(stars).where(inArray(stars.ownerHash, activeHashes))
      : [];
    return Response.json({ stars: allStars, capacity: MAIN_SKY_CAPACITY, glows: recentGlows, liveStarIds: liveStars.map((s) => s.id), now }, { headers });
  } catch (error) {
    console.error("sky GET failed", error);
    return failure("밤하늘을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 3000) return failure("입력 내용이 너무 깁니다.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("올바르지 않은 요청입니다.");
  } catch { return failure("올바르지 않은 요청입니다."); }
  const hash = await hashToken(body.token);
  if (!hash) return failure("별을 찾는 데 필요한 정보가 없습니다.");

  try {
    const db = getDb();
    const now = Date.now();
    if (body.action === "create") {
      const old = await db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1);
      if (old.length) return Response.json({ id: old[0].id, alreadyCreated: true }, { headers });
      const name = publicName(body.name, 12);
      if (!name) return failure("별 이름을 확인해 주세요. 욕설·연락처 없이 1~12글자로 적어 주세요.");
      const x = Number(body.x), y = Number(body.y), hue = Number(body.hue);
      if (![x, y, hue].every(Number.isFinite) || x < .07 || x > .93 || y < .11 || y > .69 || ![38, 187, 213, 263, 316].includes(hue)) return failure("별의 위치나 색을 확인해 주세요.");
      const id = crypto.randomUUID();
      await db.run(sql`INSERT INTO stars (id, owner_hash, name, x, y, hue, created_at)
        SELECT ${id}, ${hash}, ${name}, ${x}, ${y}, ${hue}, ${now}
        WHERE (SELECT count(*) FROM stars) < ${MAIN_SKY_CAPACITY}
        ON CONFLICT (owner_hash) DO NOTHING`);
      const result = await db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1);
      if (!result.length) return failure(`이 하늘에는 별을 최대 ${MAIN_SKY_CAPACITY}개까지 남길 수 있습니다.`, 409);
      return Response.json({ id: result[0].id }, { headers });
    }
    if (body.action === "report-star") {
      if (!validRoomId(body.targetId) || !validReportReason(body.reason)) return failure("신고할 별과 사유를 확인해 주세요.");
      const [target] = await db.select({ id: stars.id, ownerHash: stars.ownerHash }).from(stars).where(eq(stars.id, body.targetId)).limit(1);
      if (!target || target.ownerHash === hash) return failure("다른 사람의 별만 신고할 수 있습니다.");
      const [{ total }] = await db.select({ total: count() }).from(reports).where(and(eq(reports.reporterHash, hash), gte(reports.createdAt, now - 86400000)));
      if (total >= MAX_REPORTS_PER_DAY) return failure("신고는 하루 최대 6회까지 가능합니다.", 429);
      await db.insert(reports).values({ id: crypto.randomUUID(), targetType: "star", targetId: target.id, roomId: null, reporterHash: hash, reason: body.reason, createdAt: now }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "delete-star") {
      if (!validRoomId(body.targetId)) return failure("삭제할 별을 선택해 주세요.");
      const [target] = await db.select({ id: stars.id }).from(stars).where(and(eq(stars.id, body.targetId), eq(stars.ownerHash, hash))).limit(1);
      if (!target) return failure("본인이 남긴 별만 삭제할 수 있습니다.", 403);
      await db.batch([
        db.delete(glows).where(eq(glows.toStarId, target.id)),
        db.delete(presence).where(eq(presence.ownerHash, hash)),
        db.delete(reports).where(and(eq(reports.targetType, "star"), eq(reports.targetId, target.id))),
        db.delete(stars).where(and(eq(stars.id, target.id), eq(stars.ownerHash, hash))),
      ]);
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "glow") {
      if (typeof body.targetId !== "string") return failure("빛을 보낼 별을 선택해 주세요.");
      const [mine, recipient] = await Promise.all([
        db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1),
        db.select({ id: stars.id, ownerHash: stars.ownerHash }).from(stars).where(eq(stars.id, body.targetId)).limit(1),
      ]);
      if (!mine.length) return failure("먼저 자신의 별을 만들어 주세요.");
      if (!recipient.length || recipient[0].ownerHash === hash) return failure("다른 친구의 별을 선택해 주세요.");
      const today = new Date(now).toISOString().slice(0, 10);
      await db.insert(glows).values({ id: crypto.randomUUID(), fromHash: hash, toStarId: recipient[0].id, day: today, createdAt: now }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "ping") {
      const mine = await db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1);
      if (!mine.length) return Response.json({ ok: true }, { headers });
      await db.insert(presence).values({ ownerHash: hash, lastSeen: now }).onConflictDoUpdate({ target: presence.ownerHash, set: { lastSeen: now } });
      return Response.json({ ok: true }, { headers });
    }
    return failure("알 수 없는 요청입니다.");
  } catch (error) {
    console.error("sky POST failed", error);
    return failure("별빛이 잠시 닿지 못했습니다. 다시 시도해 주세요.", 503);
  }
}
