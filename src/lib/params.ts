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
};

export type ParticleTextState = {
  dpr: number;
  w: number;
  h: number;
};

