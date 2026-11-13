// An original luminous shoreline tree. Its light grows with shared memories,
// while the landscape stays complete even when nobody has joined yet.
export function drawMemoryTree(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, stars: number, glows: number) {
  const portrait = w / h < .78;
  const x = w * (portrait ? .58 : .55);
  // The portrait camera sits farther back: a smaller tree, slightly lower on
  // the horizon, leaves substantially more sky open for the constellation.
  const groundY = h * (portrait ? .863 : .844);
  const scale = Math.min(w * .00174, h * .00111) * (portrait ? 1.04 : 1.51);
  const luminance = Math.min(.65, .24 + Math.sqrt(stars + glows * .25) * .042);
  const leafCount = Math.min(460, 196 + stars * 9 + glows * 3);

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
  const branches: { x: number; y: number; depth: number }[] = [];

  function branch(sx: number, sy: number, length: number, angle: number, depth: number, seed: number) {
    const ex = sx + Math.sin(angle) * length;
    const ey = sy - Math.cos(angle) * length;
    const cx = (sx + ex) * .5 + Math.sin(seed * 2.3) * length * .15;
    const cy = (sy + ey) * .5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = depth > 2 ? `rgba(110,206,210,${.18 + luminance * .38})` : `rgba(194,203,192,${.22 + luminance * .31})`;
    ctx.lineWidth = .35 + depth * .77;
    ctx.shadowBlur = depth < 3 ? 12 : 4;
    ctx.shadowColor = "rgba(91,211,225,.5)";
    ctx.stroke();
    if (depth === 0) { branches.push({ x: ex, y: ey, depth: seed }); return; }
    const a = .37 + Math.sin(seed * 5.4) * .08;
    branch(ex, ey, length * (.75 + Math.sin(seed * 8) * .034), angle - a, depth - 1, seed + 1.31);
    branch(ex, ey, length * (.70 + Math.cos(seed * 3) * .05), angle + a, depth - 1, seed + 2.17);
    if (depth > 2 && seed % 2 > 1) branch(ex, ey, length * .62, angle, depth - 2, seed + .4);
  }

  branch(0, 3, 47, .015, 5, 1.3);
  ctx.shadowBlur = 0;

  for (let i = 0; i < leafCount; i++) {
    const b = branches[(i * 17) % branches.length];
    const angle = i * 2.399963;
    const radius = Math.sqrt(((i * 37) % 97) / 97) * 29;
    const px = b.x + Math.cos(angle) * radius;
    const py = b.y + Math.sin(angle) * radius * .63;
    const pulse = .84 + .16 * Math.sin(time * (.31 + (i % 9) * .043) + i * 3.21);
    const alpha = (.28 + luminance * .66) * pulse;
    ctx.fillStyle = i % 8 === 0 ? `rgba(248,200,163,${alpha})` : i % 5 === 0 ? `rgba(166,196,254,${alpha})` : `rgba(141,229,221,${alpha})`;
    const size = .28 + (i % 5) * .18;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
    if (i % 23 === 0) {
      const g = ctx.createRadialGradient(px,py,0,px,py,4.3);
      g.addColorStop(0,`rgba(177,236,229,${alpha*.55})`);
      g.addColorStop(1,'rgba(177,236,229,0)');
      ctx.fillStyle=g;ctx.fillRect(px-4.3,py-4.3,8.6,8.6);
    }
  }

  // Every light stays fixed in space. Only its intensity breathes, as stars
  // do to the naked eye; there is no upward drift or random particle motion.
  for (let i = 0; i < 52; i++) {
    const seed = Math.sin(i * 127.17 + 17.2) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const wide = (Math.sin(i * 3.17) * .52 + Math.sin(i * 1.37) * .25) * 106;
    const px = wide * (.50 + .35 * Math.sin(Math.PI * frac)) + Math.sin(i * 2.27) * (3 + frac * 6);
    const py = 8 - frac * (132 + i % 6 * 8) + Math.sin(i * 2.1) * 2.5;
    const breath = .76 + .24 * Math.sin(time * (.24 + i % 7 * .053) + i * 1.38);
    const power = (.12 + luminance * .30) * breath;
    const size = .35 + (i % 7) * .11;
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
