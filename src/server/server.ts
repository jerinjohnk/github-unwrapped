import react from "@vitejs/plugin-react-swc";
import bodyParser from "body-parser";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import serveStatic from "serve-static";
import { createServer } from "vite";
import { REDIRECT_URL_ENDPOINT } from "../helpers/redirect-url.js";
import { dashboardEndpoint } from "./dashboard.js";
import { faviconEndPoint } from "./favicon.js";
import { statsEndPoint } from "./fetch-stats.js";
import {
  indexHtmlDev,
  indexHtmlProduction,
  nodeEnv,
  publicDir,
  viteDir,
  viteDistDir,
} from "./index-html.js";
import { loginEndPoint } from "./login.js";
import { renderEndPoint } from "./render.js";
import { igStoryImageEndpoint, socialMediaPreview } from "./social-preview.js";
import { rendersDir } from "./store.js";
import {
  studioBitbucketRepos,
  studioGuard,
  studioPage,
  studioRender,
  studioStats,
} from "./studio.js";

const apiEndpointWrapper = (
  endpoint: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void | Response<unknown, Record<string, unknown>>> | void,
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await endpoint(req, res, next);
    } catch (error) {
      const err = error as Error;
      console.error(err);

      res.status(500).end(err.message);
    }
  };
};

const startViteDevelopmentServer = async (app: Express) => {
  const server = await createServer({
    configFile: false,
    root: viteDir,
    server: {
      middlewareMode: true,
    },
    appType: "custom",
    plugins: [react()],
    publicDir,
  });

  app.use((req, res, next) => {
    server.middlewares.handle(req, res, next);
  });

  return server;
};

export const startServer = async () => {
  const app = express();

  app.use(bodyParser.json());

  app.post("/api/render", apiEndpointWrapper(renderEndPoint));

  app.post("/api/stats", apiEndpointWrapper(statsEndPoint));

  app.get("/api/dashboard", apiEndpointWrapper(dashboardEndpoint));
  app.get("/og/:username.jpg", apiEndpointWrapper(socialMediaPreview));
  app.get("/og/:username.jpeg", apiEndpointWrapper(socialMediaPreview));
  app.get("/ig/:username.jpg", apiEndpointWrapper(igStoryImageEndpoint));
  app.get("/ig/:username.jpeg", apiEndpointWrapper(igStoryImageEndpoint));

  // Locally rendered videos, downloadable by the frontend.
  app.use(
    "/renders",
    serveStatic(rendersDir, {
      setHeaders: (res) => res.setHeader("Content-Disposition", "attachment"),
    }),
  );

  // Commitscape-style form: key, user and date range (see studio.ts).
  app.get("/studio", studioPage);
  app.use("/api/studio", studioGuard);
  app.post("/api/studio/stats", studioStats);
  app.post("/api/studio/render", studioRender);
  app.post("/api/studio/bitbucket/repos", studioBitbucketRepos);

  app.get("/favicon.ico", apiEndpointWrapper(faviconEndPoint));
  app.get(REDIRECT_URL_ENDPOINT, apiEndpointWrapper(loginEndPoint));

  if (nodeEnv === "development") {
    const vite = await startViteDevelopmentServer(app);

    app.get(
      "/about",
      indexHtmlDev(vite, { stats: true, handleUsername: false }),
    );
    app.get(
      "/loading/:username",
      indexHtmlDev(vite, { stats: false, handleUsername: false }),
    );

    app.get(
      "/dashboard",
      indexHtmlDev(vite, { stats: false, handleUsername: false }),
    );
    app.get(
      "/:username",
      indexHtmlDev(vite, { handleUsername: true, stats: true }),
    );
    app.get(
      "/:username/share",
      indexHtmlDev(vite, { stats: true, handleUsername: false }),
    );
    app.get(
      "/{*splat}",
      indexHtmlDev(vite, { stats: true, handleUsername: false }),
    );
  } else {
    app.get("/", indexHtmlProduction({ stats: true, handleUsername: false }));
    app.use(serveStatic(viteDistDir));
    app.get(
      "/about",
      indexHtmlProduction({ stats: true, handleUsername: false }),
    );

    app.get(
      "/dashboard",
      indexHtmlProduction({ stats: false, handleUsername: false }),
    );
    app.get(
      "/loading/:username",
      indexHtmlProduction({ stats: false, handleUsername: false }),
    );
    app.get(
      "/:username",
      indexHtmlProduction({ handleUsername: true, stats: true }),
    );
    app.get(
      "/:username/share",
      indexHtmlProduction({ handleUsername: false, stats: true }),
    );
    app.get(
      "/{*splat}",
      indexHtmlProduction({ handleUsername: false, stats: true }),
    );
  }

  const port = process.env.PORT || 8080;

  // Only reachable from this machine unless HOST says otherwise (e.g. HOST=0.0.0.0).
  const host = process.env.HOST || "127.0.0.1";

  app.listen(Number(port), host);
  console.log(`Listening on http://localhost:${port}`);
  console.log(`Studio (key + date range): http://localhost:${port}/studio`);
};
