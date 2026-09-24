import * as pc from "playcanvas";
import { ConstrainedOrbit } from "./orbit";
import type { CapturedView, SceneManifest } from "./types";

interface RenderWorld {
  app: pc.Application;
  camera: pc.Entity;
}

// The USD stores physically meaningful linear displayColor values, but the
// final Isaac image also contains enclosure fill, area-light bounce and an
// ACES-style display transform. Keep those presentation choices separate from
// the source colors so the copied GLB remains an auditable USD-color export.
const NEURAL_LIGHTING = {
  ambient: new pc.Color(0.82, 0.84, 0.88),
  emissiveFill: new pc.Color(0.075, 0.072, 0.066),
  key: {
    color: new pc.Color(1.0, 0.92, 0.78),
    intensity: 2.15,
    euler: new pc.Vec3(46, 26, 0),
  },
  fill: {
    color: new pc.Color(0.76, 0.86, 1.0),
    intensity: 0.82,
    euler: new pc.Vec3(64, -138, 0),
  },
  rim: {
    color: new pc.Color(1.0, 0.82, 0.66),
    intensity: 0.34,
    euler: new pc.Vec3(28, 158, 0),
  },
} as const;

const q = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

function createCamera(app: pc.Application, name: string): pc.Entity {
  const camera = new pc.Entity(name);
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.035, 0.043, 0.052, 1),
    nearClip: 0.01,
    farClip: 100,
    fov: 54.52,
  });
  app.root.addChild(camera);
  return camera;
}

function createWorld(canvas: HTMLCanvasElement): RenderWorld {
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: false, alpha: false, preserveDrawingBuffer: true },
  });
  const compatibleDevice = app.graphicsDevice as pc.GraphicsDevice & {
    extMultiDraw?: unknown;
    supportsMultiDraw: boolean;
    capsDefines: Map<string, string>;
  };
  compatibleDevice.extMultiDraw = null;
  compatibleDevice.supportsMultiDraw = false;
  compatibleDevice.capsDefines.delete("CAPS_MULTI_DRAW");
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  // Gaussian splats are self-colored, while this ambient contribution is used
  // by the Neural layer as a cheap approximation of Isaac's enclosed area-light
  // bounce. It does not recolor the source vertices.
  app.scene.ambientLight = NEURAL_LIGHTING.ambient;
  const camera = createCamera(app, "GaussianCamera");
  app.start();
  return { app, camera };
}

function loadAsset(app: pc.Application, asset: pc.Asset): Promise<pc.Asset> {
  return new Promise((resolve, reject) => {
    asset.ready(() => resolve(asset));
    asset.on("error", (error: unknown) => reject(error));
    app.assets.add(asset);
    app.assets.load(asset);
  });
}

export class ReconstructionViewer {
  private readonly manifest: SceneManifest;
  private readonly stage = q<HTMLElement>("#reconstruction-stage");
  private readonly canvas = q<HTMLCanvasElement>("#reconstruction-canvas");
  private readonly divider = q<HTMLElement>("#reconstruction-divider");
  private readonly loadingPanel = q<HTMLElement>("#loading-panel");
  private readonly loadingDetail = q<HTMLElement>("#loading-detail");
  private readonly errorPanel = q<HTMLElement>("#viewer-error");
  private readonly gaussianWorld: RenderWorld;
  private readonly neuralWorld: RenderWorld;
  private readonly gaussianLayer: pc.Layer;
  private readonly neuralLayer: pc.Layer;
  private readonly orbit: ConstrainedOrbit;
  private split = 50;
  private resizeObserver: ResizeObserver;

  constructor(manifest: SceneManifest) {
    this.manifest = manifest;
    this.gaussianWorld = createWorld(this.canvas);
    this.gaussianLayer = new pc.Layer({ name: "Gaussian reconstruction" });
    this.neuralLayer = new pc.Layer({ name: "Neural reconstruction" });
    this.gaussianWorld.app.scene.layers.pushTransparent(this.gaussianLayer);
    this.gaussianWorld.app.scene.layers.pushOpaque(this.neuralLayer);
    this.gaussianWorld.app.scene.layers.pushTransparent(this.neuralLayer);
    if (!this.gaussianWorld.camera.camera) throw new Error("Missing Gaussian camera component");
    this.gaussianWorld.camera.camera.layers = [this.gaussianLayer.id];
    const neuralCamera = createCamera(this.gaussianWorld.app, "NeuralCamera");
    if (!neuralCamera.camera) throw new Error("Missing Neural camera component");
    neuralCamera.camera.layers = [this.neuralLayer.id];
    neuralCamera.camera.priority = 1;
    // Isaac's RTX output is display transformed. The Gaussian camera remains
    // on PlayCanvas' default linear path so its established appearance is not
    // changed; only Neural receives this ACES/sRGB presentation transform.
    neuralCamera.camera.gammaCorrection = pc.GAMMA_SRGB;
    neuralCamera.camera.toneMapping = pc.TONEMAP_ACES;
    this.neuralWorld = { app: this.gaussianWorld.app, camera: neuralCamera };
    this.orbit = new ConstrainedOrbit(
      this.stage,
      [this.gaussianWorld.camera, this.neuralWorld.camera],
      manifest,
    );
    this.orbit.setEnabled(true);
    this.orbit.setOnChange(({ yaw, pitch, distanceMeters }) => {
      q<HTMLElement>("#camera-readout").textContent =
        `${Math.round(yaw)}° · ${Math.round(pitch)}° · ${distanceMeters.toFixed(2)}m`;
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.bindControls();
    this.setSplit(50);
  }

  async load(): Promise<void> {
    try {
      this.loadingDetail.textContent = "Loading 709K Gaussian splats…";
      const gsAsset = new pc.Asset(
        "Table cloth 3DGS",
        "gsplat",
        { url: this.manifest.models.gaussian.url },
      );
      await loadAsset(this.gaussianWorld.app, gsAsset);
      const gsEntity = new pc.Entity("TableClothGaussian");
      this.gaussianWorld.app.root.addChild(gsEntity);
      gsEntity.addComponent("gsplat", {
        resource: gsAsset.resource,
        unified: true,
        layers: [this.gaussianLayer.id],
      });

      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
      const mobile = matchMedia("(pointer: coarse)").matches || memory < 8;
      const neural = mobile ? this.manifest.models.neural.mobile : this.manifest.models.neural.high;
      this.loadingDetail.textContent =
        `Loading Neural mesh · ${(neural.bytes / 1_000_000).toFixed(1)} MB…`;
      const meshAsset = new pc.Asset("Table cloth Neural", "container", { url: neural.url });
      await loadAsset(this.neuralWorld.app, meshAsset);
      const resource = meshAsset.resource as {
        instantiateRenderEntity: (options?: object) => pc.Entity;
      };
      const meshEntity = resource.instantiateRenderEntity({
        castShadows: false,
        receiveShadows: false,
      });
      this.neuralWorld.app.root.addChild(meshEntity);
      const neuralMaterials = new Set<pc.StandardMaterial>();
      meshEntity.findComponents("render").forEach((component) => {
        const render = component as pc.RenderComponent;
        render.layers = [this.neuralLayer.id];
        render.meshInstances.forEach((meshInstance) => {
          if (meshInstance.material instanceof pc.StandardMaterial) {
            neuralMaterials.add(meshInstance.material);
          }
        });
      });
      // The copied GLB stores the same linear displayColor values as the USD.
      // Preserve them as diffuse input. A small color-matched emissive term
      // approximates the indirect enclosure fill visible in Isaac RTX without
      // changing or baking over those source colors.
      neuralMaterials.forEach((material) => {
        material.useLighting = true;
        material.diffuse.set(1, 1, 1);
        material.diffuseVertexColor = true;
        material.emissive.copy(NEURAL_LIGHTING.emissiveFill);
        material.emissiveVertexColor = true;
        material.useMetalness = false;
        material.specular.set(0.15, 0.15, 0.15);
        material.gloss = 0.15;
        material.update();
      });
      const keyLight = new pc.Entity("IsaacStyleKeyLight");
      keyLight.addComponent("light", {
        type: "directional",
        color: NEURAL_LIGHTING.key.color,
        intensity: NEURAL_LIGHTING.key.intensity,
        layers: [this.neuralLayer.id],
      });
      keyLight.setEulerAngles(NEURAL_LIGHTING.key.euler);
      this.neuralWorld.app.root.addChild(keyLight);

      const fillLight = new pc.Entity("IsaacStyleFillLight");
      fillLight.addComponent("light", {
        type: "directional",
        color: NEURAL_LIGHTING.fill.color,
        intensity: NEURAL_LIGHTING.fill.intensity,
        layers: [this.neuralLayer.id],
      });
      fillLight.setEulerAngles(NEURAL_LIGHTING.fill.euler);
      this.neuralWorld.app.root.addChild(fillLight);

      const rimLight = new pc.Entity("IsaacStyleRimLight");
      rimLight.addComponent("light", {
        type: "directional",
        color: NEURAL_LIGHTING.rim.color,
        intensity: NEURAL_LIGHTING.rim.intensity,
        layers: [this.neuralLayer.id],
      });
      rimLight.setEulerAngles(NEURAL_LIGHTING.rim.euler);
      this.neuralWorld.app.root.addChild(rimLight);

      this.loadingPanel.classList.add("loaded");
      this.stage.classList.add("ready");
      this.orbit.reset();
      this.resize();
    } catch (error) {
      this.loadingPanel.hidden = true;
      this.errorPanel.hidden = false;
      this.errorPanel.textContent =
        `Interactive model failed to load: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    }
  }

  /** Presentation-local capture hook used to preserve the original viewer's
   * exact Real / 3DGS camera behavior when generating the five comparison
   * images. The public page itself never switches the interactive viewer. */
  showCapturedGaussianView(view: CapturedView): void {
    const gaussianCamera = this.gaussianWorld.camera.camera;
    const neuralCamera = this.neuralWorld.camera.camera;
    if (!gaussianCamera || !neuralCamera) return;
    neuralCamera.enabled = false;
    gaussianCamera.enabled = true;
    gaussianCamera.rect = new pc.Vec4(0, 0, 1, 1);
    const position = new pc.Vec3(...view.camera.position);
    const target = new pc.Vec3(...view.camera.target);
    const up = new pc.Vec3(...view.camera.up).normalize();
    this.gaussianWorld.camera.setPosition(position);
    this.gaussianWorld.camera.lookAt(target, up);
    gaussianCamera.fov = view.camera.verticalFov;
    this.resize();
  }

  private setSplit(value: number): void {
    this.split = Math.max(18, Math.min(82, value));
    const split = this.split / 100;
    const gaussianCamera = this.gaussianWorld.camera.camera;
    const neuralCamera = this.neuralWorld.camera.camera;
    if (gaussianCamera && neuralCamera) {
      gaussianCamera.rect = new pc.Vec4(0, 0, split, 1);
      neuralCamera.rect = new pc.Vec4(split, 0, 1 - split, 1);
    }
    this.divider.style.left = `${this.split}%`;
    this.divider.setAttribute("aria-valuenow", String(Math.round(this.split)));
  }

  private bindControls(): void {
    let pointerId: number | null = null;
    const update = (clientX: number) => {
      const rect = this.stage.getBoundingClientRect();
      this.setSplit(((clientX - rect.left) / rect.width) * 100);
    };
    this.divider.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      this.divider.setPointerCapture(event.pointerId);
      update(event.clientX);
      event.stopPropagation();
    });
    this.divider.addEventListener("pointermove", (event) => {
      if (pointerId === event.pointerId) update(event.clientX);
    });
    this.divider.addEventListener("pointerup", () => { pointerId = null; });
    this.divider.addEventListener("pointercancel", () => { pointerId = null; });
    this.divider.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") this.setSplit(this.split - 2);
      else if (event.key === "ArrowRight") this.setSplit(this.split + 2);
      else return;
      event.preventDefault();
    });
    q<HTMLButtonElement>("#reset-camera").addEventListener("click", () => this.orbit.reset());
  }

  private resize(): void {
    const rect = this.stage.getBoundingClientRect();
    this.gaussianWorld.app.resizeCanvas(
      Math.max(1, Math.round(rect.width)),
      Math.max(1, Math.round(rect.height)),
    );
  }
}
