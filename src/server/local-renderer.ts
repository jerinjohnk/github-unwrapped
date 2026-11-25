// Renders videos and stills on this machine with @remotion/renderer,
// replacing Remotion Lambda.

import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { renameSync, rmSync } from "node:fs";
import path from "path";
import { rootDir } from "./store.js";

// Remote assets (e.g. the GitHub avatar) can be slow to load on some networks,
// so allow more than Remotion's default 30s per delayRender().
const TIMEOUT_IN_MS = 120_000;

let bundlePromise: Promise<string> | null = null;

// Webpack-bundle the Remotion project once per server process.
export const getServeUrl = () => {
  if (!bundlePromise) {
    console.log("Bundling Remotion project (first render only)...");
    bundlePromise = bundle({
      entryPoint: path.join(rootDir, "remotion", "index.ts"),
      publicDir: path.join(rootDir, "public"),
    }).catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }

  return bundlePromise;
};

// Renders are CPU-heavy, so run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
};

export const renderVideoLocally = ({
  inputProps,
  outputFile,
  onProgress,
}: {
  inputProps: Record<string, unknown>;
  outputFile: string;
  onProgress: (progress: number) => void;
}) => {
  return enqueue(async () => {
    const serveUrl = await getServeUrl();
    const composition = await selectComposition({
      serveUrl,
      id: "Main",
      inputProps,
      timeoutInMilliseconds: TIMEOUT_IN_MS,
    });

    // Write to a temp file so a half-finished render is never served.
    const tmpFile = `${outputFile}.part.mp4`;
    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        imageFormat: "jpeg",
        outputLocation: tmpFile,
        inputProps,
        timeoutInMilliseconds: TIMEOUT_IN_MS,
        onProgress: ({ progress }) => onProgress(progress),
      });
      renameSync(tmpFile, outputFile);
    } finally {
      rmSync(tmpFile, { force: true });
    }
  });
};

export const renderStillLocally = async ({
  compositionId,
  inputProps,
  outputFile,
}: {
  compositionId: string;
  inputProps: Record<string, unknown>;
  outputFile: string;
}) => {
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    timeoutInMilliseconds: TIMEOUT_IN_MS,
  });

  await renderStill({
    composition,
    serveUrl,
    output: outputFile,
    inputProps,
    imageFormat: "jpeg",
    jpegQuality: 100,
    timeoutInMilliseconds: TIMEOUT_IN_MS,
  });
};
