/** h in degrees (any value, wrapped), s and v in 0–1 → [r, g, b] in 0–255. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] =
    hh < 1
      ? [c, x, 0]
      : hh < 2
        ? [x, c, 0]
        : hh < 3
          ? [0, c, x]
          : hh < 4
            ? [0, x, c]
            : hh < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = v - c;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Exact HSV disc: angle = hue (0° at 3 o'clock, counter-clockwise), radius = saturation. */
export function paintWheel(ctx: CanvasRenderingContext2D, size: number, value: number): void {
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d > r) {
        img.data[i + 3] = 0;
        continue;
      }
      const hue = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
      const [red, green, blue] = hsvToRgb(hue, d / r, value);
      img.data[i] = red;
      img.data[i + 1] = green;
      img.data[i + 2] = blue;
      img.data[i + 3] = d > r - 1 ? Math.round(255 * (r - d)) : 255; // soft edge
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Knob position for (h, s) on a wheel of `size` px. */
export function wheelPoint(h: number, s: number, size: number): { x: number; y: number } {
  const r = size / 2;
  const rad = (h * Math.PI) / 180;
  return { x: r + Math.cos(rad) * s * r, y: r - Math.sin(rad) * s * r };
}

/** Pointer position on the wheel → (h, s). */
export function wheelHueSat(px: number, py: number, size: number): { h: number; s: number } {
  const r = size / 2;
  const h = ((Math.atan2(-(py - r), px - r) * 180) / Math.PI + 360) % 360;
  return { h, s: Math.min(1, Math.hypot(px - r, py - r) / r) };
}
