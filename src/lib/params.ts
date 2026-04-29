export type ParticleTextParams = {
  particleCount: number;
  mouseRadius: number;
  mouseForce: number;
  springStrength: number;
  damping: number;
  aliveNoiseAmplitude: number;
  aliveNoiseFrequency: number;
  texts: string[];
  textIndex: number;
  /**
   * Controls how/when we switch between `texts`.
   * - `manual`: only external calls (e.g. `setParams({ textIndex })`) switch.
   * - `auto`: switches periodically using `textSwitchIntervalMs`.
   */
  textSwitchMode?: "manual" | "auto";
  /** Interval for auto switching (milliseconds). */
  textSwitchIntervalMs?: number;
  /** Duration of the morph between target positions (milliseconds). */
  textMorphDurationMs?: number;
  /** Hex color for the particles, e.g. "#f2fafe". Defaults to near-white. */
  particleColor?: string;
  /** Hex color for the page background, e.g. "#05060a". Defaults to near-black. */
  backgroundColor?: string;
};

export type ParticleTextState = {
  dpr: number;
  w: number;
  h: number;
};

