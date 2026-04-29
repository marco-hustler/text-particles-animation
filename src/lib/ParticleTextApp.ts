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
  // During the initial seconds after (re)building the simulation we slightly
  // increase attraction strength so the text converges quickly.
  private convergeElapsed = 0;
  private convergeWarmupSec = 0.9;
  private settleSnapSec = 1.8;

  private positions: Float32Array = new Float32Array(0); // clip-space [-1..1]
  private velocities: Float32Array = new Float32Array(0);
  private targets: Float32Array = new Float32Array(0);
  private targetsNext: Float32Array | null = null;
  private morphElapsed = 0;
  private particleCount = 0;

  private seedsX: Float32Array = new Float32Array(0);
  private seedsY: Float32Array = new Float32Array(0);
  // Per-particle disturbance memory (0..1): used to restore only the local
  // area affected by mouse interaction.
  private disturbed: Float32Array = new Float32Array(0);

  // Elapsed time since the mouse last left the canvas (Infinity = mouse never
  // left yet or the return animation has fully completed). When it is finite
  // and small, we re-run the same strong snap/converge pass that handles the
  // initial text formation, giving the particles visible elastic return.
  private restoreElapsed: number = Infinity;
  private prevPointerInside: boolean = false;

  private pointerInside = false;
  private mouseXClip = 0;
  private mouseYClip = 0;
  private mouseInfluence = 0;

  private onPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onPointerLeave: ((ev: Event) => void) | null = null;
  private onWindowPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onKeyDown: ((ev: KeyboardEvent) => void) | null = null;
  private autoTextElapsed = 0;

  constructor(canvas: HTMLCanvasElement, params: ParticleTextParams) {
    this.canvas = canvas;

    this.params = params;
    this.state = {
      dpr: 1,
      w: 1,
      h: 1,
    };
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

    this.applyBackgroundColor(this.params.backgroundColor ?? "#05060a");
    this.installPointerListeners();
    this.installKeyboardListeners();
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
      // Morph to the new targets to avoid any apparent teleport on resize/high-DPI.
      this.startTextMorph(this.params.textIndex);
    }
  }

  setParams(next: Partial<ParticleTextParams>): void {
    const prev = this.params;
    this.params = { ...this.params, ...next };

    if (typeof next.backgroundColor === "string" && next.backgroundColor !== prev.backgroundColor) {
      this.applyBackgroundColor(next.backgroundColor);
    }

    const particleCountChanged =
      typeof next.particleCount === "number" && next.particleCount !== prev.particleCount;
    const textIndexChanged =
      typeof next.textIndex === "number" && next.textIndex !== prev.textIndex;

    if (particleCountChanged) {
      this.rebuildSimulation(true);
      return;
    }

    if (textIndexChanged) {
      this.startTextMorph(this.params.textIndex);
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
    if (this.onWindowPointerMove) {
      window.removeEventListener("pointermove", this.onWindowPointerMove);
    }
    this.onPointerMove = null;
    this.onPointerLeave = null;
    this.onWindowPointerMove = null;

    if (this.onKeyDown) {
      window.removeEventListener("keydown", this.onKeyDown);
      this.onKeyDown = null;
    }
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

    this.onWindowPointerMove = (ev: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const inside =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      if (!inside) this.pointerInside = false;
    };

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointermove", this.onWindowPointerMove);
    // Fallback when pointer leaves window.
    window.addEventListener("blur", this.onPointerLeave);
  }

  private installKeyboardListeners(): void {
    if (this.onKeyDown) return;
    this.onKeyDown = (ev: KeyboardEvent) => {
      const len = this.params.texts.length;
      if (len <= 1) return;

      if (ev.key === "ArrowRight" || ev.key === " ") {
        ev.preventDefault();
        const next = (this.params.textIndex + 1) % len;
        this.setParams({ textIndex: next });
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        const prev = (this.params.textIndex - 1 + len) % len;
        this.setParams({ textIndex: prev });
      }
    };
    window.addEventListener("keydown", this.onKeyDown);
  }

  private rebuildSimulation(resetPositions: boolean): void {
    const nextCount = Math.max(1, Math.floor(this.params.particleCount));
    this.particleCount = nextCount;

    this.positions = new Float32Array(nextCount * 2);
    this.velocities = new Float32Array(nextCount * 2);
    this.targets = new Float32Array(nextCount * 2);
    this.targetsNext = null;
    this.morphElapsed = 0;
    this.seedsX = new Float32Array(nextCount);
    this.seedsY = new Float32Array(nextCount);
    this.disturbed = new Float32Array(nextCount);
    this.convergeElapsed = 0;

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

    this.updateTargetsInstant();

    // Upload initial position buffer.
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  private updateTargetsInstant(): void {
    const text = this.params.texts[this.params.textIndex] ?? "";
    if (this.particleCount <= 0) return;

    const sampled = sampleTextTargets({
      particleCount: this.particleCount,
      text,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    });

    if (sampled.length !== this.targets.length) {
      // Safety: keep arrays consistent with the sampler.
      this.targets = sampled;
      this.positions = new Float32Array(this.particleCount * 2);
      this.velocities = new Float32Array(this.particleCount * 2);
    } else {
      this.targets.set(sampled);
    }

    // Any morph in flight must stop once we've committed targets instantly.
    this.targetsNext = null;
    this.morphElapsed = 0;
  }

  private smoothstep01(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  private getConvergenceBoost(): number {
    // Slower and smoother initial formation:
    // starts around ~4.2x and decays progressively to ~1x.
    return 1 + 3.2 * Math.exp(-this.convergeElapsed / this.convergeWarmupSec);
  }

  private getTextMorphDurationSec(): number {
    const ms = this.params.textMorphDurationMs ?? 650;
    return Math.max(1 / 120, ms / 1000);
  }

  private commitCurrentMorphBlend(): void {
    if (!this.targetsNext) return;

    const durationSec = this.getTextMorphDurationSec();
    const t = durationSec > 0 ? Math.min(1, this.morphElapsed / durationSec) : 1;
    const alpha = this.smoothstep01(t);
    const dst = this.targetsNext;

    for (let i = 0; i < this.targets.length; i++) {
      this.targets[i] = this.targets[i] * (1 - alpha) + dst[i] * alpha;
    }

    this.targetsNext = null;
    this.morphElapsed = 0;
  }

  private sampleTargetsForTextIndex(textIndex: number): Float32Array {
    const text = this.params.texts[textIndex] ?? "";
    return sampleTextTargets({
      particleCount: this.particleCount,
      text,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    });
  }

  private startTextMorph(textIndex: number): void {
    if (this.particleCount <= 0 || this.params.texts.length <= 0) return;

    // Ensure the "from" targets represent the current blended state.
    this.commitCurrentMorphBlend();

    const sampled = this.sampleTargetsForTextIndex(textIndex);
    if (sampled.length !== this.targets.length) {
      // Extreme safety: keep simulation arrays consistent.
      this.targets = sampled;
      this.targetsNext = null;
      this.morphElapsed = 0;
      return;
    }

    this.targetsNext = sampled;
    this.morphElapsed = 0;
  }

  private advanceAutoText(dt: number): void {
    const mode = this.params.textSwitchMode ?? "manual";
    if (mode !== "auto") return;
    const len = this.params.texts.length;
    if (len <= 1) return;

    const intervalMs = this.params.textSwitchIntervalMs ?? 2500;
    const intervalSec = intervalMs / 1000;
    if (intervalSec <= 0) return;

    this.autoTextElapsed += dt;
    while (this.autoTextElapsed >= intervalSec) {
      this.autoTextElapsed -= intervalSec;
      const nextIndex = (this.params.textIndex + 1) % len;
      if (nextIndex !== this.params.textIndex) {
        this.setParams({ textIndex: nextIndex });
      }
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
    // Use different rates for enter/exit so the "release" feels natural.
    const fadeInRate = 16; // higher => faster response
    const fadeOutRate = 18; // higher => faster elastic return
    const fadeRate = influenceTarget > this.mouseInfluence ? fadeInRate : fadeOutRate;
    const deltaInfluence = influenceTarget - this.mouseInfluence;
    this.mouseInfluence += deltaInfluence * (1 - Math.exp(-fadeRate * dt));

    // Detect the moment the pointer leaves the canvas and start the elastic
    // return timer. We reset it here (after mouseInfluence has been updated so
    // the new value is already available for the current step).
    if (!this.pointerInside && this.prevPointerInside) {
      this.restoreElapsed = 0;
    }
    this.prevPointerInside = this.pointerInside;
    if (isFinite(this.restoreElapsed)) {
      this.restoreElapsed += dt;
      // Stop tracking once the return animation window has passed.
      if (this.restoreElapsed > this.settleSnapSec * 1.5) {
        this.restoreElapsed = Infinity;
      }
    }

    this.simTime += dt;
    this.convergeElapsed += dt;
    this.advanceAutoText(dt);

    const { w, h } = this.state;
    const minDim = Math.max(1, Math.min(w, h));

    const dampingFactor = Math.pow(this.params.damping, dt * 60);
    // Extra damping during return helps avoid uncontrolled oscillations.
    // During the initial warmup (no mouse influence) we reduce damping so
    // convergence to the text is fast and visible without user input.
    const returnFactor = 1 - this.mouseInfluence; // 0..1
    const warmup01 = Math.exp(-this.convergeElapsed / (this.convergeWarmupSec * 0.8)); // 1->0
    const dampingExtra = 1 - 0.12 * returnFactor * (1 - warmup01); // ~1 during warmup, ~0.88 later
    const dampingFactorEff = dampingFactor * dampingExtra;
    const springStrengthBase = this.params.springStrength * this.getConvergenceBoost();
    // After mouse interaction, briefly increase spring attraction so the text
    // snaps back quickly with an elastic feel.
    const returnBoost = 1 + (1 - this.mouseInfluence) * 1.1;
    // Additional boost while the elastic-return window is active.
    const returnSnapBlend = isFinite(this.restoreElapsed)
      ? Math.max(0, 1 - this.restoreElapsed / this.settleSnapSec)
      : 0;
    const returnSpringBoost = 1 + returnSnapBlend * 3.0;
    const springStrength = springStrengthBase * returnBoost * returnSpringBoost;
    const mouseAccelScale = 1.1;

    const rPx = this.params.mouseRadius;
    const rClip = (rPx * 2) / minDim;

    const maxVel = 4.0;
    const clamp = (v: number) => Math.max(-maxVel, Math.min(maxVel, v));

    // Low-amplitude equilibrium offset: keeps the "alive" feel subtle
    // without injecting high-frequency acceleration jitter.
    // While the mouse is leaving, slightly reduce this to help settle back
    // toward the original text targets (less visual "ringing").
    const aliveScale = 0.25 + 0.75 * this.mouseInfluence;
    const aliveOffsetClipAmp = this.params.aliveNoiseAmplitude * 0.02 * aliveScale;
    const t = this.simTime;
    const f = this.params.aliveNoiseFrequency;
    // Blend initial-formation snap and post-mouse-exit return snap so that
    // the elastic return reuses the same position-pull + velocity-damping pass.
    const initialSnapBlend = Math.max(0, 1 - this.convergeElapsed / this.settleSnapSec);
    const snapBlend = Math.max(initialSnapBlend, returnSnapBlend);

    let dstTargets: Float32Array | null = null;
    let morphBlend = 0;
    if (this.targetsNext) {
      const durationSec = this.getTextMorphDurationSec();
      this.morphElapsed += dt;
      const progress = durationSec > 0 ? Math.min(1, this.morphElapsed / durationSec) : 1;
      morphBlend = this.smoothstep01(progress);
      dstTargets = this.targetsNext;

      if (progress >= 1) {
        // Morph complete: commit targets and stop blending.
        this.targets = dstTargets;
        this.targetsNext = null;
        this.morphElapsed = 0;
        dstTargets = null;
        morphBlend = 0;
      }
    }

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

      const targetX = dstTargets
        ? this.targets[ix]! * (1 - morphBlend) + dstTargets[ix]! * morphBlend
        : this.targets[ix]!;
      const targetY = dstTargets
        ? this.targets[ix + 1]! * (1 - morphBlend) + dstTargets[ix + 1]! * morphBlend
        : this.targets[ix + 1]!;

      const tx = targetX + nx * aliveOffsetClipAmp - x;
      const ty = targetY + ny * aliveOffsetClipAmp - y;
      let ax = tx * springStrength;
      let ay = ty * springStrength;

      // Ensure the very first formation is unmistakably fast and readable:
      // during the initial settle window, blend in a direct position pull
      // toward the target. This is softer than teleporting but much more
      // decisive than pure spring integration.
      if (snapBlend > 0) {
        const snapStrength = 0.1 * snapBlend;
        x += tx * snapStrength;
        y += ty * snapStrength;
        // Also damp residual velocity while settling so particles stop looking
        // like a generic cloud and quickly lock into glyph shapes.
        this.velocities[ix] *= 1 - 0.35 * snapBlend;
        this.velocities[ix + 1] *= 1 - 0.35 * snapBlend;
      }

      // Mouse repulsion (local, smooth falloff).
      let localRepel = 0;
      if (this.mouseInfluence > 0.001) {
        const dx = x - this.mouseXClip;
        const dy = y - this.mouseYClip;
        const distClipSq = dx * dx + dy * dy;

        if (distClipSq > 1e-10) {
          const distClip = Math.sqrt(distClipSq);
          if (distClip < rClip) {
            const t = 1 - distClip / rClip;
            const falloff = t * t * (3 - 2 * t); // smoothstep-like
            const force = this.params.mouseForce * mouseAccelScale * falloff * this.mouseInfluence;
            ax += (dx / distClip) * force;
            ay += (dy / distClip) * force;
            localRepel = falloff * this.mouseInfluence;
          }
        }
      }

      // Local disturbance memory:
      // - increases quickly when particle is repelled by mouse
      // - decays smoothly afterward
      // This allows only the disturbed region to elastically return.
      const prevDisturbed = this.disturbed[i]!;
      const rise = localRepel * 0.55;
      const decay = 1 - Math.exp(-5.5 * dt);
      const disturbedNow = prevDisturbed + (rise - prevDisturbed) * decay;
      this.disturbed[i] = disturbedNow;

      // Local elastic return for disturbed particles only.
      if (disturbedNow > 0.001) {
        const localRestore = disturbedNow * (0.14 * dt * 60);
        x += tx * localRestore;
        y += ty * localRestore;
        // Kill residual momentum after hover so particles can re-lock to glyphs.
        if (!this.pointerInside) {
          this.velocities[ix] *= 1 - disturbedNow * 0.22;
          this.velocities[ix + 1] *= 1 - disturbedNow * 0.22;
        }
      }

      // Semi-implicit Euler with damping for stability.
      let vx = this.velocities[ix]!;
      let vy = this.velocities[ix + 1]!;

      vx = vx * dampingFactorEff + ax * dt;
      vy = vy * dampingFactorEff + ay * dt;
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
    const [pr, pg, pb] = this.hexToRgb01(this.params.particleColor ?? "#f2fafe");
    gl.useProgram(this.program);
    gl.uniform1f(this.uPointSize, pointSize);
    gl.uniform3f(this.uColor, pr, pg, pb);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
  }

  private computePointSizePx(): number {
    const dpr = this.state.dpr;
    const densityFactor = Math.sqrt(12000 / Math.max(1, this.particleCount));
    const size = 1.7 * dpr * densityFactor;
    return Math.max(1, Math.min(4, size));
  }

  private applyBackgroundColor(hex: string): void {
    document.body.style.background = hex;
  }

  private hexToRgb01(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const full = h.length === 3
      ? h.split("").map(c => c + c).join("")
      : h;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    return [
      isNaN(r) ? 0.95 : r,
      isNaN(g) ? 0.98 : g,
      isNaN(b) ? 1.0 : b,
    ];
  }
}

