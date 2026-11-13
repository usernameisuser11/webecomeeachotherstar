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

type RidgePoint = { x: number; height: number };
type RidgeConfig = { base: number; roughness: number; seed: number; profile: RidgePoint[]; top: string; bottom: string; opacity?: number };
const farRidge: RidgeConfig = {
  base: .803, roughness: .020, seed: 4.9, top: "#27394e", bottom: "#0c1928", opacity: .90,
  profile: [
    { x: -.12, height: .026 }, { x: .00, height: .047 },
    { x: .09, height: .064 }, { x: .17, height: .052 },
    { x: .23, height: .083 }, { x: .29, height: .137 },
    { x: .34, height: .101 }, { x: .41, height: .074 },
    { x: .50, height: .092 }, { x: .57, height: .068 },
    { x: .65, height: .093 }, { x: .72, height: .119 },
    { x: .79, height: .085 }, { x: .88, height: .105 },
    { x: .96, height: .073 }, { x: 1.12, height: .048 },
  ],
};
const middleRidge: RidgeConfig = {
  base: .860, roughness: .014, seed: 12.7, top: "#12263b", bottom: "#071322",
  profile: [
    { x: -.12, height: .037 }, { x: .00, height: .076 },
    { x: .06, height: .092 }, { x: .14, height: .058 },
    { x: .22, height: .045 }, { x: .29, height: .062 },
    { x: .38, height: .108 }, { x: .46, height: .073 },
    { x: .53, height: .058 }, { x: .60, height: .081 },
    { x: .69, height: .122 }, { x: .75, height: .090 },
    { x: .84, height: .066 }, { x: .90, height: .084 },
    { x: .97, height: .073 }, { x: 1.12, height: .047 },
  ],
};
const shoreRidge: RidgeConfig = {
  base: .920, roughness: .004, seed: 23.6, top: "#081725", bottom: "#01060f",
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
    valueNoise(t * 5.1 + .3, cfg.seed) * .40 +
    valueNoise(t * 14.3, cfg.seed + 2) * .33 +
    valueNoise(t * 34.7, cfg.seed + 4) * .18 +
    valueNoise(t * 79.1, cfg.seed + 6) * .09;
  return cfg.base - (spine + weatheredEdge * cfg.roughness) * reliefScale;
}

function makeAmbientStars(w: number, h: number): AmbientStar[] {
  const random = rng(20261221);
  // The static plate carries the faint stars. Only the comparatively bright
  // foreground points need animation, especially on lower-powered phones.
  const count = Math.max(340, Math.min(1050, Math.round(w * h / 1300)));
  const stars: AmbientStar[] = [];
  for (let i = 0; i < count; i++) {
    const tint = random();
    stars.push({
      x: random() * w, y: random() * h * .77,
      radius: random() < .024 ? .85 + random() * .65 : .22 + random() * .43,
      alpha: .15 + Math.pow(random(), 2.1) * .68,
      speed: .13 + random() * .47,
      phase: random() * TAU,
      tint: tint < .17 ? "177,207,255" : tint < .27 ? "255,223,194" : "226,234,247",
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
  forest: { sky: ["#01040a", "#020813", "#061022", "#0e1b2c", "#162231", "#030913"], haze: ["86,107,133", "61,85,120", "144,126,106"], water: ["#0a1725", "#071321", "#010712"] },
  violet: { sky: ["#03040d", "#080a1c", "#13172d", "#22243a", "#23253a", "#060914"], haze: ["119,112,149", "96,104,148", "161,124,143"], water: ["#15182b", "#101427", "#030713"] },
  ocean: { sky: ["#01060b", "#03111c", "#092432", "#10363e", "#15323d", "#020a12"], haze: ["85,145,152", "62,122,146", "137,161,147"], water: ["#092831", "#08212e", "#020a13"] },
  dawn: { sky: ["#090711", "#130f22", "#292039", "#40364c", "#43313d", "#080b16"], haze: ["153,130,167", "128,121,165", "191,141,119"], water: ["#302339", "#201c2c", "#080b15"] },
};

// Fast, deterministic two-dimensional value noise. The Milky Way is painted
// once at reduced resolution, never sampled per pixel during animation.
function hash2(x: number, y: number, seed: number) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise2(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a + (d - c - b + a) * ux) * uy;
}

function milkyWayCenter(u: number) {
  return .73 - .59 * u + Math.sin(u * 4.25 + .35) * .028;
}

function paintMilkyWay(g: CanvasRenderingContext2D, w: number, h: number, tint: string) {
  // Small luminous filaments and irregular gaps, rather than decorative
  // nebula bubbles. Portrait devices use a lower-resolution light plate.
  const sw = Math.max(100, Math.min(540, Math.round(w * .42)));
  const sh = Math.max(170, Math.min(440, Math.round(h * .42)));
  const plate = document.createElement("canvas");
  plate.width = sw; plate.height = sh;
  const pc = plate.getContext("2d", { alpha: true });
  if (!pc) return;
  const img = pc.createImageData(sw, sh);
  const [red, green, blue] = tint.split(",").map(Number);
  const mobileGain = w < 580 ? 1.22 : 1;
  for (let y = 0; y < sh; y++) {
    const v = y / sh;
    for (let x = 0; x < sw; x++) {
      const u = x / sw;
      const curl = (noise2(u * 4.6, v * 4.6, 13) - .5) * .105
        + (noise2(u * 12.6, v * 12.6, 24) - .5) * .019;
      const d = (v - milkyWayCenter(u) - curl) / .145;
      const envelope = Math.exp(-1.25 * d * d);
      if (envelope < .004) continue;
      const broad = noise2(u * 6.4 + 7, v * 6.4, 33);
      const knots = noise2(u * 20.5, v * 21.8, 39);
      const filaments = noise2(u * 46.5, v * 44.3, 51);
      const density = (.24 + .94 * broad * knots + .28 * filaments);
      const lane = Math.exp(-Math.pow((d - .06 - .14 * Math.sin(u * 9.7)) / .18, 2));
      const dust = lane * (.44 + .56 * noise2(u * 15.5, v * 18.7, 71));
      const luminous = envelope * Math.max(0, density - .48 * dust);
      const opacity = Math.min(102, luminous * 112 * mobileGain);
      const i = (y * sw + x) * 4;
      img.data[i] = red;
      img.data[i + 1] = green;
      img.data[i + 2] = blue;
      img.data[i + 3] = opacity;
    }
  }
  pc.putImageData(img, 0, 0);
  g.save();
  g.globalCompositeOperation = "screen";
  g.imageSmoothingEnabled = true;
  g.drawImage(plate, 0, 0, w, h);
  g.restore();
}

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

  // Real dark-sky photographs have a nearly black zenith and a much softer
  // atmospheric glow near the horizon. Avoid the saturated neon cloud halos.
  g.save();
  g.globalCompositeOperation = "screen";
  halo(g, w * .47, h * .80, w * .57, `rgba(${palette.haze[0]},ALPHA)`, .065);
  halo(g, w * .87, h * .69, w * .39, `rgba(${palette.haze[1]},ALPHA)`, .048);
  halo(g, w * .14, h * .77, w * .34, `rgba(${palette.haze[2]},ALPHA)`, .033);
  g.restore();

  // Milky Way clouds and dust lanes are generated directly on a small canvas.
  // No photograph, texture download, or static bitmap is used.
  const dustTint = theme === "ocean" ? "138,183,197" :
    theme === "dawn" ? "183,170,189" :
    theme === "violet" ? "168,164,203" : "157,180,211";
  paintMilkyWay(g, w, h, dustTint);

  const random = rng(20261113);
  const count = Math.max(950, Math.min(3100, Math.round(w * h / 460)));
  const mobileGain = w < 580 ? 1.30 : 1;
  for (let i = 0; i < count; i++) {
    const x = random() * w, y = random() * h * .80;
    const u = x / w, v = y / h;
    const band = Math.exp(-Math.pow((v - milkyWayCenter(u)) / .12, 2));
    const luminosity = Math.pow(random(), 3.5);
    const alpha = Math.min(.78, (.05 + luminosity * .47) * (1 + band * .25) * mobileGain);
    const r = .14 + random() * .38 + (luminosity > .91 ? .30 : 0);
    const hue = random();
    g.fillStyle = hue < .16 ? `rgba(177,207,246,${alpha})` :
      hue < .26 ? `rgba(246,221,192,${alpha})` : `rgba(232,236,246,${alpha})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }

  // Faint stars cluster along the Milky Way in a softly uneven band. They
  // remain tiny enough to read as distant light instead of confetti.
  const clusterCount = Math.max(900, Math.min(2600, Math.round(w * h / 410)));
  for (let i = 0; i < clusterCount; i++) {
    const u = random();
    const v = milkyWayCenter(u) + (random() + random() + random() - 1.5) * .27;
    if (v < .018 || v > .77) continue;
    const density = noise2(u * 18, v * 21, 83);
    if (random() > .30 + density * .62) continue;
    const x = u * w, y = v * h;
    const alpha = (.06 + Math.pow(random(), 3) * .27) * mobileGain;
    g.fillStyle = `rgba(219,229,244,${alpha})`;
    g.fillRect(x, y, .36 + random() * .47, .36 + random() * .47);
  }

  // A few unmistakably bright stars anchor the scene. Most of the sky stays
  // dark, and only these rare points receive a very restrained optical halo.
  for (let i = 0; i < Math.min(35, Math.max(13, Math.floor(w * h / 33000))); i++) {
    const x = (.035 + random() * .93) * w;
    const y = (.04 + random() * .71) * h;
    const power = .37 + random() * .36;
    halo(g, x, y, 7 + random() * 7, "rgba(191,214,250,ALPHA)", power * .17);
    g.fillStyle = `rgba(232,238,252,${power})`;
    g.beginPath(); g.arc(x, y, .55 + random() * .44, 0, TAU); g.fill();
  }
  return surface;
}

function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, config: RidgeConfig) {
  // Prevent portrait phones from turning a natural mountain into a steep spike.
  const reliefScale = Math.min(1, w * 1.18 / h);
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

  ctx.save();
  ctx.strokeStyle = `rgba(173,190,222,${config.seed < 6 ? .04 : .021})`;
  ctx.lineWidth = .6;
  ctx.beginPath();
  for (let x = 0; x <= w + 4; x += 3) {
    const y = heightAt(x);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.restore();
}

function landscape(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, theme: SkyTheme) {
  const waterY = h * .835;
  // Faint atmospheric haze just behind the distant mountain peaks.
  const mist = ctx.createLinearGradient(0, h * .68, 0, h * .89);
  mist.addColorStop(0, "rgba(114,137,166,0)");
  mist.addColorStop(.68, "rgba(96,124,156,.053)");
  mist.addColorStop(1, "rgba(29,57,88,0)");
  ctx.fillStyle = mist; ctx.fillRect(0, h * .67, w, h * .24);
  ridge(ctx, w, h, farRidge);
  ridge(ctx, w, h, middleRidge);

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

  // The foreground shore is nearly black; only a handful of distant trees
  // should remain visible in low light, avoiding a row of black pixel specks.
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

      // Slow scintillation, with a nearly constant baseline. Stars should not
      // pulse in unison or flash like a UI particle effect.
      ctx.save(); ctx.globalCompositeOperation = "screen";
      for (const star of ambientStars) {
        const breath = clamp(.88 + .085 * Math.sin(t * star.speed + star.phase) + .035 * Math.sin(t * star.speed * 1.7 + star.phase * 1.9), .73, 1.03);
        const alpha = star.alpha * breath;
        ctx.fillStyle = `rgba(${star.tint},${alpha})`;
        if (star.radius < .72) {
          ctx.fillRect(star.x, star.y, Math.max(.55, star.radius * 1.4), Math.max(.55, star.radius * 1.4));
        } else {
          ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, TAU); ctx.fill();
        }
      }
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
