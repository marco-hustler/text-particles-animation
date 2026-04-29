import { ParticleTextParams, ParticleTextState } from "./params";
import { sampleTextTargets } from "./TargetSampler";

export class ParticleTextApp {
  private readonly canvas: HTMLCanvasElement;
  private params: ParticleTextParams;
  private state: ParticleTextState;

  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private posBuffer: WebGLBuffer;

  private uPointSize: WebGLUniformLocation;
  private uColor: WebGLUniformLocation;

  private rafId: number | null = null;
  private lastTs = 0;

  private fixedDt = 1 / 60;
  private accumulator = 0;
  private simTime = 0;

  private positions: Float32Array = new Float32Array(0); // clip-space [-1..1]
  private velocities: Float32Array = new Float32Array(0);
  private targets: Float32Array = new Float32Array(0);
  private particleCount = 0;

  private seedsX: Float32Array = new Float32Array(0);
  private seedsY: Float32Array = new Float32Array(0);

  private pointerInside = false;
  private mouseXClip = 0;
  private mouseYClip = 0;
  private mouseInfluence = 0;

  private onPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onPointerLeave: ((ev: Event) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, params: ParticleTextParams) {
    this.canvas = canvas;

    this.params = params;
    this.state = {
      dpr: 1,
      w: 1,
      h: 1,
    };

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error("WebGL2 context unavailable");
    this.gl = gl;

    const vs = `#version 300 es
      precision highp float;

      layout(location = 0) in vec2 aPos;
      uniform float uPointSize;
      void main() {
        gl_Position = vec4(aPos, 0.0, 1.0);
        gl_PointSize = uPointSize;
      }`;

    const fs = `#version 300 es
      precision highp float;
      out vec4 outColor;

      uniform vec3 uColor;

      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float r = length(p);
        float alpha = 1.0 - smoothstep(0.18, 0.48, r);
        outColor = vec4(uColor, alpha);
      }`;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL: shader allocation failed");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(`WebGL shader compile failed: ${info}`);
      }
      return shader;
    };

    const vsObj = compile(gl.VERTEX_SHADER, vs);
    const fsObj = compile(gl.FRAGMENT_SHADER, fs);

    const program = gl.createProgram();
    if (!program) throw new Error("WebGL: program allocation failed");
    gl.attachShader(program, vsObj);
    gl.attachShader(program, fsObj);
    gl.linkProgram(program);
    gl.deleteShader(vsObj);
    gl.deleteShader(fsObj);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? "Unknown program error";
      gl.deleteProgram(program);
      throw new Error(`WebGL program link failed: ${info}`);
    }

    this.program = program;
    this.vao = gl.createVertexArray();
    if (!this.vao) throw new Error("WebGL: VAO allocation failed");
    this.posBuffer = gl.createBuffer();
    if (!this.posBuffer) throw new Error("WebGL: buffer allocation failed");

    const uPointSize = gl.getUniformLocation(program, "uPointSize");
    const uColor = gl.getUniformLocation(program, "uColor");
    if (!uPointSize || !uColor) throw new Error("WebGL: uniform locations missing");
    this.uPointSize = uPointSize;
    this.uColor = uColor;

    // Static render state.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Configure aPos attribute once.
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  start(): void {
    if (this.rafId != null) return;

    this.installPointerListeners();
    this.resize();
    this.rebuildSimulation(true);

    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
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

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Only rebuild targets (keep current positions) when we already have particles.
    if (this.particleCount > 0) {
      this.updateTargets();
    }
  }

  setParams(next: Partial<ParticleTextParams>): void {
    const prev = this.params;
    this.params = { ...this.params, ...next };

    const particleCountChanged =
      typeof next.particleCount === "number" && next.particleCount !== prev.particleCount;
    const textIndexChanged =
      typeof next.textIndex === "number" && next.textIndex !== prev.textIndex;

    if (particleCountChanged) {
      this.rebuildSimulation(true);
      return;
    }

    if (textIndexChanged) {
      this.updateTargets();
    }
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    this.pointerInside = false;
    if (this.onPointerMove) this.canvas.removeEventListener("pointermove", this.onPointerMove);
    if (this.onPointerLeave) {
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      window.removeEventListener("blur", this.onPointerLeave);
    }
    this.onPointerMove = null;
    this.onPointerLeave = null;
  }

  private installPointerListeners(): void {
    if (this.onPointerMove) return; // already installed

    this.onPointerMove = (ev: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x01 = (ev.clientX - rect.left) / rect.width;
      const y01 = (ev.clientY - rect.top) / rect.height;
      // Clip space: x [-1..1], y [-1..1] with +Y up.
      this.mouseXClip = x01 * 2 - 1;
      this.mouseYClip = (1 - y01) * 2 - 1;
      this.pointerInside = true;
    };

    this.onPointerLeave = (_ev: Event) => {
      this.pointerInside = false;
    };

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    // Fallback when pointer leaves window.
    window.addEventListener("blur", this.onPointerLeave);
  }

  private rebuildSimulation(resetPositions: boolean): void {
    const nextCount = Math.max(1, Math.floor(this.params.particleCount));
    this.particleCount = nextCount;

    this.positions = new Float32Array(nextCount * 2);
    this.velocities = new Float32Array(nextCount * 2);
    this.targets = new Float32Array(nextCount * 2);
    this.seedsX = new Float32Array(nextCount);
    this.seedsY = new Float32Array(nextCount);

    // Deterministic-ish seeds per rebuild.
    for (let i = 0; i < nextCount; i++) {
      this.seedsX[i] = Math.random() * Math.PI * 2;
      this.seedsY[i] = Math.random() * Math.PI * 2;
    }

    if (resetPositions) {
      // Random initial positions so particles converge smoothly into the text.
      const spread = 1.2;
      for (let i = 0; i < nextCount; i++) {
        const ix = i * 2;
        this.positions[ix] = (Math.random() * 2 - 1) * spread;
        this.positions[ix + 1] = (Math.random() * 2 - 1) * spread;
        this.velocities[ix] = (Math.random() * 2 - 1) * 0.02;
        this.velocities[ix + 1] = (Math.random() * 2 - 1) * 0.02;
      }
    }

    this.updateTargets();

    // Upload initial position buffer.
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  private updateTargets(): void {
    const text = this.params.texts[this.params.textIndex] ?? "";
    if (this.particleCount <= 0) return;

    const sampled = sampleTextTargets({
      particleCount: this.particleCount,
      text,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    });

    if (sampled.length !== this.targets.length) {
      // Shouldn't happen, but keep it safe.
      this.targets = sampled;
      this.positions = new Float32Array(this.particleCount * 2);
      this.velocities = new Float32Array(this.particleCount * 2);
    } else {
      this.targets.set(sampled);
    }
  }

  private loop = (ts: number): void => {
    const dtReal = Math.min(0.1, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.accumulator += dtReal;

    const maxSteps = 5; // avoid spiral of death
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < maxSteps) {
      this.simStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }

    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private simStep(dt: number): void {
    // Smooth mouse influence to avoid sudden force changes.
    const influenceTarget = this.pointerInside ? 1 : 0;
    const fadeRate = 10; // higher => faster response
    const deltaInfluence = influenceTarget - this.mouseInfluence;
    this.mouseInfluence += deltaInfluence * (1 - Math.exp(-fadeRate * dt));

    this.simTime += dt;

    const { w, h } = this.state;
    const halfW = w / 2;
    const halfH = h / 2;
    const invMinDim = 2 / Math.max(1, Math.min(w, h));

    const dampingFactor = Math.pow(this.params.damping, dt * 60);
    const springStrength = this.params.springStrength;
    const mouseAccelScale = 0.12;

    const rPx = this.params.mouseRadius;

    const maxVel = 4.0;
    const clamp = (v: number) => Math.max(-maxVel, Math.min(maxVel, v));

    // Low-amplitude equilibrium offset: keeps the "alive" feel subtle
    // without injecting high-frequency acceleration jitter.
    const aliveOffsetClipAmp = this.params.aliveNoiseAmplitude * 0.02;
    const t = this.simTime;
    const f = this.params.aliveNoiseFrequency;

    for (let i = 0; i < this.particleCount; i++) {
      const ix = i * 2;
      let x = this.positions[ix]!;
      let y = this.positions[ix + 1]!;

      // Spring force towards target positions.
      const sx = this.seedsX[i]!;
      const sy = this.seedsY[i]!;

      // Multi-octave, smooth-ish "organic" drift. The offsets are in clip-space
      // and applied to the spring equilibrium, not directly as acceleration.
      const n1 = Math.sin(t * f + sx);
      const n2 = Math.sin(t * f * 0.73 + sx * 2.33);
      const n3 = Math.sin(t * f * 1.27 + sx * 0.77);
      const nx = (n1 + 0.55 * n2 + 0.25 * n3) / (1 + 0.55 + 0.25);

      const m1 = Math.cos(t * f + sy);
      const m2 = Math.cos(t * f * 0.81 + sy * 1.91);
      const m3 = Math.cos(t * f * 1.17 + sy * 0.58);
      const ny = (m1 + 0.55 * m2 + 0.25 * m3) / (1 + 0.55 + 0.25);

      const tx = this.targets[ix]! + nx * aliveOffsetClipAmp - x;
      const ty = this.targets[ix + 1]! + ny * aliveOffsetClipAmp - y;
      let ax = tx * springStrength;
      let ay = ty * springStrength;

      // Mouse repulsion (local, smooth falloff).
      if (this.mouseInfluence > 0.001) {
        const dx = x - this.mouseXClip;
        const dy = y - this.mouseYClip;
        const distClipSq = dx * dx + dy * dy;

        if (distClipSq > 1e-10) {
          const distClip = Math.sqrt(distClipSq);
          const distPx = Math.sqrt(
            (dx * halfW) * (dx * halfW) + (dy * halfH) * (dy * halfH)
          );
          if (distPx < rPx) {
            const t = 1 - distPx / rPx;
            const falloff = t * t * (3 - 2 * t); // smoothstep-like
            const force = this.params.mouseForce * mouseAccelScale * falloff * this.mouseInfluence;
            ax += (dx / distClip) * force * invMinDim * 8;
            ay += (dy / distClip) * force * invMinDim * 8;
          }
        }
      }

      // Semi-implicit Euler with damping for stability.
      let vx = this.velocities[ix]!;
      let vy = this.velocities[ix + 1]!;

      vx = vx * dampingFactor + ax * dt;
      vy = vy * dampingFactor + ay * dt;
      vx = clamp(vx);
      vy = clamp(vy);

      x += vx * dt;
      y += vy * dt;

      // Prevent numeric explosion while keeping text readable.
      x = Math.max(-1.3, Math.min(1.3, x));
      y = Math.max(-1.3, Math.min(1.3, y));

      this.positions[ix] = x;
      this.positions[ix + 1] = y;
      this.velocities[ix] = vx;
      this.velocities[ix + 1] = vy;
    }
  }

  private render(): void {
    const gl = this.gl;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Upload updated particle positions.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);

    const pointSize = this.computePointSizePx();
    gl.useProgram(this.program);
    gl.uniform1f(this.uPointSize, pointSize);
    gl.uniform3f(this.uColor, 0.95, 0.98, 1.0);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
  }

  private computePointSizePx(): number {
    const dpr = this.state.dpr;
    const densityFactor = Math.sqrt(12000 / Math.max(1, this.particleCount));
    const size = 1.7 * dpr * densityFactor;
    return Math.max(1, Math.min(3, size));
  }
}

