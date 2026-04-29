import { ParticleTextApp } from "./lib/ParticleTextApp";
import { createControlsOverlay } from "./ui/controlsOverlay";
import "./styles.css";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

const app = new ParticleTextApp(canvas, {
  particleCount: 12000,
  mouseRadius: 120,
  mouseForce: 0.9,
  springStrength: 0.06,
  damping: 0.82,
  aliveNoiseAmplitude: 0.35,
  aliveNoiseFrequency: 0.9,
  texts: ["HELLO", "WORLD", "TEXT"],
  textIndex: 0,
});

app.start();

const overlayEl = createControlsOverlay((next) => {
  app.setParams(next);
});

document.body.appendChild(overlayEl);

// Keep canvas responsive to resizing.
window.addEventListener("resize", () => {
  app.resize();
});

