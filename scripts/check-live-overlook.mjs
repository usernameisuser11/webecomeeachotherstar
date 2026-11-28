import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const base = "http://127.0.0.1:8787/";
const errors = [];
await mkdir("test-output", { recursive: true });

async function open(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", error => { errors.push(String(error)); console.error(error.stack); });
  page.on("console", message => {
    const body = message.text();
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
  await page.locator('canvas.sky-canvas[data-renderer="live-webgl"]').waitFor({ timeout: 50000 });
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

try {
  const desktop = await open({ width: 1280, height: 800 });
  await desktop.page.locator('canvas.sky-canvas[data-live-visitors="1"]').waitFor({ timeout: 30000 });
  await capture(desktop.page, "desktop-3d");
  await checkPhoto(desktop.page);
  const mobile = await open({ width: 390, height: 844 });
  await mobile.page.locator('canvas.sky-canvas[data-live-visitors="2"]').waitFor({ timeout: 40000 });
  await desktop.page.locator('canvas.sky-canvas[data-live-visitors="2"]').waitFor({ timeout: 40000 });
  await desktop.context.close();
  await mobile.page.locator('canvas.sky-canvas[data-live-visitors="1"]').waitFor({ timeout: 30000 });
  await capture(mobile.page, "mobile-3d");
  await mobile.page.getByRole("button", { name: "유성우" }).click();
  await mobile.page.waitForTimeout(550);
  await capture(mobile.page, "mobile-meteor-shower");
  await checkPhoto(mobile.page);

  const span = await mobile.page.evaluate(() => new Promise(resolve => {
    let previous = performance.now(), count = 0;
    const samples = [];
    const sample = time => {
      samples.push(time - previous);
      previous = time;
      if (++count < 30) requestAnimationFrame(sample);
      else resolve(samples.sort((a, b) => a - b));
    };
    requestAnimationFrame(sample);
  }));
  console.log("Portrait SwiftShader frames (ms): median " + span[15].toFixed(1) + ", p90 " + span[27].toFixed(1));

  const canRestore = await mobile.page.evaluate(() => {
    const extension = window.testOverlookGL?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    window.testLostContext = extension;
    extension.loseContext();
    return true;
  });
  assert.equal(canRestore, true);
  await mobile.page.locator('canvas.sky-canvas[data-renderer="fallback"]').waitFor({ timeout: 20000 });
  await mobile.page.evaluate(() => window.testLostContext.restoreContext());
  await mobile.page.locator('canvas.sky-canvas[data-renderer="live-webgl"]').waitFor({ timeout: 40000 });
  assert.deepEqual(errors, []);
  console.log("Desktop and portrait WebGL, two synchronized visitors, meteor shower, PNG export and context restoration verified.");
} finally {
  await browser.close();
}
