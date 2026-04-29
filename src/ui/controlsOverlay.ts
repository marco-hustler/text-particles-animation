import { ParticleTextParams } from "../lib/params";

/** Predefined color themes. Clicking one applies both particle and background colors. */
const PALETTES: Array<{ name: string; particle: string; bg: string }> = [
  { name: "Default",  particle: "#f2fafe", bg: "#05060a" },
  { name: "Ocean",    particle: "#5ff5ff", bg: "#011520" },
  { name: "Matrix",   particle: "#00ff41", bg: "#000d00" },
  { name: "Fire",     particle: "#ff8c42", bg: "#150500" },
  { name: "Rose",     particle: "#ff6eb4", bg: "#110010" },
  { name: "Gold",     particle: "#ffd700", bg: "#100900" },
  { name: "Ice",      particle: "#b8e4ff", bg: "#020c18" },
  { name: "Violet",   particle: "#c47aff", bg: "#0a0015" },
];

export type ControlsOverlayHandle = {
  /** The DOM element to mount in the page. */
  el: HTMLDivElement;
  /** Show or hide the entire controls panel at runtime. */
  setVisible(visible: boolean): void;
};

/**
 * Creates the floating controls overlay.
 *
 * @param onChange  Called whenever a parameter changes.
 * @param options.visible  Initial visibility (default `true`).
 */
export function createControlsOverlay(
  onChange: (next: Partial<ParticleTextParams>) => void,
  options: { visible?: boolean } = {},
): ControlsOverlayHandle {
  // ── root panel ──────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.className = "controls";

  const setVisible = (v: boolean) => {
    root.style.display = v ? "" : "none";
  };
  setVisible(options.visible ?? true);

  // ── helpers ──────────────────────────────────────────────────────────────────
  const makeRange = <K extends keyof ParticleTextParams>(opts: {
    label: string;
    key: K;
    min: number;
    max: number;
    step: number;
    value: number;
    event?: "input" | "change";
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

    const valueEl = document.createElement("div");
    valueEl.className = "controls-value";
    valueEl.textContent = String(opts.value);

    const updateValueEl = () => { valueEl.textContent = input.value; };
    const commit = () => {
      onChange({ [opts.key]: Number(input.value) } as Partial<ParticleTextParams>);
    };

    if (opts.event === "change") {
      input.addEventListener("input", updateValueEl);
      input.addEventListener("change", () => { updateValueEl(); commit(); });
    } else {
      input.addEventListener("input", () => { updateValueEl(); commit(); });
    }

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(valueEl);
    return row;
  };

  /**
   * Builds a color-picker row. Fires onChange immediately on every color change.
   * Returns `{ row, setValue }` so callers can sync the picker when a palette
   * preset is applied.
   */
  const makeColor = <K extends keyof ParticleTextParams>(opts: {
    label: string;
    key: K;
    value: string;
  }) => {
    const row = document.createElement("div");
    row.className = "controls-row";

    const label = document.createElement("label");
    label.className = "controls-label";
    label.textContent = opts.label;

    const swatch = document.createElement("div");
    swatch.className = "controls-swatch";

    const input = document.createElement("input");
    input.type = "color";
    input.value = opts.value;
    input.className = "controls-color-input";
    swatch.appendChild(input);

    const valueEl = document.createElement("div");
    valueEl.className = "controls-value controls-value--mono";
    valueEl.textContent = opts.value;

    input.addEventListener("input", () => {
      valueEl.textContent = input.value;
      onChange({ [opts.key]: input.value } as Partial<ParticleTextParams>);
    });

    row.appendChild(label);
    row.appendChild(swatch);
    row.appendChild(valueEl);

    const setValue = (hex: string) => {
      input.value = hex;
      valueEl.textContent = hex;
    };

    return { row, setValue };
  };

  /**
   * Builds a text-input row that maps to `{ texts: [value], textIndex: 0 }`.
   * Fires on Enter / blur and after a 350 ms debounce while typing.
   */
  const makeTextInput = (initialValue: string) => {
    const row = document.createElement("div");
    row.className = "controls-row";

    const label = document.createElement("label");
    label.className = "controls-label";
    label.textContent = "Text";

    const input = document.createElement("input");
    input.type = "text";
    input.value = initialValue;
    input.placeholder = "Type anything…";
    input.className = "controls-text-input";
    input.spellcheck = false;

    let debounceTimer = 0;
    const commit = () => {
      const v = input.value.trim() || initialValue;
      onChange({ texts: [v], textIndex: 0 });
    };
    input.addEventListener("change", () => { commit(); });
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(commit, 350);
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
  };

  // ── text + font scale (top section) ─────────────────────────────────────────
  const topDivider = document.createElement("div");
  topDivider.className = "controls-divider";

  root.appendChild(makeTextInput("HELLO"));
  root.appendChild(
    makeRange({ label: "Font scale", key: "fontScale", min: 0.3, max: 2.5, step: 0.05, value: 1.0 })
  );
  root.appendChild(topDivider);
  root.appendChild(makeRange({ label: "Particle count", key: "particleCount", min: 2000, max: 20000, step: 500, value: 12000, event: "change" }));
  root.appendChild(makeRange({ label: "Mouse radius",   key: "mouseRadius",   min: 30,   max: 220,   step: 1,     value: 120 }));
  root.appendChild(makeRange({ label: "Mouse force",    key: "mouseForce",    min: 0.1,  max: 3.0,   step: 0.01,  value: 1.35 }));
  root.appendChild(makeRange({ label: "Spring strength",key: "springStrength",min: 0.01, max: 0.2,   step: 0.001, value: 0.11 }));
  root.appendChild(makeRange({ label: "Damping",        key: "damping",       min: 0.6,  max: 0.95,  step: 0.01,  value: 0.82 }));
  root.appendChild(makeRange({ label: "Alive noise",    key: "aliveNoiseAmplitude", min: 0, max: 1.0, step: 0.01, value: 0.14 }));
  root.appendChild(makeRange({ label: "Noise freq",     key: "aliveNoiseFrequency", min: 0.1, max: 2.0, step: 0.01, value: 0.9 }));

  // ── color pickers ────────────────────────────────────────────────────────────
  const divider = document.createElement("div");
  divider.className = "controls-divider";
  root.appendChild(divider);

  const { row: particleRow, setValue: setParticleValue } =
    makeColor({ label: "Particles", key: "particleColor", value: "#f2fafe" });
  const { row: bgRow, setValue: setBgValue } =
    makeColor({ label: "Background", key: "backgroundColor", value: "#05060a" });
  root.appendChild(particleRow);
  root.appendChild(bgRow);

  // ── color palette ────────────────────────────────────────────────────────────
  const paletteSection = document.createElement("div");
  paletteSection.className = "controls-palette-section";

  const paletteLabel = document.createElement("div");
  paletteLabel.className = "controls-palette-label";
  paletteLabel.textContent = "Themes";
  paletteSection.appendChild(paletteLabel);

  const paletteGrid = document.createElement("div");
  paletteGrid.className = "controls-palette-grid";

  PALETTES.forEach((palette) => {
    const btn = document.createElement("button");
    btn.className = "controls-palette-btn";
    btn.title = palette.name;
    btn.setAttribute("aria-label", palette.name);
    btn.style.setProperty("--p-particle", palette.particle);
    btn.style.setProperty("--p-bg", palette.bg);
    btn.addEventListener("click", () => {
      setParticleValue(palette.particle);
      setBgValue(palette.bg);
      onChange({ particleColor: palette.particle, backgroundColor: palette.bg });
    });

    const inner = document.createElement("span");
    inner.className = "controls-palette-inner";
    btn.appendChild(inner);

    const nameLbl = document.createElement("span");
    nameLbl.className = "controls-palette-name";
    nameLbl.textContent = palette.name;
    btn.appendChild(nameLbl);

    paletteGrid.appendChild(btn);
  });

  paletteSection.appendChild(paletteGrid);
  root.appendChild(paletteSection);

  // ── styles ───────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    .controls{
      position: fixed;
      top: 16px;
      right: 16px;
      width: 340px;
      padding: 12px 14px;
      border: 1px solid var(--ui-border);
      background: var(--ui-bg);
      border-radius: 12px;
      color: var(--ui-text);
      backdrop-filter: blur(10px);
      z-index: 10;
      font-size: 12px;
      line-height: 1.25;
      max-height: 90vh;
      overflow-y: auto;
      box-sizing: border-box;
      pointer-events: none;
    }
    .controls-row{
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 7px 0;
    }
    .controls-label{
      width: 108px;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .controls input[type="range"]{ flex: 1; pointer-events: auto; }
    .controls-value{
      width: 52px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      opacity: .9;
      flex-shrink: 0;
    }
    .controls-value--mono{
      font-family: ui-monospace, monospace;
      font-size: 10px;
    }
    .controls-text-input{
      flex: 1;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      color: var(--ui-text);
      font-size: 12px;
      padding: 4px 8px;
      outline: none;
      pointer-events: auto;
      min-width: 0;
    }
    .controls-text-input:focus{
      border-color: rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.1);
    }
    .controls-swatch{
      flex: 1;
      height: 26px;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      pointer-events: auto;
    }
    .controls-color-input{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
      padding: 0;
      cursor: pointer;
      background: none;
    }
    .controls-divider{
      height: 1px;
      background: var(--ui-border);
      margin: 10px 0;
    }
    /* ── palette ── */
    .controls-palette-section{
      margin-top: 4px;
      pointer-events: auto;
    }
    .controls-palette-label{
      font-size: 11px;
      opacity: 0.65;
      margin-bottom: 6px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .controls-palette-grid{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .controls-palette-btn{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 2px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .controls-palette-btn:hover{
      background: rgba(255,255,255,0.07);
    }
    .controls-palette-inner{
      display: block;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--p-particle);
      box-shadow: 0 0 0 3px var(--p-bg), 0 0 0 4.5px var(--p-particle);
    }
    .controls-palette-name{
      font-size: 9px;
      color: var(--ui-text);
      opacity: 0.7;
      white-space: nowrap;
    }
  `;
  root.appendChild(style);

  return { el: root, setVisible };
}
