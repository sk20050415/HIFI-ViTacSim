#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "public/assets/scene-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  userDataDir: path.join(root, ".tmp", "chrome-exact-capture-profile"),
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1440,1200",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForSelector("#reconstruction-stage.ready", { timeout: 60_000 });
  await page.$eval("#reconstruction-stage", (stage) => {
    stage.style.aspectRatio = "4 / 3";
    stage.querySelector("#reconstruction-divider").style.display = "none";
    stage.querySelectorAll(".view-label").forEach((label) => {
      label.style.display = "none";
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 750));
  const canvas = await page.$("#reconstruction-canvas");
  if (!canvas) throw new Error("Missing reconstruction canvas");

  for (const view of manifest.views) {
    await page.evaluate((capturedView) => {
      window.__tableClothViewer.showCapturedGaussianView(capturedView);
    }, view);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const output = path.join(root, `public/assets/views/${view.id}/gaussian.webp`);
    await canvas.screenshot({ path: output, type: "webp", quality: 96 });
    view.gaussian = `./assets/views/${view.id}/gaussian.webp`;
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser.close();
}
