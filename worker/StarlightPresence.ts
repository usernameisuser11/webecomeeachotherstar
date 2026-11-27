import { DurableObject } from "cloudflare:workers";

type Pose = "idle" | "walk" | "sit" | "lie";
type Peer = { id: string; x: number; pose: Pose; hue: number; waveUntil: number; glowUntil: number; last: number };
const MAX = 8;
const poses = new Set(["idle", "walk", "sit", "lie"]);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const publicPeer = ({ last: _last, ...peer }: Peer) => peer;

// Ephemeral presence only; never store device tokens, wishes, or star ownership here.
export class StarlightPresence extends DurableObject {
  private peers() {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === 1);
  }
  private snapshot() {
    return this.peers().map(ws => ws.deserializeAttachment() as Peer | null).filter((p): p is Peer => !!p).map(publicPeer);
  }
  private broadcast(message: unknown) {
    const data = JSON.stringify(message);
    for (const ws of this.peers()) {
      try { ws.send(data); } catch { try { ws.close(1011, "Disconnected"); } catch {} }
    }
  }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (this.peers().length >= MAX) return new Response("Full", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID();
    const slots = [.46, .54, .37, .63, .28, .72, .19, .81];
    const occupied = this.snapshot();
    const x = slots.find(slot => occupied.every(p => Math.abs(p.x - slot) > .045)) ?? slots[occupied.length % MAX];
    const peer: Peer = { id, x, pose: "sit", hue: [187, 213, 263, 316, 38][crypto.getRandomValues(new Uint8Array(1))[0] % 5], waveUntil: 0, glowUntil: 0, last: 0 };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(peer);
    server.send(JSON.stringify({ type: "welcome", id, serverTime: Date.now() }));
    this.broadcast({ type: "peers", peers: this.snapshot() });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 512) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(message); } catch { return; }
    if (!data || typeof data !== "object") return;
    const p = ws.deserializeAttachment() as Peer | null;
    if (!p) return;
    const now = Date.now();
    if (now - p.last < 90) return;
    if (data.type === "state" && typeof data.x === "number" && Number.isFinite(data.x) && typeof data.pose === "string" && poses.has(data.pose)) {
      const maxStep = p.last ? Math.min(.12, .02 + Math.max(0, now - p.last) * .0002) : .06;
      p.x = clamp(p.x + clamp(data.x - p.x, -maxStep, maxStep), .06, .94);
      p.pose = data.pose as Pose;
    } else if (data.type === "wave") {
      if (p.waveUntil > now) return;
      p.waveUntil = now + 1800;
    } else if (data.type === "glow") {
      if (p.glowUntil > now) return;
      p.glowUntil = now + 2400;
    } else return;
    p.last = now;
    ws.serializeAttachment(p);
    this.broadcast({ type: "peers", peers: this.snapshot() });
  }
  webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1006 ? 1000 : code); } catch {}
    this.broadcast({ type: "peers", peers: this.snapshot() });
  }
  webSocketError(ws: WebSocket) {
    try { ws.close(1011, "Connection error"); } catch {}
    this.broadcast({ type: "peers", peers: this.snapshot() });
  }
}
