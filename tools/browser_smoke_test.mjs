import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  userDataDir: path.join(root, ".tmp", "chrome-profile"),
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1440,1000",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
const diagnostics = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));

await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 120_000 });
try {
  await page.waitForSelector("#reconstruction-stage.ready", { timeout: 45_000 });
} catch (error) {
  const state = await page.evaluate(() => ({
    loading: document.querySelector("#loading-detail")?.textContent,
    viewerError: document.querySelector("#viewer-error")?.textContent,
    viewerErrorHidden: document.querySelector("#viewer-error")?.hasAttribute("hidden"),
  }));
  await page.screenshot({ path: path.join(root, ".tmp", "browser-failure.png"), fullPage: true });
  console.error(JSON.stringify({ state, diagnostics }, null, 2));
  await browser.close();
  throw error;
}
await page.screenshot({ path: path.join(root, ".tmp", "page-desktop.png"), fullPage: true });

const stage = await page.$("#reconstruction-stage");
if (!stage) throw new Error("Missing viewer stage");
await stage.evaluate((node) => node.scrollIntoView({ block: "center" }));
await new Promise((resolve) => setTimeout(resolve, 800));
const bounds = await stage.boundingBox();
if (!bounds) throw new Error("Viewer has no bounds");
await stage.screenshot({ path: path.join(root, ".tmp", "viewer-free-initial.png") });
const freeCanvasState = await page.evaluate(() => ({
  canvas: {
    width: document.querySelector("#reconstruction-canvas")?.width,
    height: document.querySelector("#reconstruction-canvas")?.height,
  },
  gaussianRuntime: (() => {
    const viewer = window.__tableClothViewer;
    const entity = viewer?.gaussianWorld?.app?.root?.findByName("TableClothGaussian");
    const component = entity?.gsplat;
    return {
      entityEnabled: entity?.enabled,
      componentEnabled: component?.enabled,
      hasInstance: Boolean(component?.instance),
      hasPlacement: Boolean(component?._placement),
      hasResource: Boolean(component?.resource),
      unified: component?.unified,
      hasAsset: Boolean(component?.asset),
      assetId: component?.asset,
      registryHit: Boolean(viewer?.gaussianWorld?.app?.assets?.get(component?.asset)),
      registryResource: Boolean(viewer?.gaussianWorld?.app?.assets?.get(component?.asset)?.resource),
      drawCalls: viewer?.gaussianWorld?.app?.scene?.layers?.getLayerById(0)?.meshInstances?.length,
      device: viewer?.gaussianWorld?.app?.graphicsDevice?.deviceType,
    };
  })(),
}));
await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.5);
await page.mouse.down();
await page.mouse.move(bounds.x - bounds.width, bounds.y + bounds.height * 2, { steps: 12 });
await page.mouse.up();
await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
await page.mouse.wheel({ deltaY: -8000 });
await new Promise((resolve) => setTimeout(resolve, 400));
const minReadout = await page.$eval("#camera-readout", (node) => node.textContent);
await page.mouse.wheel({ deltaY: 16000 });
await new Promise((resolve) => setTimeout(resolve, 400));
const maxReadout = await page.$eval("#camera-readout", (node) => node.textContent);
await stage.screenshot({ path: path.join(root, ".tmp", "viewer-free.png") });

await page.click("#exact-view-buttons button:nth-child(3)");
await new Promise((resolve) => setTimeout(resolve, 500));
const exactStage = await page.$("#exact-stage");
if (!exactStage) throw new Error("Missing exact comparison stage");
await exactStage.screenshot({ path: path.join(root, ".tmp", "viewer-exact.png") });

await page.click('[data-rollout-tab="red-ring"]');
await page.waitForFunction(() => !document.querySelector('[data-rollout-panel="red-ring"]')?.hidden);
const rolloutVideo = await page.$('[data-rollout-panel="red-ring"] video');
if (!rolloutVideo) throw new Error("Missing Red Ring rollout video");
await rolloutVideo.evaluate(async (video) => {
  video.muted = true;
  await video.play();
});
await page.waitForFunction(() => {
  const video = document.querySelector('[data-rollout-panel="red-ring"] video');
  return video instanceof HTMLVideoElement && video.currentTime > 0.05;
}, { timeout: 10_000 });
const rolloutState = await page.evaluate(() => {
  const active = document.querySelector('[data-rollout-tab].active');
  const redPanel = document.querySelector('[data-rollout-panel="red-ring"]');
  const toyPanel = document.querySelector('[data-rollout-panel="toy-box"]');
  const videos = Array.from(document.querySelectorAll("#simulation-rollouts video, #act-zero-shot video"));
  videos.forEach((video) => video.pause());
  return {
    activeTask: active?.getAttribute("data-rollout-tab"),
    redPanelVisible: redPanel ? !redPanel.hasAttribute("hidden") : false,
    toyPanelHidden: toyPanel?.hasAttribute("hidden"),
    videoCount: videos.length,
    h264Support: document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"'),
  };
});
const rolloutSection = await page.$("#real2sim");
await rolloutSection?.screenshot({ path: path.join(root, ".tmp", "rollouts-desktop.png") });

const canvasState = await page.evaluate(() => ({
  reconstruction: {
    width: document.querySelector("#reconstruction-canvas")?.width,
    height: document.querySelector("#reconstruction-canvas")?.height,
  },
  ready: document.querySelector("#reconstruction-stage")?.classList.contains("ready"),
  error: document.querySelector("#viewer-error")?.textContent,
}));

await browser.close();
console.log(JSON.stringify({ canvasState, freeCanvasState, rolloutState, minReadout, maxReadout, diagnostics }, null, 2));

if (
  !canvasState.ready || canvasState.error || rolloutState.activeTask !== "red-ring" ||
  !rolloutState.redPanelVisible || !rolloutState.toyPanelHidden || rolloutState.videoCount !== 6 ||
  !rolloutState.h264Support || diagnostics.some((entry) => entry.startsWith("error") || entry.startsWith("pageerror"))
) {
  process.exitCode = 1;
}
