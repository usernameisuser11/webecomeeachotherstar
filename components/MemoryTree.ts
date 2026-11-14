// An original luminous shoreline tree. The bark has a solid, irregular body;
// faint light travels in its veins and new foliage emerges with shared stars.
type BranchSegment = {
  sx: number; sy: number; cx: number; cy: number; ex: number; ey: number;
  depth: number; seed: number;
};
type TreeTip = { x: number; y: number; seed: number };
function makeTreeGeometry() {
  const segments: BranchSegment[] = [];
  const tips: TreeTip[] = [];
  const branch = (sx: number, sy: number, length: number, angle: number, depth: number, seed: number) => {
    const ex = sx + Math.sin(angle) * length;
    const ey = sy - Math.cos(angle) * length;
    // Off-centre curvature and unequal children prevent a synthetic fork.
    const cx = (sx + ex) * .5 + Math.sin(seed * 2.3) * length * .15;
    const cy = (sy + ey) * .5 + Math.cos(seed * 4.7) * length * .035;
    segments.push({ sx, sy, cx, cy, ex, ey, depth, seed });
    if (depth === 0) { tips.push({ x: ex, y: ey, seed }); return; }
    const divergence = .37 + Math.sin(seed * 5.4) * .08;
    branch(ex, ey, length * (.75 + Math.sin(seed * 8) * .034), angle - divergence, depth - 1, seed + 1.31);
    branch(ex, ey, length * (.70 + Math.cos(seed * 3) * .05), angle + divergence, depth - 1, seed + 2.17);
    if (depth > 2 && seed % 2 > 1) branch(ex, ey, length * .62, angle, depth - 2, seed + .4);
  };
  branch(0, 3, 47, .015, 5, 1.3);
  return { segments, tips };
}

const treeGeometry = makeTreeGeometry();
let canopyGlowSprite: HTMLCanvasElement | null = null;
function getCanopyGlowSprite() {
  if (canopyGlowSprite) return canopyGlowSprite;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const g = sprite.getContext("2d")!;
  const glow = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  glow.addColorStop(0, "rgba(157,232,220,.28)");
  glow.addColorStop(.30, "rgba(94,169,183,.11)");
  glow.addColorStop(.70, "rgba(54,103,131,.025)");
  glow.addColorStop(1, "rgba(54,103,131,0)");
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  canopyGlowSprite = sprite;
  return sprite;
}

function traceBranch(ctx: CanvasRenderingContext2D, s: BranchSegment) {
  ctx.beginPath();
  ctx.moveTo(s.sx, s.sy);
  ctx.quadraticCurveTo(s.cx, s.cy, s.ex, s.ey);
}

function branchPoint(s: BranchSegment, t: number) {
  const a = 1 - t;
  return { x: a * a * s.sx + 2 * a * t * s.cx + t * t * s.ex,
    y: a * a * s.sy + 2 * a * t * s.cy + t * t * s.ey };
}

export function drawMemoryTree(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, stars: number, glows: number) {
  const portrait = w / h < .78;
  const x = w * (portrait ? .58 : .55);
  // The portrait camera sits farther back: a smaller tree, slightly lower on
  // the horizon, leaves substantially more sky open for the constellation.
  const groundY = h * (portrait ? .863 : .844);
  const scale = Math.min(w * .00174, h * .00111) * (portrait ? 1.04 : 1.51);
  const luminance = Math.min(.61, .25 + Math.sqrt(Math.max(0, stars + glows * .25)) * .032);
  const leafCount = Math.min(470, 205 + stars * 9 + glows * 3);
  const slowGrowth = 1 - Math.exp(-time / 80);
  const memoryGrowth = 1 - Math.exp(-Math.max(0, stars + glows * .2) / 26);
  const maturity = .875 + slowGrowth * .075 + memoryGrowth * .05;
  const shootGrowth = .35 + slowGrowth * .35 + memoryGrowth * .30;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glowRadius = h * (portrait ? .086 : .12);
  const groundGlow = ctx.createRadialGradient(x, groundY, 0, x, groundY, glowRadius);
  groundGlow.addColorStop(0, `rgba(89,187,199,${.13 + luminance * .17})`);
  groundGlow.addColorStop(.43, `rgba(50,92,153,${.055 + luminance * .08})`);
  groundGlow.addColorStop(1, "rgba(21,67,109,0)");
  ctx.fillStyle = groundGlow;
  ctx.fillRect(x - glowRadius, groundY - glowRadius, glowRadius * 2, glowRadius * 1.83);
  ctx.translate(x, groundY);
  ctx.scale(scale, scale);
  const { segments, tips } = treeGeometry;
  ctx.lineCap = "round";

  // 1. The bark must occlude the background. Drawing it in screen mode used
  // to make the whole tree look like flat glowing wires.
  ctx.globalCompositeOperation = "source-over";
  for (const segment of segments) {
    traceBranch(ctx, segment);
    ctx.strokeStyle = segment.depth >= 3 ? "rgba(4,18,26,.95)" : "rgba(10,28,34,.90)";
    ctx.lineWidth = 1.05 + segment.depth * 1.11;
    ctx.stroke();
    if (segment.depth >= 2) {
      // Uneven streaks inside the bark give the trunk an aged, fibrous grain.
      for (let j = 0; j < 2; j++) {
        const t = .2 + j * .36 + .08 * Math.sin(segment.seed * 2.1);
        const p = branchPoint(segment, t);
        const q = branchPoint(segment, Math.min(.98, t + .13));
        const offset = Math.sin(segment.seed * 7 + j * 4) * (segment.depth * .19);
        ctx.strokeStyle = j ? "rgba(43,75,78,.20)" : "rgba(27,46,56,.43)";
        ctx.lineWidth = .25 + segment.depth * .075;
        ctx.beginPath(); ctx.moveTo(p.x + offset, p.y); ctx.lineTo(q.x + offset * .6, q.y); ctx.stroke();
      }
    }
  }

  // 2. Layered, uneven bioluminescence inside the wood. The light is a soft
  // volume and a few filaments, not a uniform coloured outline.
  ctx.globalCompositeOperation = "screen";
  const veinPulse = .88 + .075 * Math.sin(time * .14);
  for (const segment of segments) {
    traceBranch(ctx, segment);
    ctx.strokeStyle = `rgba(59,164,179,${(.095 + luminance * .20) * veinPulse})`;
    ctx.lineWidth = .56 + segment.depth * .49;
    ctx.shadowBlur = segment.depth > 2 ? 6 : 3;
    ctx.shadowColor = "rgba(76,193,202,.36)";
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (segment.depth > 2) {
      traceBranch(ctx, segment);
      ctx.strokeStyle = `rgba(174,238,223,${(.035 + luminance * .08) * veinPulse})`;
      ctx.lineWidth = .32 + segment.depth * .055;
      ctx.stroke();
    }
  }

  // 3. New, curved shoots lengthen over time. Existing branches never jump
  // in size when somebody adds a star; the memory count eases in upstream.
  for (let i = 0; i < 30; i++) {
    const tip = tips[(i * 11) % tips.length];
    const length = (2.4 + (i % 5) * 1.55) * shootGrowth;
    const angle = Math.sin(tip.seed * 3.8) * .85;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(tip.x + Math.sin(angle) * length * .42, tip.y - length * .52,
      tip.x + Math.sin(angle) * length, tip.y - length);
    ctx.strokeStyle = `rgba(129,217,209,${.085 + shootGrowth * .17})`;
    ctx.lineWidth = .32 + shootGrowth * .18;
    ctx.stroke();
  }

  // Quiet overlapping foliage-light, not a painted halo pasted over the sky.
  const glowSprite = getCanopyGlowSprite();
  for (let i = 0; i < 23; i++) {
    const tip = tips[(i * 13) % tips.length];
    const px = tip.x + Math.sin(i * 8.17) * 10;
    const py = tip.y + Math.cos(i * 5.31) * 7;
    const spread = 28 + (i % 6) * 4;
    ctx.globalAlpha = (.20 + luminance * .14) * maturity * (.88 + .12 * Math.sin(time * .25 + i));
    ctx.drawImage(glowSprite, px - spread * .5, py - spread * .5, spread, spread);
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < Math.floor(leafCount * maturity); i++) {
    const b = tips[(i * 17) % tips.length];
    const angle = i * 2.399963;
    const radius = Math.sqrt(((i * 37) % 97) / 97) * 29;
    const px = b.x + Math.cos(angle) * radius + Math.sin(time * .12 + i * .17) * .36;
    const py = b.y + Math.sin(angle) * radius * .63;
    const pulse = .84 + .16 * Math.sin(time * (.31 + (i % 9) * .043) + i * 3.21);
    const alpha = (.26 + luminance * .65) * pulse;
    ctx.fillStyle = i % 8 === 0 ? `rgba(248,200,163,${alpha})` : i % 5 === 0 ? `rgba(166,196,254,${alpha})` : `rgba(141,229,221,${alpha})`;
    const size = .30 + (i % 5) * .18;
    ctx.beginPath();
    if (i % 7 === 0) ctx.ellipse(px, py, size * 1.75, size * .58, Math.sin(i * 3.7), 0, Math.PI * 2);
    else ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
    if (i % 23 === 0) {
      const g = ctx.createRadialGradient(px,py,0,px,py,4.3);
      g.addColorStop(0,`rgba(177,236,229,${alpha*.55})`);
      g.addColorStop(1,'rgba(177,236,229,0)');
      ctx.fillStyle=g;ctx.fillRect(px-4.3,py-4.3,8.6,8.6);
    }
  }

  // Unlike the distant stars, a few local spirit motes drift within the tree.
  // They move only a couple of pixels so the tree remains a quiet landmark.
  for (let i = 0; i < 52; i++) {
    const seed = Math.sin(i * 127.17 + 17.2) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const wide = (Math.sin(i * 3.17) * .52 + Math.sin(i * 1.37) * .25) * 106;
    const px = wide * (.50 + .35 * Math.sin(Math.PI * frac)) + Math.sin(i * 2.27) * (3 + frac * 6) + Math.sin(time * (.12 + frac * .12) + i * 2.51) * 2.4;
    const py = 8 - frac * (132 + i % 6 * 8) + Math.sin(i * 2.1) * 2.5 + Math.cos(time * (.10 + frac * .16) + i * 1.29) * 3.8;
    const breath = .83 + .17 * Math.sin(time * (.28 + i % 7 * .047) + i * 1.38);
    const power = (.22 + luminance * .38) * breath;
    const size = .38 + (i % 7) * .12;
    const color = i % 8 === 0 ? "255,212,165" : i % 5 === 0 ? "162,187,255" : "155,240,226";

    if (i % 11 === 0) {
      const radius = 3.2;
      const light = ctx.createRadialGradient(px, py, 0, px, py, radius);
      light.addColorStop(0, `rgba(${color},${power * .52})`);
      light.addColorStop(.35, `rgba(${color},${power * .18})`);
      light.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = light;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
    ctx.fillStyle = `rgba(${color},${Math.min(.75, power)})`;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
