// Custom rocket colours ("#rrggbb"), shared by the server and the video.

export const ROCKET_COLOR = /^#[0-9a-f]{6}$/i;

export const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Hue in degrees, saturation and lightness in 0–1. */
export const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l] as const;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l] as const;
};

/** The preset rocket whose flame and soundtrack best match a colour. */
export const nearestRocketTheme = (
  hex: string,
): "blue" | "orange" | "yellow" => {
  const [h, s] = rgbToHsl(...hexToRgb(hex));
  if (s < 0.15 || (h >= 160 && h < 320)) {
    return "blue";
  }

  return h >= 40 && h < 160 ? "yellow" : "orange";
};
