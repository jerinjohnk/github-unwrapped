import type { Request, Response } from "express";
import { existsSync } from "node:fs";
import type { RenderResponse } from "../config.js";
import { RenderRequest, computeCompositionParameters } from "../config.js";
import type { DateRange } from "../helpers/date-range.js";
import { rangeKey, resolveRange } from "../helpers/date-range.js";
import { nearestRocketTheme } from "../helpers/rocket-color.js";
import { renderVideoLocally } from "./local-renderer.js";
import {
  getProfileStatsFromCache,
  renderFile,
  renderPath,
  storeOwner,
} from "./store.js";

type RenderState =
  { type: "running"; progress: number } | { type: "error"; error: string };

// In-memory state of renders started by this server process.
const renders = new Map<string, RenderState>();

const renderKey = (username: string, theme: string, range: DateRange) =>
  `${username.toLowerCase()}:${theme}:${rangeKey(range)}`;

export const renderOrGetProgress = async (
  requestBody: unknown,
): Promise<RenderResponse> => {
  const {
    username,
    theme: requestedTheme,
    from,
    to,
    platform,
    variant,
    rocketColor: color,
  } = RenderRequest.parse(requestBody);
  const rocketColor = color?.toLowerCase();
  // A custom colour uses the closest preset's flame and music, and gets its
  // own cached video.
  const theme = rocketColor ? nearestRocketTheme(rocketColor) : requestedTheme;
  const fileTheme = rocketColor ? `color-${rocketColor.slice(1)}` : theme;
  const range = resolveRange({ from, to });
  const owner = storeOwner(platform, username, variant);
  const key = renderKey(owner, fileTheme, range);
  const outputFile = renderFile(owner, fileTheme, range);

  if (existsSync(outputFile)) {
    return {
      type: "video-available",
      url: `/renders/${renderPath(owner, fileTheme, range)}`,
    };
  }

  const state = renders.get(key);
  if (state?.type === "running") {
    return { type: "render-running", progress: state.progress };
  }

  if (state?.type === "error") {
    // Report the error once; the next request will retry the render.
    renders.delete(key);
    return { type: "render-error", error: state.error };
  }

  const userStat = getProfileStatsFromCache(owner, range);
  if (userStat === "not-found") {
    return { type: "render-error", error: "User not found" };
  }

  if (userStat === null) {
    return { type: "render-error", error: "User not fetched" };
  }

  const inputProps = computeCompositionParameters(userStat, theme, rocketColor);

  renders.set(key, { type: "running", progress: 0 });
  console.log(
    `Rendering video for ${username} (${theme}, ${range.from} to ${range.to})...`,
  );

  renderVideoLocally({
    inputProps,
    outputFile,
    onProgress: (progress) => {
      renders.set(key, { type: "running", progress });
    },
  })
    .then(() => {
      console.log(`Rendered ${outputFile}`);
      renders.delete(key);
    })
    .catch((err: Error) => {
      console.error(`Render failed for ${username} (${theme})`, err);
      renders.set(key, {
        type: "error",
        error: err.stack ?? err.message,
      });
    });

  return { type: "render-running", progress: 0 };
};

export const renderEndPoint = async (request: Request, response: Response) => {
  if (request.method === "OPTIONS") {
    return response.end();
  }

  const res = await renderOrGetProgress(request.body);

  return response.json(res);
};
