import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { glows, presence, stars } from "../../../db/schema";

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
      db.select({ id: stars.id, name: stars.name, x: stars.x, y: stars.y, hue: stars.hue, createdAt: stars.createdAt }).from(stars).orderBy(stars.createdAt).limit(500),
      db.select({ toStarId: glows.toStarId, createdAt: glows.createdAt }).from(glows).where(gte(glows.createdAt, now - 30 * 86400000)).limit(2000),
      db.select({ ownerHash: presence.ownerHash }).from(presence).where(gte(presence.lastSeen, now - 48000)).limit(200),
    ]);
    const activeHashes = active.map((row) => row.ownerHash);
    const liveStars = activeHashes.length
      ? await db.select({ id: stars.id }).from(stars).where(inArray(stars.ownerHash, activeHashes))
      : [];
    return Response.json({ stars: allStars, glows: recentGlows, liveStarIds: liveStars.map((s) => s.id), now }, { headers });
  } catch (error) {
    console.error("sky GET failed", error);
    return failure("밤하늘을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 3000) return failure("입력 내용이 너무 깁니다.");
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return failure("올바르지 않은 요청입니다."); }
  const hash = await hashToken(body.token);
  if (!hash) return failure("별을 찾는 데 필요한 정보가 없습니다.");

  try {
    const db = getDb();
    const now = Date.now();
    if (body.action === "create") {
      const old = await db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1);
      if (old.length) return Response.json({ id: old[0].id, alreadyCreated: true }, { headers });
      const name = typeof body.name === "string" ? body.name.trim().replace(/[<>\r\n\t]/g, "") : "";
      if (!name || [...name].length > 12) return failure("별 이름은 1~12글자로 적어 주세요.");
      const x = Number(body.x), y = Number(body.y), hue = Number(body.hue);
      if (![x, y, hue].every(Number.isFinite) || x < .07 || x > .93 || y < .11 || y > .69 || ![38, 187, 213, 263, 316].includes(hue)) return failure("별의 위치나 색을 확인해 주세요.");
      const id = crypto.randomUUID();
      await db.insert(stars).values({ id, ownerHash: hash, name, x, y, hue, createdAt: now }).onConflictDoNothing();
      const result = await db.select({ id: stars.id }).from(stars).where(eq(stars.ownerHash, hash)).limit(1);
      return Response.json({ id: result[0]?.id ?? id }, { headers });
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
