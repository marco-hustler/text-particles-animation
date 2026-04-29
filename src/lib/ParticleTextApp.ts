import { ParticleTextParams, ParticleTextState } from "./params";

/**
 * Temporary starter implementation:
 * - sets up public API (start/resize/setParams/destroy)
 * - does NOT yet implement WebGL particles
 *
 * This file exists to make the repo runnable immediately; later we will plug the
 * real ParticleSystem/TextTargeter/WebGLRenderer implementations behind it.
 */
export class ParticleTextApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastTs = 0;

  private params: ParticleTextParams;
  private state: ParticleTextState;

  constructor(canvas: HTMLCanvasElement, params: ParticleTextParams) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;

    this.params = params;
    this.state = {
      dpr: 1,
      w: 1,
      h: 1,
    };
  }

  start(): void {
    this.resize();
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  resize(): void {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    this.state.dpr = dpr;
    this.state.w = w;
    this.state.h = h;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
  }

  setParams(next: Partial<ParticleTextParams>): void {
    this.params = { ...this.params, ...next };
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private update(_dt: number): void {
    // Placeholder: will be replaced by WebGL particle simulation.
  }

  private render(): void {
    // Placeholder: clear background only, keep the canvas “alive”.
    const { dpr, w, h } = this.state;
    const cw = w * dpr;
    const ch = h * dpr;

    this.ctx.clearRect(0, 0, cw, ch);

    // Subtle animated vignette so we can visually confirm resizing & loop health.
    const t = performance.now() * 0.001;
    const grad = this.ctx.createRadialGradient(
      cw * 0.3 + Math.sin(t * 0.2) * cw * 0.05,
      ch * 0.15 + Math.cos(t * 0.17) * ch * 0.05,
      Math.min(cw, ch) * 0.1,
      cw * 0.5,
      ch * 0.55,
      Math.min(cw, ch) * 0.8
    );
    grad.addColorStop(0, "rgba(80,120,255,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, cw, ch);

    // Text hint (will be removed when WebGL renderer takes over).
    this.ctx.save();
    this.ctx.scale(dpr, dpr);
    this.ctx.fillStyle = "rgba(255,255,255,0.75)";
    this.ctx.font = "600 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const text = this.params.texts[this.params.textIndex] ?? "";
    this.ctx.fillText(text, w / 2, h / 2);
    this.ctx.restore();
  }
}

