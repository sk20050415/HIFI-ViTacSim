import * as pc from "playcanvas";
import type { SceneManifest } from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface CameraState {
  yaw: number;
  pitch: number;
  distanceMeters: number;
}

export class ConstrainedOrbit {
  private readonly stage: HTMLElement;
  private readonly cameras: pc.Entity[];
  private readonly center: pc.Vec3;
  private readonly worldUp: pc.Vec3;
  private readonly baseOut: pc.Vec3;
  private readonly baseRight: pc.Vec3;
  private readonly limits: SceneManifest["orbit"];
  private readonly unitsPerMeter: number;
  private yaw = 0;
  private pitch = 60;
  private distanceMeters = 0.90;
  private panX = 0;
  private panY = 0;
  private pointerId: number | null = null;
  private previousX = 0;
  private previousY = 0;
  private action: "orbit" | "pan" = "orbit";
  private enabled = false;
  private onChange: (state: CameraState) => void = () => undefined;

  constructor(stage: HTMLElement, cameras: pc.Entity[], manifest: SceneManifest) {
    this.stage = stage;
    this.cameras = cameras;
    this.center = new pc.Vec3(...manifest.table.center);
    this.limits = manifest.orbit;
    this.unitsPerMeter = manifest.orbit.unitsPerMeter ?? 1;
    this.worldUp = new pc.Vec3(...(manifest.orbit.worldUp ?? [0, 1, 0])).normalize();

    const capture = manifest.orbit.referencePosition ?? manifest.views[0].camera.position;
    const fromTarget = new pc.Vec3(...capture).sub(this.center);
    fromTarget.sub(this.worldUp.clone().mulScalar(fromTarget.dot(this.worldUp)));
    this.baseOut = fromTarget.lengthSq() > 1e-6 ? fromTarget.normalize() : new pc.Vec3(0, 0, 1);
    this.baseRight = new pc.Vec3().cross(this.worldUp, this.baseOut).normalize();
    this.bindEvents();
    this.apply();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setOnChange(callback: (state: CameraState) => void): void {
    this.onChange = callback;
    this.notify();
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 60;
    this.distanceMeters = 0.90;
    this.panX = 0;
    this.panY = 0;
    this.apply();
  }

  apply(): void {
    const yawRad = (this.yaw * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;
    const horizontal = this.baseOut.clone().mulScalar(Math.cos(yawRad)).add(
      this.baseRight.clone().mulScalar(Math.sin(yawRad)),
    );
    const direction = horizontal.mulScalar(Math.cos(pitchRad)).add(
      this.worldUp.clone().mulScalar(Math.sin(pitchRad)),
    ).normalize();
    const target = this.center.clone()
      .add(this.baseRight.clone().mulScalar(this.panX * this.unitsPerMeter))
      .add(this.baseOut.clone().mulScalar(this.panY * this.unitsPerMeter));
    const position = target.clone().add(direction.mulScalar(this.distanceMeters * this.unitsPerMeter));
    for (const camera of this.cameras) {
      camera.setPosition(position);
      camera.lookAt(target, this.worldUp);
      if (camera.camera) camera.camera.fov = 54.52;
    }
    this.notify();
  }

  private notify(): void {
    this.onChange({ yaw: this.yaw, pitch: this.pitch, distanceMeters: this.distanceMeters });
  }

  private bindEvents(): void {
    this.stage.addEventListener("contextmenu", (event) => event.preventDefault());
    this.stage.addEventListener("pointerdown", (event) => {
      if (!this.enabled || (event.target as HTMLElement).closest("#divider")) return;
      this.pointerId = event.pointerId;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
      this.action = event.button === 2 || event.shiftKey ? "pan" : "orbit";
      this.stage.setPointerCapture(event.pointerId);
    });
    this.stage.addEventListener("pointermove", (event) => {
      if (!this.enabled || this.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.previousX;
      const dy = event.clientY - this.previousY;
      this.previousX = event.clientX;
      this.previousY = event.clientY;
      if (this.action === "orbit") {
        this.yaw = clamp(this.yaw - dx * 0.28, this.limits.yawMin, this.limits.yawMax);
        this.pitch = clamp(this.pitch + dy * 0.24, this.limits.pitchMin, this.limits.pitchMax);
      } else {
        this.panX = clamp(this.panX - dx * 0.0018, -this.limits.panHalfExtentMeters[0], this.limits.panHalfExtentMeters[0]);
        this.panY = clamp(this.panY + dy * 0.0022, -this.limits.panHalfExtentMeters[1], this.limits.panHalfExtentMeters[1]);
      }
      this.apply();
    });
    const endPointer = (event: PointerEvent) => {
      if (this.pointerId === event.pointerId) this.pointerId = null;
    };
    this.stage.addEventListener("pointerup", endPointer);
    this.stage.addEventListener("pointercancel", endPointer);
    this.stage.addEventListener("wheel", (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0012);
      this.distanceMeters = clamp(
        this.distanceMeters * factor,
        this.limits.distanceMinMeters,
        this.limits.distanceMaxMeters,
      );
      this.apply();
    }, { passive: false });
    this.stage.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      if (event.key === "r" || event.key === "R") this.reset();
      else if (event.key === "ArrowLeft") this.yaw = clamp(this.yaw - 4, this.limits.yawMin, this.limits.yawMax);
      else if (event.key === "ArrowRight") this.yaw = clamp(this.yaw + 4, this.limits.yawMin, this.limits.yawMax);
      else if (event.key === "ArrowUp") this.pitch = clamp(this.pitch + 3, this.limits.pitchMin, this.limits.pitchMax);
      else if (event.key === "ArrowDown") this.pitch = clamp(this.pitch - 3, this.limits.pitchMin, this.limits.pitchMax);
      else return;
      event.preventDefault();
      this.apply();
    });
  }
}
