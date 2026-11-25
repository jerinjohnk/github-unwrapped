// Custom rocket colours. The rocket art only exists in three colours, so a
// custom colour is made at render time: the orange rocket's body pixels are
// shifted to the chosen hue, keeping their shading; the window, outlines and
// highlights (other hues, very dark or unsaturated pixels) stay as drawn.

import React, { createContext, useContext, useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { hexToRgb, rgbToHsl } from "../src/helpers/rocket-color";

type Images = { front: string; side: string };

const RocketImagesContext = createContext<Images | null>(null);

/** The recoloured rocket images, or null to use the preset ones. */
export const useCustomRocketImages = () => useContext(RocketImagesContext);

const hslToRgb = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255] as const;
};

// The orange rocket's body: orange/red hues with some saturation.
const isBody = (h: number, s: number, l: number) =>
  s > 0.25 && l > 0.08 && l < 0.92 && (h < 50 || h > 340);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });

const recolor = async (src: string, hex: string): Promise<string> => {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D is not available");
  }

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  // Average saturation and lightness of the body, to map them onto the target.
  let sSum = 0;
  let lSum = 0;
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) {
      continue;
    }

    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (isBody(h, s, l)) {
      sSum += s;
      lSum += l;
      count++;
    }
  }

  const baseS = count ? sSum / count : 0.7;
  const baseL = count ? lSum / count : 0.5;
  const [targetH, targetS, targetL] = rgbToHsl(...hexToRgb(hex));

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) {
      continue;
    }

    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (!isBody(h, s, l)) {
      continue;
    }

    const newS = Math.min(1, s * (targetS / baseS));
    // Move lightness towards the target while keeping the shading.
    const newL =
      targetL >= baseL
        ? l + ((1 - l) * (targetL - baseL)) / (1 - baseL)
        : l * (targetL / baseL);
    const [r, g, b] = hslToRgb(targetH, newS, Math.min(1, Math.max(0, newL)));
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }

  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
};

/** Makes recoloured rocket images available to every scene below it. */
export const RocketColorProvider: React.FC<{
  readonly color: string | undefined;
  readonly children: React.ReactNode;
}> = ({ color, children }) => {
  const [images, setImages] = useState<Images | null>(null);
  const [handle] = useState(() =>
    color ? delayRender(`Recolouring the rocket to ${color}`) : null,
  );

  useEffect(() => {
    if (!color || handle === null) {
      return;
    }

    Promise.all([
      recolor(staticFile("rocket-front-orange.png"), color),
      recolor(staticFile("rocket-side-orange.png"), color),
    ])
      .then(([front, side]) => {
        setImages({ front, side });
        continueRender(handle);
      })
      .catch((err) => {
        // Fall back to the preset images rather than failing the render.
        console.error(err);
        continueRender(handle);
      });
  }, [color, handle]);

  return (
    <RocketImagesContext.Provider value={images}>
      {children}
    </RocketImagesContext.Provider>
  );
};
