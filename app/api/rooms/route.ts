import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { reports, roomGlows, roomPresence, rooms, roomStars } from "../../../db/schema";
import { fail, hashSecret, jsonBody, MAX_REPORTS_PER_DAY, noCache, publicName, validReportReason, validRoomId } from "../../../lib/room-utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const roomFields = { id: rooms.id, name: rooms.name, visibility: rooms.visibility, theme: rooms.theme, createdAt: rooms.createdAt };

export async function GET() {
  try {
    const db = getDb();
    const list = await db.select(roomFields).from(rooms).where(eq(rooms.visibility, "public")).orderBy(desc(rooms.createdAt)).limit(80);
    return Response.json({ rooms: list }, { headers: noCache });
  } catch (error) { console.error("rooms GET", error); return fail("방 목록을 불러오지 못했습니다.", 503); }
}

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return fail("요청 내용을 확인해 주세요.");
  const ownerHash = await hashSecret(body.token);
  if (!ownerHash) return fail("이 기기를 확인할 수 없습니다.");
  try {
    const db = getDb();
    if (body.action === "mine") {
      const mine = await db.select(roomFields).from(rooms).where(eq(rooms.ownerHash, ownerHash)).orderBy(desc(rooms.createdAt)).limit(10);
      return Response.json({ rooms: mine }, { headers: noCache });
    }
    if (body.action === "create") {
      const name = publicName(body.name, 20);
      if (!name) return fail("방 이름을 확인해 주세요. 욕설·연락처 없이 1~20글자로 적어 주세요.");
      if (body.visibility !== "public" && body.visibility !== "private") return fail("공개 여부를 선택해 주세요.");
      if (!(["forest", "violet", "ocean", "dawn"] as unknown[]).includes(body.theme)) return fail("밤하늘 배경을 골라 주세요.");
      const inviteHash = body.visibility === "private" ? await hashSecret(body.inviteKey) : null;
      if (body.visibility === "private" && !inviteHash) return fail("초대 링크를 만들 수 없습니다.");
      const [{ total }] = await db.select({ total: count() }).from(rooms).where(eq(rooms.ownerHash, ownerHash));
      if (total >= 3) return fail("이 기기에서는 방을 최대 3개까지 만들 수 있습니다. 기존 방을 정리한 뒤 다시 만들어 주세요.", 409);
      const room = { id: crypto.randomUUID(), name, ownerHash, visibility: body.visibility, theme: body.theme as string, inviteHash, createdAt: Date.now() };
      await db.insert(rooms).values(room);
      return Response.json({ room: { id: room.id, name, visibility: room.visibility, theme: room.theme, createdAt: room.createdAt } }, { headers: noCache });
    }
    if (body.action === "delete") {
      if (!validRoomId(body.roomId)) return fail("방을 찾을 수 없습니다.");
      const room = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, body.roomId), eq(rooms.ownerHash, ownerHash))).limit(1);
      if (!room.length) return fail("이 방을 삭제할 수 없습니다.", 403);
      await db.batch([
        db.delete(reports).where(eq(reports.roomId, body.roomId)),
        db.delete(roomGlows).where(eq(roomGlows.roomId, body.roomId)),
        db.delete(roomPresence).where(eq(roomPresence.roomId, body.roomId)),
        db.delete(roomStars).where(eq(roomStars.roomId, body.roomId)),
        db.delete(rooms).where(and(eq(rooms.id, body.roomId), eq(rooms.ownerHash, ownerHash))),
      ]);
      return Response.json({ ok: true }, { headers: noCache });
    }
    if (body.action === "report-room") {
      if (!validRoomId(body.roomId) || !validReportReason(body.reason)) return fail("신고할 방과 사유를 확인해 주세요.");
      const [target] = await db.select({ id: rooms.id, ownerHash: rooms.ownerHash, visibility: rooms.visibility }).from(rooms).where(eq(rooms.id, body.roomId)).limit(1);
      if (!target || target.visibility !== "public" || target.ownerHash === ownerHash) return fail("신고할 수 없는 방입니다.", 403);
      const now = Date.now();
      const [{ total }] = await db.select({ total: count() }).from(reports).where(and(eq(reports.reporterHash, ownerHash), gte(reports.createdAt, now - 86400000)));
      if (total >= MAX_REPORTS_PER_DAY) return fail("신고는 하루 최대 6회까지 가능합니다.", 429);
      await db.insert(reports).values({ id: crypto.randomUUID(), targetType: "room", targetId: target.id, roomId: target.id, reporterHash: ownerHash, reason: body.reason, createdAt: now }).onConflictDoNothing();
      return Response.json({ ok: true }, { headers: noCache });
    }
    if (body.action === "reports") {
      if (!validRoomId(body.roomId)) return fail("방 주소를 확인해 주세요.");
      const [owned] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, body.roomId), eq(rooms.ownerHash, ownerHash))).limit(1);
      if (!owned) return fail("방장만 신고 내역을 확인할 수 있습니다.", 403);
      const incoming = await db.select({ starId: reports.targetId, name: roomStars.name, reason: reports.reason, createdAt: reports.createdAt })
        .from(reports).innerJoin(roomStars, eq(reports.targetId, roomStars.id))
        .where(and(eq(reports.roomId, body.roomId), eq(reports.targetType, "star")))
        .orderBy(desc(reports.createdAt)).limit(100);
      return Response.json({ reports: incoming }, { headers: noCache });
    }
    return fail("알 수 없는 요청입니다.");
  } catch (error) { console.error("rooms POST", error); return fail("잠시 방을 준비하지 못했습니다. 다시 시도해 주세요.", 503); }
}
