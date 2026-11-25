import type { Request, Response } from "express";
import { existsSync } from "node:fs";
import type { RenderResponse } from "../config.js";
import { RenderRequest, computeCompositionParameters } from "../config.js";
import type { DateRange } from "../helpers/date-range.js";
import { rangeKey, resolveRange } from "../helpers/date-range.js";
import { renderVideoLocally } from "./local-renderer.js";
import { getProfileStatsFromCache, renderFile, renderPath } from "./store.js";

type RenderState =
  { type: "running"; progress: number } | { type: "error"; error: string };

// In-memory state of renders started by this server process.
const renders = new Map<string, RenderState>();

const renderKey = (username: string, theme: string, range: DateRange) =>
  `${username.toLowerCase()}:${theme}:${rangeKey(range)}`;

export const renderOrGetProgress = async (
  requestBody: unknown,
): Promise<RenderResponse> => {
  const { username, theme, from, to } = RenderRequest.parse(requestBody);
  const range = resolveRange({ from, to });
  const key = renderKey(username, theme, range);
  const outputFile = renderFile(username, theme, range);

  if (existsSync(outputFile)) {
    return {
      type: "video-available",
      url: `/renders/${renderPath(username, theme, range)}`,
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

  const userStat = getProfileStatsFromCache(username, range);
  if (userStat === "not-found") {
    return { type: "render-error", error: "User not found" };
  }

  if (userStat === null) {
    return { type: "render-error", error: "User not fetched" };
  }

  const inputProps = computeCompositionParameters(userStat, theme);

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
