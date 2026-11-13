// Run after `npm run build` and local D1 migrations. Never touches production.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const port = 8798;
const base = `http://127.0.0.1:${port}`;
const child = spawn("npm", ["start", "--", "--port", String(port)], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", chunk => { output += String(chunk).slice(-1500); output = output.slice(-8000); });
child.stderr.on("data", chunk => { output += String(chunk).slice(-1500); output = output.slice(-8000); });
const token = suffix => `test_${suffix}_${crypto.randomUUID().replaceAll("-", "")}`;
const alice = token("alice"), bob = token("bob"), carol = token("carol");

async function call(path, body) {
  const response = await fetch(`${base}${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  return { status: response.status, data };
}

try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await call("/api/sky")).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Local worker did not become ready: ${output.slice(-1800)}`);
  const createStar = (who, name) => ({ action: "create", token: who, name, x: .27, y: .32, hue: 187 });
  const a = await call("/api/sky", createStar(alice, "작은 용기"));
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal((await call("/api/sky", createStar(alice, "두 번째 별"))).data.id, a.data.id);
  assert.equal((await call("/api/sky", createStar(carol, "씨발"))).status, 400);
  const b = await call("/api/sky", createStar(bob, "내일의 빛"));
  assert.equal(b.status, 200);
  assert.equal((await call("/api/sky", { action: "delete-star", token: bob, targetId: a.data.id })).status, 403);
  assert.equal((await call("/api/sky", { action: "report-star", token: bob, targetId: a.data.id, reason: "abuse" })).status, 200);
  assert.equal((await call("/api/sky", { action: "report-star", token: bob, targetId: a.data.id, reason: "abuse" })).status, 200);

  const room = await call("/api/rooms", { action: "create", token: alice, name: "조용한 밤", visibility: "public", theme: "forest" });
  assert.equal(room.status, 200, JSON.stringify(room.data));
  const roomId = room.data.room.id;
  assert.equal((await call("/api/rooms", { action: "delete", token: bob, roomId })).status, 403);
  assert.equal((await call("/api/rooms", { action: "reports", token: bob, roomId })).status, 403);
  const roomA = await call("/api/room-sky", { ...createStar(alice, "달빛"), roomId });
  const roomB = await call("/api/room-sky", { ...createStar(bob, "새벽빛"), roomId });
  assert.equal(roomA.status, 200, JSON.stringify(roomA.data));
  assert.equal(roomB.status, 200, JSON.stringify(roomB.data));
  assert.equal((await call("/api/room-sky", { action: "delete-star", token: carol, roomId, targetId: roomB.data.id })).status, 403);
  assert.equal((await call("/api/room-sky", { action: "report-star", token: bob, roomId, targetId: roomA.data.id, reason: "spam" })).status, 200);
  const reportList = await call("/api/rooms", { action: "reports", token: alice, roomId });
  assert.equal(reportList.status, 200);
  assert.equal(reportList.data.reports.length, 1);
  assert.equal((await call("/api/room-sky", { action: "delete-star", token: alice, roomId, targetId: roomB.data.id })).status, 200);
  assert.equal((await call("/api/room-sky", { action: "view", roomId })).data.capacity, 300);
  assert.equal((await call("/api/rooms", { action: "delete", token: alice, roomId })).status, 200);
  assert.equal((await call("/api/room-sky", { action: "view", roomId })).status, 404);
  console.log("Local smoke tests passed: star limits, profanity, reports, owner-only deletion and room access.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}
