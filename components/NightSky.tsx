"use client";

import { useEffect, useRef } from "react";
import { drawMemoryTree } from "./MemoryTree";

export type Star = { id: string; name: string; x: number; y: number; hue: number; createdAt: number };
export type Glow = { toStarId: string; createdAt: number };
type SkyTheme = "forest" | "violet" | "ocean" | "dawn";

type Props = {
  stars: Star[];
  glows: Glow[];
  liveStarIds: string[];
  myStarId: string | null;
  selectedId: string | null;
  placing: boolean;
  showerKey: number;
  showConstellations: boolean;
  theme: SkyTheme;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSpot: (x: number, y: number) => void;
  onSelectStar: (id: string) => void;
};

type Meteor = { x: number; y: number; vx: number; vy: number; length: number; born: number; life: number; bright: number; warmth: number; seed: number };
type AmbientStar = { x: number; y: number; radius: number; alpha: number; speed: number; phase: number; tint: string };
type ConstellationLink = { a: Star; b: Star; distance: number; key: string };

const TAU = Math.PI * 2;
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const fract = (v: number) => v - Math.floor(v);
function hash1(n: number, seed: number) { return fract(Math.sin(n * 127.1 + seed * 311.7) * 43758.5453123); }
function valueNoise(x: number, seed: number) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i, seed) + (hash1(i + 1, seed) - hash1(i, seed)) * u) * 2 - 1;
}

type Peak = { x: number; width: number; height: number; left?: number; right?: number };
type RidgeConfig = { base: number; roughness: number; seed: number; peaks: Peak[]; top: string; bottom: string; opacity?: number };
const farRidge: RidgeConfig = {
  base: .783, roughness: .052, seed: 4.9, top: "#364260", bottom: "#14253f", opacity: .91,
  peaks: [
    { x: .10, width: .13, height: .057, left: 1.1, right: .8 },
    { x: .275, width: .125, height: .116, left: 1.38, right: .80 },
    { x: .50, width: .12, height: .045, left: 1.0, right: 1.25 },
    { x: .64, width: .125, height: .067, left: 1.06, right: 1.1 },
    { x: .85, width: .14, height: .089, left: 1.25, right: .78 },
  ],
};
const middleRidge: RidgeConfig = {
  base: .837, roughness: .043, seed: 12.7, top: "#233451", bottom: "#081a31",
  peaks: [
    { x: .055, width: .13, height: .068, left: .75, right: 1.38 },
    { x: .37, width: .15, height: .089, left: 1.42, right: .87 },
    { x: .68, width: .135, height: .105, left: .91, right: 1.26 },
    { x: .94, width: .11, height: .057, left: 1.4, right: .8 },
  ],
};
const shoreRidge: RidgeConfig = {
  base: .910, roughness: .012, seed: 23.6, top: "#0b1a2a", bottom: "#010813",
  peaks: [
    { x: .04, width: .18, height: .025 },
    { x: .47, width: .23, height: .021 },
    { x: .91, width: .18, height: .033 },
  ],
};

function mountainHeight(t: number, cfg: RidgeConfig) {
  // Overlapping, asymmetric Gaussian swells avoid the triangular peak seams
  // created by max() and fractional-power wedges. Terrain noise remains low.
  const naturalUndulation =
    valueNoise(t * 1.5 + .7, cfg.seed) * .58 +
    valueNoise(t * 4.3, cfg.seed + 2) * .28 +
    valueNoise(t * 11.7, cfg.seed + 4) * .23 +
    valueNoise(t * 29.1, cfg.seed + 6) * .085 +
    valueNoise(t * 63.7, cfg.seed + 11) * .028;
  let elevation = 0;
  for (const p of cfg.peaks) {
    const width = t < p.x ? p.width * (p.left ?? 1) : p.width * (p.right ?? 1);
    const distance = (t - p.x) / width;
    elevation += p.height * Math.exp(-2.65 * distance * distance);
  }
  return cfg.base + cfg.roughness * naturalUndulation - elevation;
}

function makeAmbientStars(w: number, h: number): AmbientStar[] {
  const random = rng(20261221);
  const count = Math.max(680, Math.min(1700, Math.round(w * h / 700)));
  const stars: AmbientStar[] = [];
  for (let i = 0; i < count; i++) {
    const tint = random();
    stars.push({
      x: random() * w, y: random() * h * .79,
      radius: random() < .036 ? .95 + random() * .72 : .24 + random() * .56,
      alpha: .13 + Math.pow(random(), 2.15) * .75,
      speed: .28 + random() * .82,
      phase: random() * TAU,
      tint: tint < .18 ? "161,206,255" : tint < .33 ? "240,197,228" : "232,239,255",
    });
  }
  return stars;
}

// Star positions change only when the sky is refreshed. Work out the nearest
// neighbours once instead of sorting all stars inside every animation frame.
function constellationLinks(stars: Star[], w: number, h: number): ConstellationLink[] {
  const links: ConstellationLink[] = [];
  const seen = new Set<string>();
  const limitSq = (Math.min(w, h) * .38) ** 2;
  for (let i = 0; i < stars.length; i++) {
    const a = stars[i];
    let closest = -1, second = -1, d1 = Infinity, d2 = Infinity;
    for (let j = 0; j < stars.length; j++) {
      if (i === j) continue;
      const b = stars[j];
      const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h;
      const distSq = dx * dx + dy * dy;
      if (distSq < d1) { second = closest; d2 = d1; closest = j; d1 = distSq; }
      else if (distSq < d2) { second = j; d2 = distSq; }
    }
    for (const [index, distSq] of [[closest, d1], [second, d2]]) {
      if (index < 0 || distSq > limitSq || distSq < 225) continue;
      const b = stars[index];
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a, b, distance: Math.sqrt(distSq), key });
    }
  }
  return links;
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, opacity: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color.replace("ALPHA", String(opacity)));
  g.addColorStop(.36, color.replace("ALPHA", String(opacity * .25)));
  g.addColorStop(1, color.replace("ALPHA", "0"));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function livingStar(ctx: CanvasRenderingContext2D, x: number, y: number, hue: number, time: number, seed: number, owned: boolean, selected: boolean, live: boolean, received: number) {
  const breath = .75 + Math.sin(time * .78 + seed * 12) * .11 + Math.sin(time * 1.39 + seed * 30) * .085;
  const energy = (selected ? 1.15 : owned ? 1 : .76) * (1 + Math.min(5, received) * .055);
  const size = (owned || selected ? 22 : 17) * energy;
  const aura = ctx.createRadialGradient(x, y, 0, x, y, size * 2.1);
  aura.addColorStop(0, `hsla(${hue},90%,95%,${.61 * breath})`);
  aura.addColorStop(.07, `hsla(${hue},94%,82%,${.34 * breath})`);
  aura.addColorStop(.20, `hsla(${hue},96%,69%,${.105 * breath})`);
  aura.addColorStop(.48, `hsla(${hue},96%,61%,${.025 * breath})`);
  aura.addColorStop(1, `hsla(${hue},96%,61%,0)`);
  ctx.fillStyle = aura;
  ctx.fillRect(x - size * 2.1, y - size * 2.1, size * 4.2, size * 4.2);

  const spikes = [
    { x: 1, y: .11, length: 11.3, width: .48, opacity: .45 },
    { x: -.055, y: 1, length: 8.2, width: .46, opacity: .32 },
    { x: .72, y: .69, length: 4.9, width: .35, opacity: .15 },
  ];
  for (const beam of spikes) {
    const length = beam.length * energy * (.90 + .15 * Math.sin(time * .61 + seed * 4));
    const dx = beam.x * length, dy = beam.y * length;
    const gradient = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
    gradient.addColorStop(0, `hsla(${hue},94%,88%,0)`);
    gradient.addColorStop(.44, `hsla(${hue},94%,88%,${beam.opacity * breath * .32})`);
    gradient.addColorStop(.5, `hsla(${hue},94%,97%,${beam.opacity * breath})`);
    gradient.addColorStop(.56, `hsla(${hue},94%,88%,${beam.opacity * breath * .32})`);
    gradient.addColorStop(1, `hsla(${hue},94%,88%,0)`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = beam.width;
    ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.fillStyle = "rgba(251,253,255,.97)";
  ctx.beginPath(); ctx.arc(x, y, (owned || selected ? 1.45 : 1.12) * breath, 0, TAU); ctx.fill();

  if (live) {
    // Shared presence is a slow pulse of scattered light, not an enclosing ring.
    for (let i = 0; i < 4; i++) {
      const a = time * .21 + seed * 7 + i * 1.618;
      const r = 9 + (i % 2) * 7 + Math.sin(time * .43 + i) * 1.5;
      ctx.fillStyle = `hsla(${hue},94%,88%,${.13 + .10 * Math.sin(time + i) ** 2})`;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * .66, .35 + i % 2 * .18, 0, TAU); ctx.fill();
    }
  }
}

const themePalettes: Record<SkyTheme, { sky: string[]; haze: string[]; water: string[] }> = {
  forest: { sky: ["#020a1c", "#0a1231", "#151d42", "#27314f", "#0a172e", "#020b18"], haze: ["94,62,182", "31,101,180", "246,138,113"], water: ["#101e32", "#091a2a", "#020b17"] },
  violet: { sky: ["#07051d", "#170b37", "#2c174d", "#3b255e", "#181432", "#080b1d"], haze: ["180,75,202", "86,89,219", "235,124,183"], water: ["#231832", "#170e27", "#07091a"] },
  ocean: { sky: ["#020d1b", "#06243d", "#103a51", "#1c5464", "#0b293a", "#03101d"], haze: ["48,159,173", "36,119,196", "114,210,193"], water: ["#0b3443", "#072b36", "#02131f"] },
  dawn: { sky: ["#0c0a24", "#221636", "#47304d", "#76516b", "#3b2d45", "#0f1426"], haze: ["196,101,171", "120,109,213", "255,170,115"], water: ["#493148", "#251e36", "#0d1122"] },
};

function createBackdrop(w: number, h: number, theme: SkyTheme) {
  const palette = themePalettes[theme];
  const surface = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  surface.width = Math.round(w * dpr);
  surface.height = Math.round(h * dpr);
  const g = surface.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, h);
  [0, .31, .55, .72, .85, 1].forEach((p, i) => sky.addColorStop(p, palette.sky[i]));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // The light and cloud fields are drawn procedurally; no photographic background assets.
  g.globalCompositeOperation = "screen";
  halo(g, w * .74, h * .47, w * .45, `rgba(${palette.haze[0]},ALPHA)`, .20);
  halo(g, w * .27, h * .32, w * .54, `rgba(${palette.haze[1]},ALPHA)`, .21);
  halo(g, w * .52, h * .70, w * .42, `rgba(${palette.haze[2]},ALPHA)`, .16);
  const random = rng(20261113);

  for (let i = 0; i < 108; i++) {
    const t = random() * 1.25 - .1;
    const x = t * w;
    const y = (.13 + t * .43 + Math.sin(t * 4.3) * .07) * h;
    const offset = (random() - .5) * h * .25;
    const size = (22 + random() * 70) * Math.min(w / 700, 1.3) + 27;
    const tone = random();
    halo(g, x, y + offset, size, tone < .36 ? "rgba(100,104,221,ALPHA)" : tone < .72 ? "rgba(40,149,186,ALPHA)" : "rgba(199,84,148,ALPHA)", .018 + random() * .043);
  }

  // A slightly tilted Milky Way, with scattered distant dust and dense stellar knots.
  for (let i = 0; i < 6200; i++) {
    const x = random() * w;
    const xNorm = x / w;
    const pathY = (.085 + xNorm * .42 + Math.sin(xNorm * 4.6) * .065) * h;
    const spread = (random() + random() + random() - 1.5) * h * .20;
    const y = pathY + spread;
    if (y < 0 || y > h * .76) continue;
    const a = .02 + Math.pow(random(), 2) * .45;
    const r = random() < .012 ? 1.25 : .22 + random() * .55;
    const tint = random();
    g.fillStyle = tint < .2 ? `rgba(239,184,223,${a})` : tint < .48 ? `rgba(122,205,245,${a})` : `rgba(230,227,255,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // Individual foreground stars are animated in render(), not baked into this image.
  g.globalCompositeOperation = "source-over";
  return surface;
}

function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, config: RidgeConfig) {
  ctx.save();
  ctx.globalAlpha = config.opacity ?? 1;
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 4; x += 3) ctx.lineTo(x, mountainHeight(x / w, config) * h);
  ctx.lineTo(w, h); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, h * .55, 0, h);
  gradient.addColorStop(0, config.top);
  gradient.addColorStop(1, config.bottom);
  ctx.fillStyle = gradient; ctx.fill();
  ctx.clip();

  // Terrain facets follow the mountains' slopes instead of horizontal repeating dashes.
  const seed = config.seed;
  for (let i = 0; i < 215; i++) {
    const x = hash1(i * 2, seed + 8) * w;
    const y = mountainHeight(x / w, config) * h + 6 + hash1(i, seed + 17) * 95;
    const slope = (mountainHeight((x + 6) / w, config) - mountainHeight((x - 6) / w, config)) * h;
    const dx = clamp(slope * .8, -17, 17) + (hash1(i, seed + 23) - .5) * 8;
    const dy = 5 + hash1(i, seed + 31) * 27;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(172,192,218,.058)" : "rgba(33,59,89,.14)";
    ctx.lineWidth = i % 4 === 0 ? .8 : .45;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(173,190,222,${config.seed < 6 ? .09 : .045})`;
  ctx.lineWidth = .6;
  ctx.beginPath();
  for (let x = 0; x <= w + 4; x += 3) {
    const y = mountainHeight(x / w, config) * h;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}

function landscape(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, theme: SkyTheme) {
  const waterY = h * .835;
  // Faint atmospheric haze just behind the distant mountain peaks.
  const mist = ctx.createLinearGradient(0, h * .68, 0, h * .89);
  mist.addColorStop(0, "rgba(139,139,193,0)");
  mist.addColorStop(.68, "rgba(114,134,180,.115)");
  mist.addColorStop(1, "rgba(29,57,88,0)");
  ctx.fillStyle = mist; ctx.fillRect(0, h * .67, w, h * .24);
  ridge(ctx, w, h, farRidge);
  ridge(ctx, w, h, middleRidge);

  const lake = ctx.createLinearGradient(0, waterY, 0, h);
  const water = themePalettes[theme].water;
  lake.addColorStop(0, water[0]); lake.addColorStop(.45, water[1]); lake.addColorStop(1, water[2]);
  ctx.fillStyle = lake; ctx.fillRect(0, waterY, w, h - waterY);
  const moonX = w * .76;
  ctx.save(); ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 145; i++) {
    const p = i / 145, y = waterY + p * (h - waterY);
    const spread = 1 + p * 70;
    const half = (15 + Math.sin(i * 1.73 + t * 1.3) * spread) * (.4 + p);
    ctx.fillStyle = `rgba(${p < .4 ? '161,166,233' : '114,126,204'},${(.14 * (1 - p)) * (.3 + .7 * Math.sin(i * 4.33) ** 2)})`;
    ctx.fillRect(moonX - half, y, half * 2, .45 + Math.sin(i * 1.2) ** 2 * .7);
  }
  ctx.restore();
  for (let i = 0; i < 100; i++) {
    const x = ((i * 73.71) % w), y = waterY + ((i * 17.3) % (h - waterY));
    const len = 4 + (i % 11) * 3;
    ctx.fillStyle = `rgba(${i % 4 ? '127,156,198' : '228,156,151'},${.025 + (Math.sin(t * .6 + i) + 1) * .025})`;
    ctx.fillRect(x + Math.sin(t * .45 + i * 3) * 8, y, len, .65);
  }

  // The foreground shore and countless individual trees create a readable scale.
  ridge(ctx, w, h, shoreRidge);
  const treeRand = rng(88112);
  for (let i = 0; i < 155; i++) {
    const x = treeRand() * w;
    const d = treeRand();
    const y = h * (.835 + d * .15);
    const height = (3 + d * 19) * (w < 580 ? .65 : 1);
    ctx.strokeStyle = `rgba(2,12,23,${.36 + d * .6})`;
    ctx.lineWidth = 1.4 + d * 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - height); ctx.stroke();
    ctx.fillStyle = `rgba(2,13,25,${.45 + d * .48})`;
    for (let j = 0; j < 4; j++) {
      const yy = y - height * (.36 + j * .17);
      const ww = height * (.39 - j * .07);
      ctx.beginPath(); ctx.moveTo(x, yy - height * .23); ctx.lineTo(x - ww, yy + height * .20); ctx.lineTo(x + ww, yy + height * .20); ctx.closePath(); ctx.fill();
    }
  }
  const bottom = ctx.createLinearGradient(0, h * .91, 0, h);
  bottom.addColorStop(0, "rgba(1,5,14,0)"); bottom.addColorStop(1, "rgba(1,5,14,.9)");
  ctx.fillStyle = bottom; ctx.fillRect(0, h * .91, w, h * .09);
}

export default function NightSky({ stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, theme, canvasRef, onSpot, onSelectStar }: Props) {
  const refs = useRef({ stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, onSpot, onSelectStar });
  useEffect(() => { refs.current = { stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, onSpot, onSelectStar }; }, [stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, onSpot, onSelectStar]);
  const local = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let destroyed = false, frame = 0;
    let backdrop: HTMLCanvasElement | null = null;
    let ambientStars: AmbientStar[] = [];
    let w = 0, h = 0, dpr = 1;
    let timeZero = performance.now();
    const meteors: Meteor[] = [];
    const random = rng(31027);
    let nextMeteor = 2.5;
    let seenShower = 0;
    let showerUntil = -1;
    let showerStartedAt = -1;
    let finalFireballSent = false;
    let lastPaint = 0;
    let drawnSky: Star[] | null = null;
    let cachedLinks: ConstellationLink[] = [];
    let constellationLayer: HTMLCanvasElement | null = null;

    function prepareConstellations(people: Star[]) {
      drawnSky = people;
      cachedLinks = constellationLinks(people, w, h);
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.round(w * dpr));
      layer.height = Math.max(1, Math.round(h * dpr));
      const painter = layer.getContext("2d");
      if (!painter) { constellationLayer = null; return; }
      painter.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const { a, b, distance } of cachedLinks) {
        const fade = 1 - distance / (Math.min(w, h) * .38);
        const alpha = .075 + .12 * fade;
        const beam = painter.createLinearGradient(a.x * w, a.y * h, b.x * w, b.y * h);
        beam.addColorStop(0, `rgba(143,195,246,${alpha})`);
        beam.addColorStop(.5, `rgba(205,176,251,${alpha * .35})`);
        beam.addColorStop(1, `rgba(143,195,246,${alpha})`);
        painter.strokeStyle = beam;
        painter.lineWidth = .55;
        painter.beginPath(); painter.moveTo(a.x * w, a.y * h); painter.lineTo(b.x * w, b.y * h); painter.stroke();
      }
      constellationLayer = layer;
    }

    function resize() {
      if (!canvas || !ctx) return;
      w = canvas.clientWidth; h = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, w < 580 ? 1.3 : 1.7);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      local.current = { w, h };
      backdrop = createBackdrop(w, h, theme);
      ambientStars = makeAmbientStars(w, h);
      drawnSky = null;
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    function spawnMeteor(t: number, bright = 1) {
      const x = w * (.29 + random() * .84), y = h * (.06 + random() * .42);
      const velocity = Math.max(125, Math.min(w, h) * .23) + random() * 115;
      const slope = .31 + random() * .17;
      meteors.push({
        x, y, vx: -velocity * .96, vy: velocity * slope,
        born: t, length: Math.min(w * .66, (95 + random() * 115) * (bright > 1.1 ? 1.22 : 1)),
        life: 2.0 + random() * .9,
        bright, warmth: random(), seed: random() * 100,
      });
    }

    function render(now: number) {
      if (destroyed || !ctx) return;
      if (w < 700 && now - lastPaint < 1000 / 30) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastPaint = now;
      const t = (now - timeZero) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, w, h);

      // Every visible foreground star breathes at its own pace, as real starlight does.
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (const star of ambientStars) {
        const breath = clamp(.79 + .18 * Math.sin(t * star.speed + star.phase) + .08 * Math.sin(t * star.speed * .37 + star.phase * 1.9), .51, 1.05);
        const alpha = star.alpha * breath;
        ctx.fillStyle = `rgba(${star.tint},${alpha})`;
        if (star.radius < .72) {
          ctx.fillRect(star.x, star.y, Math.max(.55, star.radius * 1.4), Math.max(.55, star.radius * 1.4));
        } else {
          ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();

      ctx.save(); ctx.globalCompositeOperation = "screen";
      // Slow, translucent curtains drifting across the distant sky.
      for (let ribbon = 0; ribbon < 3; ribbon++) {
        const x0 = -.24 * w, y0 = (.22 + ribbon * .09) * h;
        const grad = ctx.createLinearGradient(0, y0 - h * .13, 0, y0 + h * .30);
        grad.addColorStop(0, "rgba(76,126,208,0)");
        grad.addColorStop(.33, ribbon % 2 ? "rgba(109,77,183,.024)" : "rgba(49,145,154,.023)");
        grad.addColorStop(.6, ribbon % 2 ? "rgba(152,82,177,.016)" : "rgba(72,120,210,.020)");
        grad.addColorStop(1, "rgba(63,110,154,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let x = 0; x <= w + w * .25; x += 16) {
          const f = x / w;
          ctx.lineTo(x, y0 + Math.sin(f * 4.5 + t * .075 + ribbon) * 29 + f * h * .14);
        }
        for (let x = w + w * .25; x >= x0; x -= 16) {
          const f = x / w;
          ctx.lineTo(x, y0 + h * .23 + Math.sin(f * 3.7 + t * .07 + ribbon + .6) * 44 + f * h * .12);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Subtle moon halo and a small, sharp lunar disk.
      const mx = w * .77, my = h * .245;
      ctx.save(); ctx.globalCompositeOperation = "screen";
      halo(ctx, mx, my, Math.min(w, h) * .19, "rgba(183,194,252,ALPHA)", .095);
      halo(ctx, mx, my, Math.min(w, h) * .066, "rgba(220,230,255,ALPHA)", .12);
      ctx.fillStyle = "rgba(224,232,255,.76)";
      ctx.beginPath(); ctx.arc(mx, my, Math.max(2.6, Math.min(w, h) * .0065), 0, TAU); ctx.fill();
      ctx.restore();

      landscape(ctx, w, h, t, theme);

      drawMemoryTree(ctx, w, h, t, refs.current.stars.length, refs.current.glows.length);

      if (refs.current.showerKey > seenShower) {
        seenShower = refs.current.showerKey;
        showerStartedAt = t;
        showerUntil = t + 22;
        nextMeteor = t;
        finalFireballSent = false;
      }
      const isShower = t < showerUntil;
      if (isShower && !finalFireballSent && t - showerStartedAt > 12.5) {
        spawnMeteor(t, 1.16);
        finalFireballSent = true;
      }
      if (t > nextMeteor) {
        const progress = isShower ? clamp((t - showerStartedAt) / 22, 0, 1) : 0;
        const intensity = isShower ? .68 + .32 * Math.sin(Math.PI * progress) : 0;
        spawnMeteor(t, isShower ? .77 + random() * .30 : .55);
        nextMeteor = t + (isShower ? (.56 + random() * .65) / intensity : 13 + random() * 17);
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        const age = t - m.born;
        if (age > m.life) { meteors.splice(i, 1); continue; }
        const px = m.x + age * m.vx, py = m.y + age * m.vy;
        const alpha = Math.pow(Math.sin(Math.PI * age / m.life), .85) * m.bright;
        const len = m.length * clamp(age / .48, 0, 1);
        const dist = Math.hypot(m.vx, m.vy);
        const tailX = px - (m.vx / dist) * len, tailY = py - (m.vy / dist) * len;
        ctx.save(); ctx.globalCompositeOperation = "screen";
        ctx.lineCap = "round";
        const warm = m.warmth > .79;
        const coreColor = warm ? "255,226,202" : "225,246,255";
        const tailColor = warm ? "251,169,141" : "103,190,244";
        for (const layer of [
          { width: 4.7, power: .13 },
          { width: 1.1, power: .78 },
        ]) {
          const stroke = ctx.createLinearGradient(px, py, tailX, tailY);
          stroke.addColorStop(0, `rgba(${coreColor},${clamp(alpha * layer.power, 0, 1)})`);
          stroke.addColorStop(.18, `rgba(${tailColor},${clamp(alpha * layer.power * .69, 0, 1)})`);
          stroke.addColorStop(.62, `rgba(${tailColor},${clamp(alpha * layer.power * .16, 0, 1)})`);
          stroke.addColorStop(1, `rgba(${tailColor},0)`);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = layer.width * (m.bright > 1.1 ? 1.13 : 1);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tailX, tailY); ctx.stroke();
        }
        halo(ctx, px, py, 8 + m.bright * 8, warm ? "rgba(255,206,173,ALPHA)" : "rgba(166,225,255,ALPHA)", clamp(alpha * .36, 0, .6));
        for (let p = 1; p <= 6; p++) {
          const u = p / 7;
          const drift = Math.sin(m.seed * 13 + p * 3.5 + age * 1.4) * (1 + u * 3.2);
          const dx = (m.vy / dist) * drift;
          const dy = (-m.vx / dist) * drift;
          const tx = px + (tailX - px) * u + dx;
          const ty = py + (tailY - py) * u + dy;
          ctx.fillStyle = `rgba(${tailColor},${clamp(alpha * (1-u) * .23, 0, .45)})`;
          ctx.beginPath(); ctx.arc(tx, ty, .23 + ((p * 7 + Math.floor(m.seed * 10)) % 4) * .09, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }

      const { stars: people, glows: lights, liveStarIds: live, myStarId: myId, selectedId: selected } = refs.current;
      if (drawnSky !== people) prepareConstellations(people);
      const glowCounts = new Map<string, number>();
      for (const g of lights) glowCounts.set(g.toStarId, (glowCounts.get(g.toStarId) ?? 0) + 1);
      ctx.save(); ctx.globalCompositeOperation = "screen";
      if (refs.current.showConstellations) {
        if (constellationLayer) ctx.drawImage(constellationLayer, 0, 0, w, h);
        // Animate only the constellation currently being observed. The other
        // connections are a quiet cached layer and cost a single draw call.
        if (selected) for (const { a, b, distance, key } of cachedLinks) {
          if (a.id !== selected && b.id !== selected) continue;
          const lim = Math.min(w, h) * .38;
          const alpha = .33 + .18 * (1 - distance / lim);
          const beam = ctx.createLinearGradient(a.x*w, a.y*h, b.x*w, b.y*h);
          beam.addColorStop(0, `rgba(143,195,246,${alpha})`);
          beam.addColorStop(.5, `rgba(205,176,251,${alpha * .4})`);
          beam.addColorStop(1, `rgba(143,195,246,${alpha})`);
          ctx.strokeStyle = beam; ctx.lineWidth = .9;
          ctx.beginPath(); ctx.moveTo(a.x*w, a.y*h); ctx.lineTo(b.x*w, b.y*h); ctx.stroke();
          const keyPhase = key.charCodeAt(0) * .007;
          const flow = (t * .09 + keyPhase) % 1;
          const px = (a.x + (b.x - a.x) * flow) * w, py = (a.y + (b.y - a.y) * flow) * h;
          halo(ctx, px, py, 7, "rgba(167,211,255,ALPHA)", alpha * 1.5);
        }
      }

      for (const s of people) {
        const x = s.x * w, y = s.y * h;
        const mine = s.id === myId, picked = s.id === selected, isLive = live.includes(s.id);
        livingStar(ctx, x, y, s.hue, t, s.x + s.y * 2.4, mine, picked, isLive, glowCounts.get(s.id) ?? 0);
        if (mine || picked) {
          ctx.globalCompositeOperation = "source-over";
          ctx.font = `${mine ? '500' : '400'} 11px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(238,235,255,.88)";
          ctx.shadowColor = "rgba(3,7,22,.9)"; ctx.shadowBlur = 8;
          ctx.fillText(s.name, clamp(x, 50, w - 50), y - 19, Math.min(150, w * .4));
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = "screen";
        }
      }
      ctx.restore();

      if (refs.current.placing) {
        ctx.save();
        ctx.fillStyle = "rgba(1,8,24,.25)"; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(222,221,255,.16)"; ctx.lineWidth = 1;
        ctx.setLineDash([4, 10]);
        ctx.strokeRect(w * .07, h * .11, w * .86, h * .58);
        ctx.restore();
      }

      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => { destroyed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); };
  }, [canvasRef, theme]);

  return <canvas
    ref={canvasRef}
    className={`sky-canvas ${placing ? 'placing' : ''}`}
    aria-label="별빛과 은하수, 산과 호수가 펼쳐진 밤하늘. 자신의 별과 다른 친구의 별을 선택할 수 있습니다."
    onPointerUp={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (refs.current.placing) {
        if (x >= .07 && x <= .93 && y >= .11 && y <= .69) refs.current.onSpot(x, y);
        return;
      }
      const { w, h } = local.current;
      const nearest = refs.current.stars.map((s) => ({ s, d: Math.hypot((s.x - x) * w, (s.y - y) * h) })).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 37) refs.current.onSelectStar(nearest.s.id);
    }}
  />;
}
