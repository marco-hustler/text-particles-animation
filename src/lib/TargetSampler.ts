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

  const fontSize = Math.max(10, Math.floor(Math.min(sw, sh) * 0.18));
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,1)";

  // Draw centered text. Keep it simple: we only need a coherent alpha mask.
  const drawText = text ?? "";
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

  const pickOne = () => {
    const ci = Math.floor(Math.random() * candCount);
    return [candidates[ci * 2]!, candidates[ci * 2 + 1]!];
  };

  if (candCount >= safeParticleCount) {
    for (let i = 0; i < safeParticleCount; i++) {
      const [xClip, yClip] = pickOne();
      out[i * 2] = xClip;
      out[i * 2 + 1] = yClip;
    }
    return out;
  }

  // Not enough pixels: duplicate and jitter to reach the target count.
  for (let i = 0; i < candCount; i++) {
    out[i * 2] = candidates[i * 2]!;
    out[i * 2 + 1] = candidates[i * 2 + 1]!;
  }

  const jitterPx = bestStride * 0.45 + 0.9;
  const jitterClipX = (jitterPx / sw) * 2;
  const jitterClipY = (jitterPx / sh) * 2;

  for (let i = candCount; i < safeParticleCount; i++) {
    const [xClip, yClip] = pickOne();
    const jx = (Math.random() * 2 - 1) * jitterClipX;
    const jy = (Math.random() * 2 - 1) * jitterClipY;
    out[i * 2] = xClip + jx;
    out[i * 2 + 1] = yClip + jy;
  }

  return out;
}

