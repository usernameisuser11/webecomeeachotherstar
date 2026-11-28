import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const launch = () => chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const base = "http://127.0.0.1:8787/";
const errors = [];
await mkdir("test-output", { recursive: true });

async function open(browser, viewport) {
  const mobile = viewport.width < 750;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", error => { errors.push(String(error)); console.error(error.stack); });
  page.on("console", message => {
    const body = message.text();
    if (body.includes("3D observatory unavailable")) console.error(body);
    if (message.type() === "error" && /WebGLProgram|Shader Error|GL_INVALID|THREE.*error/i.test(body)) {
      errors.push(body);
      console.error(body);
    }
  });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      const context = getContext.call(this, kind, ...args);
      if (kind === "webgl2" && context) window.testOverlookGL = context;
      return context;
    };
  });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
  const canvas = page.locator("canvas.sky-canvas");
  await canvas.waitFor({ timeout: 30000 });
  try {
    await page.locator('canvas.sky-canvas[data-renderer="live-webgl"]').waitFor({ timeout: 55000 });
  } catch (error) {
    console.error("Canvas state", await canvas.getAttribute("data-renderer", { timeout: 2500 }).catch(() => "unresponsive"));
    throw error;
  }
  const dimensions = await canvas.evaluate(element => [element.clientWidth, element.clientHeight]);
  assert.deepEqual(dimensions, [viewport.width, viewport.height]);
  await page.getByRole("button", { name: "함께 하늘 바라보기" }).click({ timeout: 30000 });
  return { page, context };
}

async function capture(page, name) {
  await page.screenshot({ path: "test-output/" + name + ".png", timeout: 30000 });
  if (process.env.GITHUB_ACTIONS === "true") {
    const session = await page.context().newCDPSession(page);
    const { width, height } = page.viewportSize();
    const { data } = await session.send("Page.captureScreenshot", {
      format: "jpeg", quality: 50, clip: { x: 0, y: 0, width, height, scale: .64 }, captureBeyondViewport: false,
    });
    await session.detach();
    for (let offset = 0; offset < data.length; offset += 2000) {
      console.log("STARLIGHT_FRAME " + name + " " + data.slice(offset, offset + 2000));
    }
  }
}

async function checkPhoto(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "밤하늘 사진 저장" }).click(),
  ]);
  const bytes = await readFile(await download.path());
  assert.equal(bytes.readUInt32BE(0), 0x89504e47);
  const { width, height } = page.viewportSize();
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
}

async function seedSky() {
  async function post(path, data) {
    const response = await fetch(new URL(path, base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const alice = "test_a_" + crypto.randomUUID();
  const bob = "test_b_" + crypto.randomUUID();
  const a = await post("/api/sky", { action: "create", token: alice, name: "강가의 테스트별", x: .29, y: .32, hue: 187 });
  const b = await post("/api/sky", { action: "create", token: bob, name: "연결된 테스트별", x: .43, y: .23, hue: 263 });
  assert.notEqual(a.id, b.id);
  const result = await post("/api/rooms", { action: "create", token: alice, name: "달빛 검증방", visibility: "public", theme: "forest" });
  const rooms = await (await fetch(new URL("/api/rooms", base))).json();
  assert.ok(rooms.rooms.some(room => room.id === result.room.id));
  console.log("Local D1: two stars registered and public forest room created.");
}

async function checkStarControls(page) {
  const { width, height } = page.viewportSize();
  await page.locator("canvas.sky-canvas").click({ position: { x: width * .29, y: height * .32 } });
  await page.getByRole("heading", { name: "강가의 테스트별" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "별 정보 닫기" }).click();
  await page.getByRole("button", { name: "별자리 표시 설정" }).click();
  const lines = page.getByRole("button", { name: /별자리 연결선/ });
  const wasOn = await lines.getAttribute("aria-pressed");
  await lines.click();
  assert.notEqual(await lines.getAttribute("aria-pressed"), wasOn);
  await lines.click();
  await page.getByRole("button", { name: "별자리 표시 설정" }).click();
}

async function checkContextRestoration(page) {
  const canRestore = await page.evaluate(() => {
    const extension = window.testOverlookGL?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    window.testLostContext = extension;
    extension.loseContext();
    return true;
  });
  assert.equal(canRestore, true);
  await page.locator('canvas.sky-canvas[data-renderer="fallback"]').waitFor({ timeout: 20000 });
  await page.evaluate(() => window.testLostContext.restoreContext());
  await page.locator('canvas.sky-canvas[data-renderer="live-webgl"]').waitFor({ timeout: 40000 });
}

await seedSky();
const socket = new WebSocket("ws://127.0.0.1:8787/presence/starlight", { headers: { Origin: new URL(base).origin } });
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Test visitor could not join")), 10000);
  socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
  socket.addEventListener("error", event => { clearTimeout(timeout); reject(event.error ?? new Error("Test visitor connection failed")); }, { once: true });
});

try {
  // SwiftShader shares the CI host CPU. Keep one animated browser window active.
  for (const [name, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const browser = await launch();
    try {
      const { page } = await open(browser, viewport);
      await page.locator('canvas.sky-canvas[data-live-visitors="2"]').waitFor({ timeout: 30000 });
      await capture(page, name + "-3d");
      await checkStarControls(page);
      await checkPhoto(page);

      if (name === "mobile") {
        await page.getByRole("button", { name: "유성우" }).click();
        await page.waitForTimeout(620);
        await capture(page, "mobile-meteor-shower");
        const span = await page.evaluate(() => new Promise(resolve => {
          let previous = performance.now();
          const samples = [];
          const sample = time => {
            samples.push(time - previous);
            previous = time;
            if (samples.length < 24) requestAnimationFrame(sample);
            else resolve(samples.sort((a, b) => a - b));
          };
          requestAnimationFrame(sample);
        }));
        console.log("Portrait SwiftShader frame intervals (ms): median " + span[12].toFixed(1) + ", p90 " + span[21].toFixed(1));
        await checkContextRestoration(page);
      }
      console.log(name + ": WebGL, another live visitor, star selection, constellation toggle and PNG export verified.");
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log("Desktop and portrait WebGL and mobile WebGL context restoration verified.");
} finally {
  socket.close();
}
