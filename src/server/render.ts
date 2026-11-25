import type { Request, Response } from "express";
import { existsSync } from "node:fs";
import type { RenderResponse } from "../config.js";
import { RenderRequest, computeCompositionParameters } from "../config.js";
import { renderVideoLocally } from "./local-renderer.js";
import {
  getProfileStatsFromCache,
  renderFile,
  renderFileName,
} from "./store.js";

type RenderState =
  | { type: "running"; progress: number }
  | { type: "error"; error: string };

// In-memory state of renders started by this server process.
const renders = new Map<string, RenderState>();

const key = (username: string, theme: string) =>
  `${username.toLowerCase()}:${theme}`;

export const renderOrGetProgress = async (
  requestBody: unknown,
): Promise<RenderResponse> => {
  const { username, theme } = RenderRequest.parse(requestBody);
  const outputFile = renderFile(username, theme);

  if (existsSync(outputFile)) {
    return {
      type: "video-available",
      url: `/renders/${renderFileName(username, theme)}`,
    };
  }

  const state = renders.get(key(username, theme));
  if (state?.type === "running") {
    return { type: "render-running", progress: state.progress };
  }

  if (state?.type === "error") {
    // Report the error once; the next request will retry the render.
    renders.delete(key(username, theme));
    return { type: "render-error", error: state.error };
  }

  const userStat = await getProfileStatsFromCache(username);
  if (userStat === "not-found") {
    return { type: "render-error", error: "User not found" };
  }

  if (userStat === null) {
    return { type: "render-error", error: "User not fetched" };
  }

  const inputProps = computeCompositionParameters(userStat, theme);

  renders.set(key(username, theme), { type: "running", progress: 0 });
  console.log(`Rendering video for ${username} (${theme})...`);

  renderVideoLocally({
    inputProps,
    outputFile,
    onProgress: (progress) => {
      renders.set(key(username, theme), { type: "running", progress });
    },
  })
    .then(() => {
      console.log(`Rendered ${outputFile}`);
      renders.delete(key(username, theme));
    })
    .catch((err: Error) => {
      console.error(`Render failed for ${username} (${theme})`, err);
      renders.set(key(username, theme), {
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
