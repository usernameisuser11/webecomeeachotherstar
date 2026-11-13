import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { reports, roomGlows, roomPresence, rooms, roomStars } from "../../../db/schema";
import { fail, hashSecret, jsonBody, MAX_REPORTS_PER_DAY, noCache, publicName, ROOM_SKY_CAPACITY, validReportReason, validRoomId } from "../../../lib/room-utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body || !validRoomId(body.roomId)) return fail("방 주소를 확인해 주세요.");
  try {
    const db = getDb();
    const [room] = await db.select().from(rooms).where(eq(rooms.id, body.roomId)).limit(1);
    if (!room) return fail("이 방은 더 이상 존재하지 않습니다.", 404);
    if (room.visibility === "private") {
      const inviteHash = await hashSecret(body.inviteKey);
      if (!inviteHash || inviteHash !== room.inviteHash) return fail("초대 링크가 필요한 비공개 방입니다.", 403);
    }
    const roomInfo = { id: room.id, name: room.name, visibility: room.visibility, theme: room.theme, createdAt: room.createdAt };
    const now = Date.now();
    if (body.action === "view") {
      const [allStars, recentGlows, active] = await Promise.all([
        db.select({ id: roomStars.id, name: roomStars.name, x: roomStars.x, y: roomStars.y, hue: roomStars.hue, createdAt: roomStars.createdAt }).from(roomStars).where(eq(roomStars.roomId, room.id)).orderBy(roomStars.createdAt).limit(ROOM_SKY_CAPACITY),
        db.select({ toStarId: roomGlows.toStarId, createdAt: roomGlows.createdAt }).from(roomGlows).where(and(eq(roomGlows.roomId, room.id), gte(roomGlows.createdAt, now - 30 * 86400000))).orderBy(desc(roomGlows.createdAt)).limit(2000),
        db.select({ ownerHash: roomPresence.ownerHash }).from(roomPresence).where(and(eq(roomPresence.roomId, room.id), gte(roomPresence.lastSeen, now - 48000))).limit(200),
      ]);
      const activeHashes = active.map(row => row.ownerHash);
      const liveStars = activeHashes.length ? await db.select({ id: roomStars.id }).from(roomStars).where(and(eq(roomStars.roomId, room.id), inArray(roomStars.ownerHash, activeHashes))) : [];
      return Response.json({ room: roomInfo, stars: allStars, capacity: ROOM_SKY_CAPACITY, glows: recentGlows, liveStarIds: liveStars.map(s => s.id), now }, { headers: noCache });
    }
    const hash = await hashSecret(body.token);
    if (!hash) return fail("별을 찾는 데 필요한 정보가 없습니다.");
    const ownStar = () => db.select({ id: roomStars.id }).from(roomStars).where(and(eq(roomStars.roomId, room.id), eq(roomStars.ownerHash, hash))).limit(1);
    if (body.action === "create") {
      const existing = await ownStar();
      if (existing.length) return Response.json({ id: existing[0].id, alreadyCreated: true }, { headers: noCache });
      const name = publicName(body.name, 12);
      if (!name) return fail("별 이름을 확인해 주세요. 욕설·연락처 없이 1~12글자로 적어 주세요.");
      const x = Number(body.x), y = Number(body.y), hue = Number(body.hue);
      if (![x,y,hue].every(Number.isFinite) || x < .07 || x > .93 || y < .11 || y > .69 || ![38,187,213,263,316].includes(hue)) return fail("별 위치나 색을 확인해 주세요.");
      const id = crypto.randomUUID();
      // Count and insert in one SQLite statement: concurrent visitors cannot
      // silently exceed the visual capacity of a shared room.
      await db.run(sql`INSERT INTO room_stars (id, room_id, owner_hash, name, x, y, hue, created_at)
        SELECT ${id}, ${room.id}, ${hash}, ${name}, ${x}, ${y}, ${hue}, ${now}
        WHERE (SELECT count(*) FROM room_stars WHERE room_id = ${room.id}) < ${ROOM_SKY_CAPACITY}
        ON CONFLICT (owner_hash, room_id) DO NOTHING`);
      const actual = await ownStar();
      if (!actual.length) return fail(`이 하늘에는 별을 최대 ${ROOM_SKY_CAPACITY}개까지 남길 수 있습니다.`, 409);
      return Response.json({ id: actual[0].id }, { headers: noCache });
    }
    if (body.action === "report-star") {
      if (!validRoomId(body.targetId) || !validReportReason(body.reason)) return fail("신고할 별과 사유를 확인해 주세요.");
      const [target] = await db.select({ id: roomStars.id, ownerHash: roomStars.ownerHash }).from(roomStars).where(and(eq(roomStars.id, body.targetId), eq(roomStars.roomId, room.id))).limit(1);
      if (!target || target.ownerHash === hash) return fail("다른 사람의 별만 신고할 수 있습니다.");
      const [{ total }] = await db.select({ total: count() }).from(reports).where(and(eq(reports.reporterHash, hash), gte(reports.createdAt, now - 86400000)));
      if (total >= MAX_REPORTS_PER_DAY) return fail("신고는 하루 최대 6회까지 가능합니다.", 429);
      await db.insert(reports).values({ id: crypto.randomUUID(), targetType: "star", targetId: target.id, roomId: room.id, reporterHash: hash, reason: body.reason, createdAt: now }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers: noCache });
    }
    if (body.action === "delete-star") {
      if (!validRoomId(body.targetId)) return fail("삭제할 별을 선택해 주세요.");
      const [target] = await db.select({ id: roomStars.id, ownerHash: roomStars.ownerHash }).from(roomStars).where(and(eq(roomStars.id, body.targetId), eq(roomStars.roomId, room.id))).limit(1);
      if (!target) return fail("별을 찾을 수 없습니다.", 404);
      if (target.ownerHash !== hash && room.ownerHash !== hash) return fail("본인의 별 또는 방장이 관리하는 별만 삭제할 수 있습니다.", 403);
      await db.batch([
        db.delete(roomGlows).where(eq(roomGlows.toStarId, target.id)),
        db.delete(roomPresence).where(and(eq(roomPresence.roomId, room.id), eq(roomPresence.ownerHash, target.ownerHash))),
        db.delete(reports).where(and(eq(reports.targetType, "star"), eq(reports.targetId, target.id))),
        db.delete(roomStars).where(and(eq(roomStars.id, target.id), eq(roomStars.roomId, room.id))),
      ]);
      return Response.json({ ok: true }, { headers: noCache });
    }
    if (body.action === "glow") {
      if (typeof body.targetId !== "string") return fail("빛을 보낼 별을 선택해 주세요.");
      const [mine, target] = await Promise.all([
        ownStar(),
        db.select({ id: roomStars.id, ownerHash: roomStars.ownerHash }).from(roomStars).where(and(eq(roomStars.roomId, room.id), eq(roomStars.id, body.targetId))).limit(1),
      ]);
      if (!mine.length) return fail("자신의 별을 먼저 만들어 주세요.");
      if (!target.length || target[0].ownerHash === hash) return fail("다른 친구의 별을 선택해 주세요.");
      const day = new Date(now).toISOString().slice(0,10);
      await db.insert(roomGlows).values({ id: crypto.randomUUID(), roomId: room.id, fromHash: hash, toStarId: target[0].id, day, createdAt: now }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers: noCache });
    }
    if (body.action === "ping") {
      const mine = await ownStar();
      if (mine.length) await db.insert(roomPresence).values({ roomId: room.id, ownerHash: hash, lastSeen: now }).onConflictDoUpdate({ target: [roomPresence.roomId, roomPresence.ownerHash], set: { lastSeen: now } });
      return Response.json({ ok: true }, { headers: noCache });
    }
    return fail("알 수 없는 요청입니다.");
  } catch (error) { console.error("room-sky POST", error); return fail("잠시 별들이 보이지 않습니다. 다시 시도해 주세요.", 503); }
}
