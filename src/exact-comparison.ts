import type { CapturedView, SceneManifest } from "./types";

const q = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

export class ExactComparison {
  private readonly stage = q<HTMLElement>("#exact-stage");
  private readonly real = q<HTMLImageElement>("#exact-real-layer");
  private readonly gaussian = q<HTMLImageElement>("#exact-gaussian-layer");
  private readonly divider = q<HTMLElement>("#exact-divider");
  private split = 50;

  constructor(manifest: SceneManifest) {
    this.bindDivider();
    this.renderViewButtons(manifest);
    this.showView(manifest.views[0]);
    this.setSplit(50);
  }

  private showView(view: CapturedView): void {
    this.real.src = view.real;
    this.gaussian.src = view.gaussian;
    this.real.alt = `Real capture · camera ${view.id}`;
    this.gaussian.alt = `Sim reconstruction · camera ${view.id}`;
  }

  private setSplit(value: number): void {
    this.split = Math.max(4, Math.min(96, value));
    this.gaussian.style.clipPath = `inset(0 ${100 - this.split}% 0 0)`;
    this.divider.style.left = `${this.split}%`;
    this.divider.setAttribute("aria-valuenow", String(Math.round(this.split)));
  }

  private bindDivider(): void {
    let pointerId: number | null = null;
    const update = (clientX: number) => {
      const rect = this.stage.getBoundingClientRect();
      this.setSplit(((clientX - rect.left) / rect.width) * 100);
    };
    this.divider.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      this.divider.setPointerCapture(event.pointerId);
      update(event.clientX);
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
  }

  private renderViewButtons(manifest: SceneManifest): void {
    const host = q<HTMLElement>("#exact-view-buttons");
    manifest.views.forEach((view, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === 0 ? "active" : "";
      button.innerHTML = `<span>0${index + 1}</span><small>${view.id}</small>`;
      button.setAttribute("aria-label", `Camera ${view.id}`);
      button.addEventListener("click", () => {
        this.showView(view);
        host.querySelectorAll("button").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
      });
      host.appendChild(button);
    });
  }
}
