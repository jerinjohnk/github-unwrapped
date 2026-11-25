import { makeConfig } from "@remotion/eslint-config-flat";
import globals from "globals";
import { createRequire } from "node:module";

// This plugin only ships a CommonJS entry point.
const requireExtensions = createRequire(import.meta.url)(
  "eslint-plugin-require-extensions",
);

export default [
  {
    ignores: ["**/dist/**", ".local-data/**", "graft/**", "public/**"],
  },
  // TypeScript + React rules everywhere, Remotion rules for the video code.
  ...makeConfig({ remotionDir: "remotion/**" }),
  {
    // Keep parity with the previous config, which only warned about these.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Build scripts run in Node.
    files: ["*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // The server runs as native Node ESM, so relative imports need extensions.
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "require-extensions": requireExtensions },
    rules: {
      "require-extensions/require-extensions": "error",
      "require-extensions/require-index": "error",
    },
  },
];
