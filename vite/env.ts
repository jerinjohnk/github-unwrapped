import { z } from "zod";
import { REDIRECT_URL_ENDPOINT } from "../src/helpers/redirect-url";

const frontendSchema = z.object({
  // Optional: only needed for "Sign in with GitHub".
  VITE_CLIENT_ID: z.string().optional(),
  VITE_HOST: z.string().default("http://localhost:8080"),
});

export const frontendCredentials = () => frontendSchema.parse(import.meta.env);

export const makeRedirectUriFrontend = (reset: boolean = false) => {
  return `${
    frontendCredentials().VITE_HOST
  }${REDIRECT_URL_ENDPOINT}?reset=${reset}`;
};
