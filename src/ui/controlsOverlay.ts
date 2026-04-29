import { ParticleTextParams } from "../lib/params";

export function createControlsOverlay(
  onChange: (next: Partial<ParticleTextParams>) => void
): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "controls";

  const makeRange = <K extends keyof ParticleTextParams>(opts: {
    label: string;
    key: K;
    min: number;
    max: number;
    step: number;
    value: number;
  }) => {
    const row = document.createElement("div");
    row.className = "controls-row";

    const label = document.createElement("label");
    label.className = "controls-label";
    label.textContent = opts.label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);

    input.addEventListener("input", () => {
      onChange({ [opts.key]: Number(input.value) } as Partial<ParticleTextParams>);
    });

    const valueEl = document.createElement("div");
    valueEl.className = "controls-value";
    valueEl.textContent = String(opts.value);
    input.addEventListener("input", () => {
      valueEl.textContent = input.value;
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valueEl);
    return row;
  };

  // These defaults match src/main.ts. When we implement real particle params,
  // we will derive them from ParticleTextApp state.
  root.appendChild(
    makeRange({
      label: "Mouse radius",
      key: "mouseRadius",
      min: 30,
      max: 220,
      step: 1,
      value: 120,
    })
  );
  root.appendChild(
    makeRange({
      label: "Mouse force",
      key: "mouseForce",
      min: 0.1,
      max: 2.0,
      step: 0.01,
      value: 0.9,
    })
  );
  root.appendChild(
    makeRange({
      label: "Spring strength",
      key: "springStrength",
      min: 0.01,
      max: 0.2,
      step: 0.001,
      value: 0.06,
    })
  );
  root.appendChild(
    makeRange({
      label: "Damping",
      key: "damping",
      min: 0.6,
      max: 0.95,
      step: 0.01,
      value: 0.82,
    })
  );
  root.appendChild(
    makeRange({
      label: "Alive noise",
      key: "aliveNoiseAmplitude",
      min: 0,
      max: 1.0,
      step: 0.01,
      value: 0.35,
    })
  );
  root.appendChild(
    makeRange({
      label: "Noise freq",
      key: "aliveNoiseFrequency",
      min: 0.1,
      max: 2.0,
      step: 0.01,
      value: 0.9,
    })
  );

  const style = document.createElement("style");
  style.textContent = `
    .controls{
      position: fixed;
      top: 16px;
      right: 16px;
      width: 320px;
      padding: 12px 12px;
      border: 1px solid var(--ui-border);
      background: var(--ui-bg);
      border-radius: 12px;
      color: var(--ui-text);
      backdrop-filter: blur(10px);
      z-index: 10;
      font-size: 12px;
      box-sizing: border-box;
    }
    .controls-row{ display:flex; align-items:center; gap:10px; margin: 8px 0; }
    .controls-label{ width: 120px; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }
    .controls input[type="range"]{ flex: 1; }
    .controls-value{ width: 50px; text-align:right; font-variant-numeric: tabular-nums; opacity: .9;}
  `;
  root.appendChild(style);

  // Hide overlay on very small screens (keeps the hero clean).
  const hint = document.createElement("div");
  hint.style.marginTop = "6px";
  hint.style.opacity = "0.75";
  hint.textContent = "Controls (UI stub for runtime tuning)";
  root.appendChild(hint);

  return root;
}

