"use client";

import { useEffect, useRef } from "react";

type Theme = "forest" | "violet" | "ocean" | "dawn";

type Props = {
  theme: Theme;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// The point-grain profile and its 128px sprite are taken from our original
// Stellar_Hand_v1_2_Render_Pipeline_Fix.html (v31.9 / Quasar v1.29 pipeline).
// Only the vertex placement was changed: these particles are fixed stars,
// not points orbiting the viewer's hand. This is real WebGL point rendering.
const GRAIN_FS = `#version 300 es
precision highp float;uniform sampler2D uMap;in vec3 vColor;in float vAlpha;in float vSeed;out vec4 frag;
void main(){vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>=1.0)discard;
  float core=exp(-r2*14.0),halo=exp(-r2*3.1)*.19;
  float edge=1.0-smoothstep(.73,1.0,sqrt(r2));
  float tex=texture(uMap,gl_PointCoord).a;
  float alpha=(core+halo)*edge*vAlpha*tex*.90;
  if(alpha<.002)discard;
  frag=vec4(vColor*(1.0+.27*core),alpha);
}`;

const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 a0; // x, y, brightness, random seed
layout(location=1) in vec4 a1; // point size, color population, depth, light phase
uniform float uTime, uDpr, uSkyScale;
out vec3 vColor;out float vAlpha;out float vSeed;
void main(){
  vec2 p=a0.xy;
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);
  float twinkle=.88+.087*sin(uTime*(.47+a0.w*.74)+a1.w*6.28318)
                   +.033*sin(uTime*(.19+a1.z*.23)+a0.w*38.0);
  float pop=a1.y;
  vec3 cyan=vec3(.31,1.22,2.50),blue=vec3(.50,.75,2.54),violet=vec3(1.12,.66,2.30),gold=vec3(2.8,1.36,.48);
  vColor=pop<.38?mix(cyan,blue,pop/.38):mix(blue,violet,clamp((pop-.38)/.56,0.0,1.0));
  vColor=mix(vColor,gold,step(.972,pop)*.86);
  vColor=mix(vColor,vec3(3.3,4.0,5.0),step(.993,a0.w)*.72);
  vColor*=.72+.42*a1.z;
  vAlpha=a0.z*twinkle*uSkyScale;
  gl_PointSize=clamp(a1.x*uDpr,1.3*uDpr,6.3*uDpr);
  vSeed=a0.w;
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("별빛 셰이더를 만들지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "별빛 셰이더 오류");
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error("별빛 프로그램을 만들지 못했습니다.");
  const vertex = compile(gl, gl.VERTEX_SHADER, STAR_VS);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, GRAIN_FS);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || "별빛 프로그램 연결 오류");
  }
  return program;
}

function originalQuasarGrainTexture(gl: WebGL2RenderingContext) {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5 - size * .5) / (size * .5);
    const dy = (y + .5 - size * .5) / (size * .5);
    const r = Math.hypot(dx, dy), k = (y * size + x) * 4;
    const core = Math.exp(-r * r * 11.4), aura = .29 * Math.exp(-r * r * 4.4);
    const f = clamp((r - .82) / .18, 0, 1), edge = 1 - f * f * (3 - 2 * f);
    const alpha = Math.min(1, (core + aura) * edge);
    pixels[k] = pixels[k + 1] = pixels[k + 2] = 255;
    pixels[k + 3] = Math.round(255 * alpha);
  }
  const texture = gl.createTexture();
  if (!texture) throw new Error("별빛 텍스처를 만들지 못했습니다.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function makeStars(width: number, height: number) {
  const random = randomGenerator(193891);
  const count = Math.min(10500, Math.max(1700, Math.round(width * height / (width < 600 ? 155 : 115))));
  const values = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const k = i * 8;
    const isBand = random() < .39;
    const x = random();
    // Stellar_Hand's independent grain points, spatially concentrated toward
    // a very subtle galactic lane. No painted Milky Way cloud or bitmap plate.
    const lane = .68 - .55 * x + Math.sin(x * 4.1) * .037;
    const spread = (random() + random() + random() - 1.5) * .25;
    const y = isBand ? lane + spread : random() * .785;
    const magnitude = Math.pow(random(), 4.6);
    const rare = magnitude > .985;
    const size = rare ? 4.0 + random() * 1.8 : magnitude > .72 ? 2.4 + random() * 1.6 : 1.2 + random() * 1.5;
    const color = random();
    values[k] = x;
    values[k + 1] = clamp(y, .015, .805);
    values[k + 2] = .25 + magnitude * 2.35;
    values[k + 3] = random();
    values[k + 4] = size;
    values[k + 5] = color < .025 ? .98 + random() * .019 : color;
    values[k + 6] = random();
    values[k + 7] = random();
  }
  return { values, count };
}

// The same point-grain equation is also sampled into tiny 2D sprites. On
// browsers where WebGL2 is switched off, the sky still contains individual
// luminous particles rather than a photograph or a blurry nebula backdrop.
function originalGrainSprite(rgb: [number, number, number]) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 40;
  const g = sprite.getContext("2d")!;
  const image = g.createImageData(40, 40);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const dx = (x + .5 - 20) / 20, dy = (y + .5 - 20) / 20;
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) continue;
    const edgeX = clamp((Math.sqrt(r2) - .73) / .27, 0, 1);
    const edge = 1 - edgeX * edgeX * (3 - 2 * edgeX);
    const textureX = clamp((Math.sqrt(r2) - .82) / .18, 0, 1);
    const textureEdge = 1 - textureX * textureX * (3 - 2 * textureX);
    const tex = Math.min(1, (Math.exp(-r2 * 11.4) + .29 * Math.exp(-r2 * 4.4)) * textureEdge);
    const alpha = (Math.exp(-r2 * 14) + Math.exp(-r2 * 3.1) * .19) * edge * tex * .90;
    const index = (y * 40 + x) * 4;
    image.data[index] = rgb[0]; image.data[index + 1] = rgb[1]; image.data[index + 2] = rgb[2];
    image.data[index + 3] = Math.round(255 * clamp(alpha, 0, 1));
  }
  g.putImageData(image, 0, 0);
  return sprite;
}

function startGrainCanvasFallback(canvas: HTMLCanvasElement, theme: Theme) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};
  const sprites = [
    originalGrainSprite([221, 234, 255]),
    originalGrainSprite([169, 207, 255]),
    originalGrainSprite([255, 229, 197]),
    originalGrainSprite([214, 190, 246]),
  ];
  const still = document.createElement("canvas");
  // Eight interleaved, pre-rendered point layers let every star scintillate
  // while its coordinates remain fixed. Only 8 canvas composites per frame;
  // no thousands-of-points redraws on older iPhones.
  const layers = Array.from({ length: 8 }, () => document.createElement("canvas"));
  let frame = 0, lastFrame = 0, stopped = false;
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, width < 750 ? 1.85 : 1.6);
    const resolution = Math.min(dpr, Math.sqrt((width < 750 ? 1250000 : 2000000) / (width * height)));
    still.width = canvas.width = Math.ceil(width * resolution);
    still.height = canvas.height = Math.ceil(height * resolution);
    const plate = still.getContext("2d", { alpha: true })!;
    plate.clearRect(0, 0, still.width, still.height);
    plate.globalCompositeOperation = "lighter";
    const painters = layers.map(layer => {
      layer.width = canvas.width; layer.height = canvas.height;
      const painter = layer.getContext("2d", { alpha: true })!;
      painter.clearRect(0, 0, layer.width, layer.height);
      painter.globalCompositeOperation = "lighter";
      return painter;
    });
    const { values, count } = makeStars(width, height);
    for (let i = 0; i < count; i++) {
      const n = i * 8;
      const brightness = Math.min(1, .24 + values[n + 2] * .29);
      const dot = {
        x: values[n] * canvas.width, y: values[n + 1] * canvas.height,
        size: (2.3 + values[n + 4] * .89) * resolution,
        alpha: brightness * (theme === "dawn" ? .82 : 1),
        color: values[n + 5] < .08 ? 1 : values[n + 5] > .975 ? 2 : values[n + 5] > .83 ? 3 : 0,
      };
      plate.globalAlpha = dot.alpha * .78;
      plate.drawImage(sprites[dot.color], dot.x - dot.size / 2, dot.y - dot.size / 2, dot.size, dot.size);
      const painter = painters[(i * 7 + Math.floor(values[n + 7] * 23)) % painters.length];
      painter.globalAlpha = dot.alpha * .28;
      painter.drawImage(sprites[dot.color], dot.x - dot.size / 2, dot.y - dot.size / 2, dot.size, dot.size);
    }
    plate.globalAlpha = 1;
    painters.forEach(painter => { painter.globalAlpha = 1; });
  };
  const draw = (now: number) => {
    if (stopped) return;
    if (document.visibilityState !== "hidden" && now - lastFrame > 1000 / 20) {
      lastFrame = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(still, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      const time = now / 1000;
      for (let i = 0; i < layers.length; i++) {
        ctx.globalAlpha = .35 + .65 * (.5 + .5 * Math.sin(time * (.29 + i * .052) + i * 2.419));
        ctx.drawImage(layers[i], 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    frame = requestAnimationFrame(draw);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); };
}

export default function StellarParticles({ theme, canvasRef }: Props) {
  const internalRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    if (!gl) return startGrainCanvasFallback(canvas, theme);
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0, stopped = false, count = 0, lastDraw = 0;
    const isMobile = matchMedia("(max-width: 750px)").matches;
    const resize = () => {
      if (!vao || !buffer) return;
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.85 : 1.6);
      const maxPixels = isMobile ? 1250000 : 2000000;
      const scale = Math.min(1, Math.sqrt(maxPixels / (width * height * dpr * dpr)));
      canvas.width = Math.round(width * dpr * scale);
      canvas.height = Math.round(height * dpr * scale);
      const field = makeStars(width, height);
      count = field.count;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, field.values, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
    };

    try {
      program = createProgram(gl);
      texture = originalQuasarGrainTexture(gl);
      vao = gl.createVertexArray();
      buffer = gl.createBuffer();
      if (!vao || !buffer) throw new Error("별빛 버퍼가 부족합니다.");
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      gl.bindVertexArray(null);
      resize();
      const p = program;
      const glTexture = texture;
      const glVao = vao;
      const timeUniform = gl.getUniformLocation(p, "uTime");
      const dprUniform = gl.getUniformLocation(p, "uDpr");
      const skyUniform = gl.getUniformLocation(p, "uSkyScale");
      const mapUniform = gl.getUniformLocation(p, "uMap");
      const gain = theme === "dawn" ? .82 : theme === "violet" ? .90 : 1;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(p);
      gl.uniform1i(mapUniform, 0);
      const start = performance.now();
      const draw = (now: number) => {
        if (stopped) return;
        if (document.visibilityState !== "hidden" && now - lastDraw >= (isMobile ? 1000 / 30 : 1000 / 48)) {
          lastDraw = now;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(p);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, glTexture);
          gl.uniform1f(timeUniform, (now - start) / 1000);
          gl.uniform1f(dprUniform, canvas.width / Math.max(1, canvas.clientWidth));
          gl.uniform1f(skyUniform, gain);
          gl.bindVertexArray(glVao);
          gl.drawArrays(gl.POINTS, 0, count);
          gl.bindVertexArray(null);
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    } catch (error) {
      console.warn("Native starlight unavailable; keeping the canvas sky.", error);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onContextLost = (event: Event) => { event.preventDefault(); stopped = true; cancelAnimationFrame(frame); };
    canvas.addEventListener("webglcontextlost", onContextLost);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
    };
  }, [theme]);

  return <canvas ref={node => { internalRef.current = node; canvasRef.current = node; }} className="stellar-particles" aria-hidden="true" />;
}
