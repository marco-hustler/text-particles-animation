export type SampleTextTargetsInput = {
  particleCount: number;
  text: string;
  canvasWidth: number; // physical px
  canvasHeight: number; // physical px
  fontFamily?: string;
  fontWeight?: number;
};

/**
 * Samples solid pixels from an (offscreen) canvas to build target positions.
 * Returns positions in clip-space coordinates (WebGL-friendly).
 */
export function sampleTextTargets({
  particleCount,
  text,
  canvasWidth,
  canvasHeight,
  fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
  fontWeight = 700,
}: SampleTextTargetsInput): Float32Array {
  const safeParticleCount = Math.max(1, Math.floor(particleCount));
  const w = Math.max(1, Math.floor(canvasWidth));
  const h = Math.max(1, Math.floor(canvasHeight));
  const out = new Float32Array(safeParticleCount * 2);

  // Cap sampling resolution for performance while preserving shape.
  const maxSampleDim = 1200;
  const scale = Math.min(1, maxSampleDim / Math.max(w, h));
  const sw = Math.max(1, Math.floor(w * scale));
  const sh = Math.max(1, Math.floor(h * scale));

  const offscreen =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(sw, sh)
      : (() => {
          const c = document.createElement("canvas");
          c.width = sw;
          c.height = sh;
          return c;
        })();

  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("TargetSampler: 2D context unavailable");

  ctx.clearRect(0, 0, sw, sh);
  const drawText = (text ?? "").trim() || "TEXT";

  // Fit text to the viewport much more aggressively so the particle target
  // shape is clearly legible even at first load on wide screens.
  const maxTextWidth = sw * 0.68;
  const maxTextHeight = sh * 0.28;
  let fontSize = Math.max(24, Math.floor(Math.min(sw, sh) * 0.24));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,1)";

  while (fontSize > 18) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(drawText);
    const textWidth = metrics.width;
    const textHeight =
      (metrics.actualBoundingBoxAscent || fontSize * 0.72) +
      (metrics.actualBoundingBoxDescent || fontSize * 0.18);

    if (textWidth <= maxTextWidth && textHeight <= maxTextHeight) {
      break;
    }
    fontSize -= 4;
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillText(drawText, sw / 2, sh / 2);

  const img = ctx.getImageData(0, 0, sw, sh);
  const data = img.data;

  const area = sw * sh;
  const stride0 = Math.max(1, Math.floor(Math.sqrt(area / safeParticleCount)));
  const threshold0 = 15; // alpha threshold (0..255), tuned for anti-aliasing

  let candidates: Float32Array | null = null;
  let bestStride = stride0;

  // Try a couple strategies to reach enough candidate pixels.
  for (let attempt = 0; attempt < 4; attempt++) {
    const stride = Math.max(1, Math.floor(stride0 / Math.sqrt(attempt + 1)));
    const threshold = Math.max(1, Math.floor(threshold0 / (attempt + 1)));
    bestStride = stride;

    const cand: number[] = [];
    for (let y = 0; y < sh; y += stride) {
      const rowBase = y * sw * 4;
      for (let x = 0; x < sw; x += stride) {
        const a = data[rowBase + x * 4 + 3];
        if (a >= threshold) {
          // Convert pixel to clip-space (-1..1).
          const xClip = (x / sw) * 2 - 1;
          const yClip = ((sh - y) / sh) * 2 - 1;
          cand.push(xClip, yClip);
        }
      }
    }

    const candCount = cand.length / 2;
    if (candCount >= safeParticleCount * 0.85) {
      candidates = new Float32Array(cand);
      break;
    }

    // Keep the last attempt's result if it's closer to the desired count.
    if (!candidates || candCount > candidates.length / 2) {
      candidates = new Float32Array(cand);
    }
  }

  if (!candidates) return out;

  const candCount = candidates.length / 2;
  if (candCount <= 0) return out;

  // Deterministic particle->pixel mapping: avoid Math.random so target remapping
  // between texts/resizes doesn't cause uncontrolled particle "permutations".
  const hashToUnit = (i: number, salt: number) => {
    const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };

  if (candCount >= safeParticleCount) {
    // Cover the candidate set in quantiles.
    for (let i = 0; i < safeParticleCount; i++) {
      const k = Math.min(
        candCount - 1,
        Math.floor(((i + 0.5) * candCount) / safeParticleCount)
      );
      out[i * 2] = candidates[k * 2]!;
      out[i * 2 + 1] = candidates[k * 2 + 1]!;
    }
    return out;
  }

  // Not enough pixels: map each particle to a candidate in quantiles and
  // apply a small deterministic jitter.
  const jitterPx = bestStride * 0.45 + 0.9;
  const jitterClipX = (jitterPx / sw) * 2;
  const jitterClipY = (jitterPx / sh) * 2;

  for (let i = 0; i < safeParticleCount; i++) {
    const k = Math.min(candCount - 1, Math.floor((i * candCount) / safeParticleCount));
    const baseX = candidates[k * 2]!;
    const baseY = candidates[k * 2 + 1]!;
    const jx = (hashToUnit(i, 1) * 2 - 1) * jitterClipX;
    const jy = (hashToUnit(i, 2) * 2 - 1) * jitterClipY;
    out[i * 2] = baseX + jx;
    out[i * 2 + 1] = baseY + jy;
  }

  return out;
}

