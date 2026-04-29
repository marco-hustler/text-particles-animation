import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from "@angular/core";

import { ParticleTextApp } from "../lib/ParticleTextApp";
import { ParticleTextParams } from "../lib/params";

const defaultParams: ParticleTextParams = {
  particleCount: 12000,
  mouseRadius: 120,
  mouseForce: 0.9,
  springStrength: 0.06,
  damping: 0.82,
  aliveNoiseAmplitude: 0.35,
  aliveNoiseFrequency: 0.9,
  texts: ["HELLO", "WORLD", "TEXT"],
  textIndex: 0,
  textSwitchMode: "auto",
  textSwitchIntervalMs: 2400,
  textMorphDurationMs: 700,
};

@Component({
  selector: "text-particles-canvas",
  template: `<canvas #canvas class="tp-canvas"></canvas>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 320px;
      }
      .tp-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class TextParticlesCanvasComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild("canvas", { static: true })
  private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  /**
   * Optional params override. Any missing values fall back to `defaultParams`.
   */
  @Input()
  params: Partial<ParticleTextParams> = {};

  private app: ParticleTextApp | null = null;

  private readonly onResize = () => this.app?.resize();

  ngAfterViewInit(): void {
    const merged = this.buildParams();
    this.app = new ParticleTextApp(this.canvasRef.nativeElement, merged);
    this.app.start();
    window.addEventListener("resize", this.onResize);
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.app) return;
    this.app.setParams(this.buildParams());
  }

  ngOnDestroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.app?.destroy();
    this.app = null;
  }

  private buildParams(): ParticleTextParams {
    return {
      ...defaultParams,
      ...this.params,
      // Ensure required fields are always present.
      texts: this.params.texts ?? defaultParams.texts,
      textIndex: this.params.textIndex ?? defaultParams.textIndex,
    };
  }
}

