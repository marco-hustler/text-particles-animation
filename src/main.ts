import { ParticleTextApp } from "./lib/ParticleTextApp";
import { createControlsOverlay } from "./ui/controlsOverlay";
import "./styles.css";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

const app = new ParticleTextApp(canvas, {
  particleCount: 12000,
  mouseRadius: 120,
  mouseForce: 1.35,
  springStrength: 0.11,
  damping: 0.82,
  aliveNoiseAmplitude: 0.14,
  aliveNoiseFrequency: 0.9,
  texts: ["HELLO"],
  textIndex: 0,
  textSwitchMode: "manual",
  textSwitchIntervalMs: 2400,
  textMorphDurationMs: 700,
  particleColor: "#f2fafe",
  backgroundColor: "#05060a",
  fontScale: 1.0,
});

app.start();

// ── Controls overlay ──────────────────────────────────────────────────────────
// Set `visible: false` to hide the panel entirely (useful for embedding / demo).
const { el: overlayEl, setVisible: setControlsVisible } = createControlsOverlay(
  (next) => app.setParams(next),
  { visible: true },
);

document.body.appendChild(overlayEl);

// Exposed on window so the panel can be toggled from the browser console:
//   window.setControlsVisible(false)
(window as unknown as Record<string, unknown>).setControlsVisible = setControlsVisible;

// Keep canvas responsive to resizing.
window.addEventListener("resize", () => {
  app.resize();
});
