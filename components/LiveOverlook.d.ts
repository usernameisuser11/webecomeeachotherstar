export type LivePeer = { id: string; x: number; hue: number; pose: "idle" | "walk" | "sit" | "lie"; waveUntil: number; glowUntil: number };

export type LiveMeteor = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  length: number;
  wake: number;
  light: number;
  persistence: number;
  fireball: boolean;
  tint: "ice" | "mint" | "amber";
};

export type LiveOverlook = {
  render(ctx: CanvasRenderingContext2D, width: number, height: number, ms: number, peers: LivePeer[], count: number, meteors: LiveMeteor[]): boolean;
  dispose(): void;
};

export function createLiveOverlook(): LiveOverlook;
