export class RolloutGallery {
  private readonly tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rollout-tab]"));
  private readonly panels = Array.from(document.querySelectorAll<HTMLElement>("[data-rollout-panel]"));

  constructor() {
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => this.show(tab.dataset.rolloutTab ?? ""));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === "ArrowLeft" ? -1 : 1;
        const nextIndex = event.key === "Home" ? 0
          : event.key === "End" ? this.tabs.length - 1
            : (index + offset + this.tabs.length) % this.tabs.length;
        const next = this.tabs[nextIndex];
        next.focus();
        this.show(next.dataset.rolloutTab ?? "");
      });
    });
  }

  private show(task: string): void {
    this.tabs.forEach((tab) => {
      const active = tab.dataset.rolloutTab === task;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    this.panels.forEach((panel) => {
      const active = panel.dataset.rolloutPanel === task;
      panel.hidden = !active;
      if (!active) panel.querySelectorAll("video").forEach((video) => video.pause());
    });
  }
}
