#!/usr/bin/env node
// PlayCanvas 2.22 emits this extension directive even when multi-draw is
// disabled. Removing it enables the engine's own loop fallback on ANGLE and
// software-GPU presentation machines.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "node_modules/playcanvas/build/playcanvas/src/platform/graphics/shader-chunks/vert/gles3.js",
  "node_modules/playcanvas/build/playcanvas.dbg/src/platform/graphics/shader-chunks/vert/gles3.js",
  "node_modules/playcanvas/build/playcanvas.prf/src/platform/graphics/shader-chunks/vert/gles3.js",
];

for (const relative of targets) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) continue;
  const source = fs.readFileSync(target, "utf8");
  const patched = source
    .replace("// WEBGL_multi_draw\n#extension GL_ANGLE_multi_draw : enable\n\n", "")
    .replace("#extension GL_ANGLE_multi_draw : enable\n", "");
  if (patched !== source) fs.writeFileSync(target, patched);
}
