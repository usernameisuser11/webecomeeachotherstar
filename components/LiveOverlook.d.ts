export type LivePeer = { id: string; x: number; hue: number; pose: "idle" | "walk" | "sit" | "lie"; waveUntil: number; glowUntil: number };
export type LiveOverlook = { render(ctx: CanvasRenderingContext2D, width: number, height: number, ms: number, peers: LivePeer[], count: number): boolean; dispose(): void };
export function createLiveOverlook(): LiveOverlook;
