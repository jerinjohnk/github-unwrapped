import { config } from "dotenv";
import { z } from "zod";
import { REDIRECT_URL_ENDPOINT } from "./redirect-url.js";

const parseBackendCredentials = () => {
  return z
    .object({
      // A GitHub personal access token (no scopes needed for public data).
      // GITHUB_TOKEN_1 is still accepted for backwards compatibility.
      GITHUB_TOKEN: z
        .string()
        .min(1)
        .optional()
        .or(z.literal("").transform(() => undefined)),
      GITHUB_TOKEN_1: z
        .string()
        .min(1)
        .optional()
        .or(z.literal("").transform(() => undefined)),
      VITE_HOST: z.string().default("http://localhost:8080"),
      NODE_ENV: z.enum(["development", "production"]).default("development"),
      // Optional: Bitbucket Cloud credentials for the /studio page (Atlassian
      // account email + API token with read scopes); the page can supply them too.
      BITBUCKET_EMAIL: z.string().optional(),
      BITBUCKET_API_TOKEN: z.string().optional(),
      // Optional: GitHub OAuth app, only needed for "Sign in with GitHub"
      // (includes private contributions in the stats).
      VITE_CLIENT_ID: z.string().optional(),
      CLIENT_SECRET: z.string().optional(),
    })
    .transform(({ GITHUB_TOKEN, GITHUB_TOKEN_1, ...rest }) => ({
      ...rest,
      // Optional: the /studio page can supply a key per session instead.
      GITHUB_TOKEN: GITHUB_TOKEN ?? GITHUB_TOKEN_1,
    }))
    .parse(process.env);
};

let parsedBackendCredentials: ReturnType<
  typeof parseBackendCredentials
> | null = null;

export const backendCredentials = () => {
  if (!parsedBackendCredentials) {
    config({ quiet: true });
    parsedBackendCredentials = parseBackendCredentials();
  }

  return parsedBackendCredentials;
};

export const makeRedirectUriBackend = () => {
  return `${backendCredentials().VITE_HOST}${REDIRECT_URL_ENDPOINT}`;
};
