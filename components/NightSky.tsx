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
  showStarNames: boolean;
  intro: boolean;
  theme: SkyTheme;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSpot: (x: number, y: number) => void;
  onSelectStar: (id: string) => void;
};

type Meteor = { x: number; y: number; vx: number; vy: number; length: number; born: number; life: number; bright: number; warm: boolean };
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

type RidgePoint = { x: number; height: number };
type RidgeConfig = { base: number; roughness: number; seed: number; profile: RidgePoint[]; top: string; bottom: string; opacity?: number };
const farRidge: RidgeConfig = {
  base: .846, roughness: .017, seed: 4.9, top: "#122534", bottom: "#071420",
  profile: [
    { x: -.12, height: .022 }, { x: .00, height: .037 },
    { x: .075, height: .050 }, { x: .14, height: .045 },
    { x: .19, height: .061 }, { x: .245, height: .074 },
    { x: .28, height: .105 }, { x: .295, height: .109 },
    { x: .325, height: .096 }, { x: .36, height: .071 },
    { x: .44, height: .056 }, { x: .49, height: .070 },
    { x: .555, height: .077 }, { x: .61, height: .058 },
    { x: .675, height: .063 }, { x: .72, height: .087 },
    { x: .758, height: .099 }, { x: .795, height: .077 },
    { x: .85, height: .064 }, { x: .89, height: .075 },
    { x: .95, height: .051 }, { x: 1.12, height: .039 },
  ],
};
const shoreRidge: RidgeConfig = {
  base: .941, roughness: .004, seed: 23.6, top: "#030d16", bottom: "#01050d",
  profile: [
    { x: -.12, height: .018 }, { x: .00, height: .026 },
    { x: .18, height: .018 }, { x: .31, height: .014 },
    { x: .47, height: .029 }, { x: .58, height: .022 },
    { x: .73, height: .015 }, { x: .85, height: .028 },
    { x: .93, height: .040 }, { x: 1.12, height: .020 },
  ],
};

function mountainHeight(t: number, cfg: RidgeConfig, reliefScale = 1) {
  // An irregular ridge spine with shoulders and saddles, like overlapping
  // mountain massifs. Cubic interpolation keeps the silhouette continuous;
  // layered terrain noise gives the skyline geological detail, not triangles.
  const points = cfg.profile;
  let i = 0;
  while (i < points.length - 2 && t > points[i + 1].x) i++;
  const left = points[i], right = points[i + 1];
  const width = right.x - left.x;
  const u = clamp((t - left.x) / width, 0, 1);
  const previous = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 2)];
  const m0 = (right.height - previous.height) / (right.x - previous.x) * width * .72;
  const m1 = (next.height - left.height) / (next.x - left.x) * width * .72;
  const u2 = u * u, u3 = u2 * u;
  const spine = (2 * u3 - 3 * u2 + 1) * left.height
    + (u3 - 2 * u2 + u) * m0
    + (-2 * u3 + 3 * u2) * right.height
    + (u3 - u2) * m1;
  const weatheredEdge =
    valueNoise(t * 5.1 + .3, cfg.seed) * .21 +
    valueNoise(t * 14.3, cfg.seed + 2) * .27 +
    valueNoise(t * 34.7, cfg.seed + 4) * .26 +
    valueNoise(t * 79.1, cfg.seed + 6) * .17 +
    valueNoise(t * 154.7, cfg.seed + 9) * .09;
  return cfg.base - (spine + weatheredEdge * cfg.roughness) * reliefScale;
}

function makeAmbientStars(w: number, h: number): AmbientStar[] {
  const random = rng(20261221);
  // All distinct light points live here (or in the GPU particle layer), so
  // none gets frozen into the backdrop image. The Milky Way has denser stars.
  const count = Math.max(520, Math.min(1450, Math.round(w * h / 780)));
  const stars: AmbientStar[] = [];
  for (let i = 0; i < count; i++) {
    const tint = random();
    const x = random() * w;
    const y = random() < .31
      ? clamp((milkyWayCenter(x / w) + (random() + random() + random() - 1.5) * .18) * h, h * .015, h * .77)
      : random() * h * .77;
    stars.push({
      x, y,
      radius: random() < .024 ? .85 + random() * .65 : .22 + random() * .43,
      alpha: .15 + Math.pow(random(), 2.1) * .68,
      speed: .13 + random() * .47,
      phase: random() * TAU,
      tint: tint < .17 ? "177,207,255" : tint < .27 ? "255,223,194" : "226,234,247",
    });
  }
  return stars;
}

// Star positions never change. Group the fine 2D backdrop points into a few
// cached plates rather than redrawing >1,000 rectangles and circles per frame.
// The foreground WebGL starfield still scintillates independently on the GPU.
function createAmbientLayers(w: number, h: number, dpr: number) {
  const layers = Array.from({ length: 4 }, () => document.createElement("canvas"));
  const painters = layers.map(layer => {
    layer.width = Math.max(1, Math.round(w * dpr));
    layer.height = Math.max(1, Math.round(h * dpr));
    const painter = layer.getContext("2d")!;
    painter.setTransform(dpr, 0, 0, dpr, 0, 0);
    return painter;
  });
  makeAmbientStars(w, h).forEach((star, i) => {
    const painter = painters[(i * 7 + Math.floor(star.phase * 1.73)) % painters.length];
    painter.fillStyle = `rgba(${star.tint},${star.alpha})`;
    if (star.radius < .72) painter.fillRect(star.x, star.y, Math.max(.55, star.radius * 1.4), Math.max(.55, star.radius * 1.4));
    else { painter.beginPath(); painter.arc(star.x, star.y, star.radius, 0, TAU); painter.fill(); }
  });
  return layers;
}

// Star positions change only when the sky is refreshed. Work out the nearest
// neighbours once instead of sorting all stars inside every animation frame.
function constellationLinks(stars: Star[], w: number, h: number): ConstellationLink[] {
  const links: ConstellationLink[] = [];
  const seen = new Set<string>();
  const addLink = (a: Star, b: Star, distSq: number) => {
    if (distSq < 144) return;
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ a, b, distance: Math.sqrt(distSq), key });
  };

  if (stars.length <= 24) {
    // A small shared sky must still form a constellation: the older near-
    // neighbor cutoff left widely spaced memories completely disconnected.
    // A minimum spanning tree keeps the shape open and avoids big triangles.
    const visited = new Set<number>(stars.length ? [0] : []);
    while (visited.size < stars.length) {
      let first = -1, second = -1, best = Infinity;
      for (const i of visited) for (let j = 0; j < stars.length; j++) {
        if (visited.has(j)) continue;
        const dx = (stars[i].x - stars[j].x) * w, dy = (stars[i].y - stars[j].y) * h;
        const distSq = dx * dx + dy * dy;
        if (distSq < best) { first = i; second = j; best = distSq; }
      }
      if (first < 0 || second < 0) break;
      visited.add(second);
      addLink(stars[first], stars[second], best);
    }
    return links;
  }

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
      addLink(a, stars[index], distSq);
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

// The atmosphere-lit core and tapered wake are painted just once. Moving
// these small sprites is substantially cheaper than making 4–6 gradients for
// every meteor on every frame, especially on mobile Safari.
const meteorSprites = new Map<string, HTMLCanvasElement>();
function meteorSprite(warm: boolean) {
  const key = warm ? "warm" : "cool";
  const cached = meteorSprites.get(key);
  if (cached) return cached;
  const surface = document.createElement("canvas");
  surface.width = 512;
  surface.height = 56;
  const g = surface.getContext("2d")!;
  const tail = warm ? "246,199,151" : "153,204,241";
  const core = warm ? "255,238,214" : "238,249,255";
  const streak = g.createLinearGradient(0, 0, 501, 0);
  streak.addColorStop(0, `rgba(${tail},0)`);
  streak.addColorStop(.30, `rgba(${tail},.035)`);
  streak.addColorStop(.62, `rgba(${tail},.15)`);
  streak.addColorStop(.84, `rgba(${tail},.48)`);
  streak.addColorStop(1, `rgba(${core},.92)`);
  g.lineCap = "round";
  for (const [width, alpha] of [[20, .22], [6, .48], [2, .86]] as const) {
    g.globalAlpha = alpha;
    g.strokeStyle = streak;
    g.lineWidth = width;
    g.beginPath(); g.moveTo(6, 28); g.lineTo(496, 28); g.stroke();
  }
  g.globalAlpha = 1;
  const head = g.createRadialGradient(496, 28, 0, 496, 28, 19);
  head.addColorStop(0, `rgba(${core},.86)`);
  head.addColorStop(.18, `rgba(${tail},.23)`);
  head.addColorStop(1, `rgba(${tail},0)`);
  g.fillStyle = head; g.fillRect(477, 9, 38, 38);
  g.fillStyle = `rgba(${core},.96)`;
  g.beginPath(); g.arc(496, 28, 2.1, 0, TAU); g.fill();
  meteorSprites.set(key, surface);
  return surface;
}

// Each hue gets two cached optical point-spread sprites. At 300–500 stars,
// redrawing multiple gradients per star on every frame stutters on phones.
const starSprites = new Map<string, HTMLCanvasElement>();
function starSprite(hue: number, highlighted: boolean) {
  const key = `${hue}-${highlighted}`;
  const cached = starSprites.get(key);
  if (cached) return cached;
  const surface = document.createElement("canvas");
  surface.width = surface.height = 54;
  const g = surface.getContext("2d")!;
  const x = 27, y = 27;
  const radius = highlighted ? 16 : 11;
  const aura = g.createRadialGradient(x, y, 0, x, y, radius);
  aura.addColorStop(0, `hsla(${hue},38%,98%,.96)`);
  aura.addColorStop(.075, `hsla(${hue},40%,90%,.52)`);
  aura.addColorStop(.28, `hsla(${hue},50%,83%,.105)`);
  aura.addColorStop(1, `hsla(${hue},50%,80%,0)`);
  g.fillStyle = aura; g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (highlighted) {
    // Very faint diffraction only for the selected/owned star.
    g.strokeStyle = `hsla(${hue},35%,94%,.19)`;
    g.lineWidth = .45;
    g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y);
    g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke();
  }
  g.fillStyle = "rgba(254,254,255,.97)";
  g.beginPath(); g.arc(x, y, highlighted ? 1.14 : .86, 0, TAU); g.fill();
  starSprites.set(key, surface);
  return surface;
}

function livingStar(ctx: CanvasRenderingContext2D, x: number, y: number, hue: number, time: number, seed: number, owned: boolean, selected: boolean, live: boolean, received: number) {
  // The point stays absolutely still. Only its luminosity scintillates slowly.
  const breath = .84 + Math.sin(time * .57 + seed * 12) * .095 + Math.sin(time * 1.19 + seed * 30) * .04;
  const sprite = starSprite(hue, owned || selected);
  ctx.globalAlpha = clamp(breath * (selected ? 1 : owned ? .98 : .89) * (1 + Math.min(5, received) * .035) * (live ? 1.06 : 1), 0, 1);
  ctx.drawImage(sprite, x - 27, y - 27);
  ctx.globalAlpha = 1;
}

const themePalettes: Record<SkyTheme, { sky: string[]; haze: string[]; water: string[] }> = {
  forest: { sky: ["#01040a", "#020813", "#061022", "#0e1b2c", "#162231", "#030913"], haze: ["86,107,133", "61,85,120", "144,126,106"], water: ["#0a1725", "#071321", "#010712"] },
  violet: { sky: ["#03040d", "#080a1c", "#13172d", "#22243a", "#23253a", "#060914"], haze: ["119,112,149", "96,104,148", "161,124,143"], water: ["#15182b", "#101427", "#030713"] },
  ocean: { sky: ["#01060b", "#03111c", "#092432", "#10363e", "#15323d", "#020a12"], haze: ["85,145,152", "62,122,146", "137,161,147"], water: ["#092831", "#08212e", "#020a13"] },
  dawn: { sky: ["#090711", "#130f22", "#292039", "#40364c", "#43313d", "#080b16"], haze: ["153,130,167", "128,121,165", "191,141,119"], water: ["#302339", "#201c2c", "#080b15"] },
};

function milkyWayCenter(u: number) {
  return .73 - .59 * u + Math.sin(u * 4.25 + .35) * .028;
}

function createBackdrop(w: number, h: number, theme: SkyTheme) {
  const palette = themePalettes[theme];
  const surface = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, w < 750 ? 1.85 : 1.7, Math.sqrt((w < 750 ? 1250000 : 2200000) / Math.max(1, w * h)));
  surface.width = Math.round(w * dpr);
  surface.height = Math.round(h * dpr);
  const g = surface.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, h);
  [0, .31, .55, .72, .85, 1].forEach((p, i) => sky.addColorStop(p, palette.sky[i]));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // Real dark-sky photographs have a nearly black zenith and a much softer
  // atmospheric glow near the horizon. Avoid the saturated neon cloud halos.
  g.save();
  g.globalCompositeOperation = "screen";
  halo(g, w * .47, h * .80, w * .57, `rgba(${palette.haze[0]},ALPHA)`, .065);
  halo(g, w * .87, h * .69, w * .39, `rgba(${palette.haze[1]},ALPHA)`, .048);
  halo(g, w * .14, h * .77, w * .34, `rgba(${palette.haze[2]},ALPHA)`, .033);
  g.restore();

  // The backdrop holds only atmospheric color. Putting star dots here would
  // leave them permanently static even as nearby GPU stars scintillate.
  return surface;
}

function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, config: RidgeConfig) {
  // Return to the older, asymmetric mountain ranges. Their varied saddles
  // read more naturally than the two large matching domes.
  const reliefScale = Math.min(1, w * 1.18 / h) * (w / h < .78 ? .76 : 1);
  const heightAt = (x: number) => mountainHeight(x / w, config, reliefScale) * h;
  ctx.save();
  ctx.globalAlpha = config.opacity ?? 1;
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 4; x += 3) ctx.lineTo(x, heightAt(x));
  ctx.lineTo(w, h); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, h * .55, 0, h);
  gradient.addColorStop(0, config.top);
  gradient.addColorStop(1, config.bottom);
  ctx.fillStyle = gradient; ctx.fill();
  ctx.clip();

  // Sparse erosion marks are barely perceptible at night.
  const seed = config.seed;
  for (let i = 0; i < 85; i++) {
    const x = hash1(i * 2, seed + 8) * w;
    const y = heightAt(x) + 6 + hash1(i, seed + 17) * 95;
    const slope = heightAt(x + 6) - heightAt(x - 6);
    const dx = clamp(slope * .8, -17, 17) + (hash1(i, seed + 23) - .5) * 8;
    const dy = 5 + hash1(i, seed + 31) * 27;
    ctx.strokeStyle = i % 3 === 0 ? "rgba(172,192,218,.028)" : "rgba(33,59,89,.085)";
    ctx.lineWidth = i % 4 === 0 ? .8 : .45;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.restore();

  // Real night-time ridgelines are defined by the darker mass against the
  // luminous sky, not by a synthetic glowing stroke around every peak.
}

function landscape(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, theme: SkyTheme) {
  const waterY = h * (w / h < .78 ? .864 : .835);
  // Faint atmospheric haze just behind the distant mountain peaks.
  const mist = ctx.createLinearGradient(0, h * .68, 0, h * .89);
  mist.addColorStop(0, "rgba(114,137,166,0)");
  mist.addColorStop(.68, "rgba(96,124,156,.053)");
  mist.addColorStop(1, "rgba(29,57,88,0)");
  ctx.fillStyle = mist; ctx.fillRect(0, h * .67, w, h * .24);
  ridge(ctx, w, h, farRidge);

  const lake = ctx.createLinearGradient(0, waterY, 0, h);
  const water = themePalettes[theme].water;
  lake.addColorStop(0, water[0]); lake.addColorStop(.45, water[1]); lake.addColorStop(1, water[2]);
  ctx.fillStyle = lake; ctx.fillRect(0, waterY, w, h - waterY);
  // Without a moon, the lake catches dispersed starlight rather than a
  // concentrated vertical reflection that would suggest an unseen light source.
  for (let i = 0; i < 65; i++) {
    const x = ((i * 73.71) % w), y = waterY + ((i * 17.3) % (h - waterY));
    const len = 4 + (i % 11) * 3;
    ctx.fillStyle = `rgba(${i % 4 ? '127,156,198' : '183,172,160'},${.015 + (Math.sin(t * .6 + i) + 1) * .019})`;
    ctx.fillRect(x + Math.sin(t * .45 + i * 3) * 8, y, len, .65);
  }

  ridge(ctx, w, h, shoreRidge);
  const treeRand = rng(88112);
  for (let i = 0; i < 58; i++) {
    const x = treeRand() * w;
    const d = treeRand();
    const y = h * (.835 + d * .15);
    const height = (2 + d * 13) * (w < 580 ? .65 : 1);
    ctx.strokeStyle = `rgba(2,12,23,${.22 + d * .48})`;
    ctx.lineWidth = .9 + d * 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - height); ctx.stroke();
    ctx.fillStyle = `rgba(2,13,25,${.24 + d * .45})`;
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

export default function NightSky({ stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, showStarNames, intro, theme, canvasRef, onSpot, onSelectStar }: Props) {
  const refs = useRef({ stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, showStarNames, intro, onSpot, onSelectStar });
  useEffect(() => { refs.current = { stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, showStarNames, intro, onSpot, onSelectStar }; }, [stars, glows, liveStarIds, myStarId, selectedId, placing, showerKey, showConstellations, showStarNames, intro, onSpot, onSelectStar]);
  const local = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const labelHits = useRef<{ id: string; x: number; y: number; width: number; height: number }[]>([]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let destroyed = false, frame = 0;
    let backdrop: HTMLCanvasElement | null = null;
    let terrainLayer: HTMLCanvasElement | null = null;
    let treeLayer: HTMLCanvasElement | null = null;
    let treeCtx: CanvasRenderingContext2D | null = null;
    let lastTreePaint = -Infinity;
    let ambientLayers: HTMLCanvasElement[] = [];
    let w = 0, h = 0, dpr = 1;
    const timeZero = performance.now();
    const meteors: Meteor[] = [];
    const random = rng(31027);
    // Pre-warm both meteor textures outside the animation loop.
    meteorSprite(false);
    meteorSprite(true);
    let nextMeteor = 8;
    let seenShower = refs.current.showerKey;
    let showerUntil = -1;
    let showerStartedAt = -1;
    let showerMeteorCount = 0;
    let lastPaint = 0;
    let drawnSky: Star[] | null = null;
    // Growth follows new memories with a slow physical response. A freshly
    // placed star should not make nine leaves pop into existence at once.
    let treeStarGrowth = refs.current.stars.length;
    let treeGlowGrowth = refs.current.glows.length;
    let drawnGlows: Glow[] | null = null;
    let drawnPresence: string[] | null = null;
    let cachedGlowCounts = new Map<string, number>();
    let cachedPresence = new Set<string>();
    let cachedLinks: ConstellationLink[] = [];
    let sharedStarLayers: HTMLCanvasElement[] = [];
    let layerPeople: Star[] | null = null;
    let layerGlows: Glow[] | null = null;
    let layerPresence: string[] | null = null;
    let layerOwner: string | null = null;
    let layerSelected: string | null = null;
    let constellationLayer: HTMLCanvasElement | null = null;
    let labelLayer: HTMLCanvasElement | null = null;
    let labelCacheKey = "";
    let labeledSky: Star[] | null = null;

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
        const fade = clamp(1 - distance / (Math.hypot(w, h) * .85), 0, 1);
        // A single translucent line reads like a quiet star chart. Avoid
        // dashed dots, doubled strokes and decorative beam effects.
        painter.strokeStyle = `rgba(184,211,238,${.23 + .15 * fade})`;
        painter.lineWidth = .92;
        painter.beginPath(); painter.moveTo(a.x * w, a.y * h); painter.lineTo(b.x * w, b.y * h); painter.stroke();
      }
      constellationLayer = layer;
    }

    function prepareLabels(people: Star[], myId: string | null, selected: string | null) {
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.round(w * dpr));
      layer.height = Math.max(1, Math.round(h * dpr));
      const painter = layer.getContext("2d");
      labelHits.current = [];
      if (!painter) { labelLayer = null; return; }
      painter.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fontSize = w < 750 ? 10.5 : 11;
      painter.font = `400 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;
      painter.textAlign = "center";
      painter.textBaseline = "middle";
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      const special = people.filter(s => s.id === selected || s.id === myId);
      const ordinary = people.filter(s => s.id !== selected && s.id !== myId);
      // Reserve the places of the selected and owned stars even when the
      // names layer is disabled: their names must always remain legible.
      for (const star of [...special, ...ordinary]) {
        const px = star.x * w, py = star.y * h;
        const textWidth = Math.min(112, painter.measureText(star.name).width);
        const width = textWidth + 14, height = 17;
        const x = clamp(px, width / 2 + 7, w - width / 2 - 7);
        const y = py + 19;
        if (y < 108 || y + height / 2 > h * .78) continue;
        const box = { x: x - width / 2, y: y - height / 2, width, height };
        const overlaps = occupied.some(b => box.x < b.x + b.width + 6 && box.x + box.width + 6 > b.x && box.y < b.y + b.height + 5 && box.y + box.height + 5 > b.y);
        if (overlaps && !special.includes(star)) continue;
        occupied.push(box);
        if (star.id === myId || star.id === selected) continue;
        painter.strokeStyle = "rgba(183,209,232,.24)";
        painter.lineWidth = .65;
        painter.beginPath(); painter.moveTo(px, py + 5); painter.lineTo(px, py + 9); painter.stroke();
        painter.shadowColor = "rgba(1,6,20,.98)";
        painter.shadowBlur = 6;
        painter.fillStyle = "rgba(219,230,241,.82)";
        painter.fillText(star.name, x, y, 112);
        painter.shadowBlur = 0;
        labelHits.current.push({ id: star.id, ...box });
      }
      labelLayer = layer;
    }

    function prepareSharedStars(people: Star[], myId: string | null, selected: string | null) {
      // A sky with hundreds of memories would otherwise ask Canvas2D to
      // draw hundreds of independent sprites every frame. Large skies use
      // three gently phase-shifted plates; focused stars stay fully dynamic.
      if (people.length <= 36) { sharedStarLayers = []; return; }
      const layers = sharedStarLayers.length === 3 ? sharedStarLayers : Array.from({ length: 3 }, () => document.createElement("canvas"));
      const painters = layers.map(layer => {
        const width = Math.max(1, Math.round(w * dpr));
        const height = Math.max(1, Math.round(h * dpr));
        if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
        const painter = layer.getContext("2d")!;
        painter.setTransform(dpr, 0, 0, dpr, 0, 0);
        painter.clearRect(0, 0, w, h);
        return painter;
      });
      for (let i = 0; i < people.length; i++) {
        const s = people[i];
        if (s.id === myId || s.id === selected) continue;
        const painter = painters[(i * 7) % painters.length];
        painter.globalAlpha = clamp(.89 * (1 + Math.min(5, cachedGlowCounts.get(s.id) ?? 0) * .035) * (cachedPresence.has(s.id) ? 1.06 : 1), 0, 1);
        painter.drawImage(starSprite(s.hue, false), s.x * w - 27, s.y * h - 27);
      }
      painters.forEach(painter => { painter.globalAlpha = 1; });
      sharedStarLayers = layers;
    }

    function resize() {
      if (!canvas || !ctx) return;
      w = canvas.clientWidth; h = canvas.clientHeight;
      // The phone camera is farther back, yet its fine lines remain crisp.
      // A backing-pixel budget keeps redraws affordable on older devices.
      dpr = Math.min(window.devicePixelRatio || 1, w < 750 ? 1.85 : 1.7, Math.sqrt((w < 750 ? 1250000 : 2200000) / Math.max(1, w * h)));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      local.current = { w, h };
      backdrop = createBackdrop(w, h, theme);
      terrainLayer = document.createElement("canvas");
      terrainLayer.width = canvas.width;
      terrainLayer.height = canvas.height;
      const terrainCtx = terrainLayer.getContext("2d");
      if (terrainCtx) { terrainCtx.setTransform(dpr, 0, 0, dpr, 0, 0); landscape(terrainCtx, w, h, 0, theme); }
      treeLayer = document.createElement("canvas");
      treeLayer.width = canvas.width;
      treeLayer.height = canvas.height;
      treeCtx = treeLayer.getContext("2d", { alpha: true });
      treeCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastTreePaint = -Infinity;
      ambientLayers = createAmbientLayers(w, h, dpr);
      drawnSky = null;
      layerPeople = null;
      labelCacheKey = "";
      labeledSky = null;
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    function spawnMeteor(t: number, bright = 1) {
      // Keep the whole flash visible in the actual phone viewport. Meteors
      // from one shower share an approximate direction, with slight variation.
      const x = w * (.34 + random() * .61);
      const y = h * (.20 + random() * .37);
      const speed = (w < 750 ? 175 : Math.min(390, Math.max(215, w * .30))) * (.86 + random() * .34);
      const angle = .32 + random() * .39;
      const fireball = bright > 1.1;
      meteors.push({
        x, y, vx: -speed * Math.cos(angle), vy: speed * Math.sin(angle),
        born: t,
        length: Math.min(w * .34, (57 + random() * 72) * (fireball ? 1.32 : 1)),
        life: fireball ? 1.42 + random() * .22 : .92 + random() * .32,
        bright, warm: random() > .91,
      });
    }

    function render(now: number) {
      if (destroyed || !ctx) return;
      if (w < 700 && now - lastPaint < 1000 / 30) {
        frame = requestAnimationFrame(render);
        return;
      }
      const deltaSeconds = lastPaint ? Math.min(.12, (now - lastPaint) / 1000) : .033;
      lastPaint = now;
      const t = (now - timeZero) / 1000;
      ctx.clearRect(0, 0, w, h);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, w, h);

      // Batched static point plates replace thousands of per-frame draws.
      // Different phase groups breathe only slightly; the independent WebGL
      // points above remain the main source of true individual scintillation.
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < ambientLayers.length; i++) {
        ctx.globalAlpha = .87 + .13 * Math.sin(t * (.27 + i * .08) + i * 2.37);
        ctx.drawImage(ambientLayers[i], 0, 0, w, h);
      }
      ctx.restore();

      if (terrainLayer) ctx.drawImage(terrainLayer, 0, 0, w, h);

      const growthEase = 1 - Math.exp(-deltaSeconds / 19);
      treeStarGrowth += (refs.current.stars.length - treeStarGrowth) * growthEase;
      treeGlowGrowth += (refs.current.glows.length - treeGlowGrowth) * growthEase;
      // Tree growth and motes change slowly. Reuse a transparent tree frame on
      // phones; the main starfield and moving meteors still refresh at 30 fps.
      if (treeLayer && treeCtx) {
        if (now - lastTreePaint >= (w < 750 ? 1000 / 17 : 1000 / 30)) {
          treeCtx.clearRect(0, 0, w, h);
          drawMemoryTree(treeCtx, w, h, t, treeStarGrowth, treeGlowGrowth);
          lastTreePaint = now;
        }
        ctx.drawImage(treeLayer, 0, 0, w, h);
      }

      if (refs.current.showerKey > seenShower) {
        seenShower = refs.current.showerKey;
        showerStartedAt = t;
        showerUntil = t + 18;
        nextMeteor = t;
        showerMeteorCount = 0;
        meteors.length = 0;
      }
      const isShower = t < showerUntil;
      if (t >= nextMeteor) {
        if (meteors.length < (w < 750 ? 2 : 3)) {
          if (isShower) {
            showerMeteorCount++;
            const isFireball = showerMeteorCount === 5 || showerMeteorCount === 12;
            spawnMeteor(t, isFireball ? 1.28 : .82 + random() * .18);
          } else spawnMeteor(t, .70);
        }
        nextMeteor = t + (isShower ? .67 + random() * .50 : 23 + random() * 15);
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        const age = t - m.born;
        if (age > m.life) { meteors.splice(i, 1); continue; }
        const px = m.x + age * m.vx, py = m.y + age * m.vy;
        // A quick flare, a readable flight, then a soft vanishing wake. Use
        // absolute elapsed time, so a slow frame never changes the trajectory.
        const fadeIn = clamp(age / .12, 0, 1);
        const fadeOut = clamp((m.life - age) / (m.life * .35), 0, 1);
        const envelope = fadeIn * fadeIn * (3 - 2 * fadeIn) * fadeOut * fadeOut * (3 - 2 * fadeOut);
        const len = m.length * clamp(age / .25, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = clamp(envelope * m.bright, 0, 1);
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(m.vy, m.vx));
        const height = m.bright > 1.1 ? 19 : 15;
        ctx.drawImage(meteorSprite(m.warm), -len, -height / 2, len, height);
        ctx.restore();
      }

      const { stars: people, glows: lights, liveStarIds: live, myStarId: myId, selectedId: selected } = refs.current;
      if (drawnSky !== people) prepareConstellations(people);
      const labelsKey = `${refs.current.showStarNames}:${myId ?? ""}:${selected ?? ""}`;
      if (labelCacheKey !== labelsKey || labeledSky !== people) {
        if (refs.current.showStarNames) prepareLabels(people, myId, selected);
        else { labelLayer = null; labelHits.current = []; }
        labeledSky = people;
        labelCacheKey = labelsKey;
      }
      if (drawnGlows !== lights) {
        drawnGlows = lights;
        cachedGlowCounts = new Map();
        for (const g of lights) cachedGlowCounts.set(g.toStarId, (cachedGlowCounts.get(g.toStarId) ?? 0) + 1);
      }
      if (drawnPresence !== live) { drawnPresence = live; cachedPresence = new Set(live); }
      if (layerPeople !== people || layerGlows !== lights || layerPresence !== live || layerOwner !== myId || layerSelected !== selected) {
        prepareSharedStars(people, myId, selected);
        layerPeople = people;
        layerGlows = lights;
        layerPresence = live;
        layerOwner = myId;
        layerSelected = selected;
      }
      ctx.save(); ctx.globalCompositeOperation = "screen";
      if (refs.current.showConstellations) {
        if (constellationLayer) ctx.drawImage(constellationLayer, 0, 0, w, h);
        // Only the selected star's existing straight connections become a
        // little brighter. Everything else stays in a cached, calm layer.
        if (selected) for (const { a, b, distance } of cachedLinks) {
          if (a.id !== selected && b.id !== selected) continue;
          const fade = clamp(1 - distance / (Math.hypot(w, h) * .85), 0, 1);
          ctx.strokeStyle = `rgba(201,226,248,${.44 + .12 * fade})`;
          ctx.lineWidth = 1.14;
          ctx.beginPath(); ctx.moveTo(a.x*w, a.y*h); ctx.lineTo(b.x*w, b.y*h); ctx.stroke();
        }
      }

      for (let i = 0; i < sharedStarLayers.length; i++) {
        ctx.globalAlpha = .91 + .09 * Math.sin(t * (.32 + i * .11) + i * 2.37);
        ctx.drawImage(sharedStarLayers[i], 0, 0, w, h);
      }
      ctx.globalAlpha = 1;
      for (const s of people) {
        const x = s.x * w, y = s.y * h;
        const mine = s.id === myId, picked = s.id === selected, isLive = cachedPresence.has(s.id);
        if (sharedStarLayers.length && !mine && !picked) continue;
        livingStar(ctx, x, y, s.hue, t, s.x + s.y * 2.4, mine, picked, isLive, cachedGlowCounts.get(s.id) ?? 0);
        if ((mine || picked) && !refs.current.intro) {
          ctx.globalCompositeOperation = "source-over";
          ctx.font = `${mine ? '500' : '400'} 11px -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(238,235,255,.88)";
          ctx.shadowColor = "rgba(3,7,22,.9)"; ctx.shadowBlur = 8;
          ctx.fillText(s.name, clamp(x, 50, w - 50), y + 19, Math.min(150, w * .4));
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = "screen";
        }
      }
      if (refs.current.showStarNames && !refs.current.placing && !refs.current.intro && labelLayer) {
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(labelLayer, 0, 0, w, h);
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
      if (refs.current.showStarNames && !refs.current.intro) {
        const hit = labelHits.current.findLast(b => (e.clientX - rect.left) >= b.x - 4 && (e.clientX - rect.left) <= b.x + b.width + 4 && (e.clientY - rect.top) >= b.y - 6 && (e.clientY - rect.top) <= b.y + b.height + 6);
        if (hit) { refs.current.onSelectStar(hit.id); return; }
      }
      const { w, h } = local.current;
      const nearest = refs.current.stars.map((s) => ({ s, d: Math.hypot((s.x - x) * w, (s.y - y) * h) })).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 37) refs.current.onSelectStar(nearest.s.id);
    }}
  />;
}
