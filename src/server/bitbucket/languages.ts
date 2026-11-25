// Languages for Bitbucket stats come from the files changed in the user's pull
// requests (by extension), weighted by lines added + removed. Bitbucket's own
// per-repository "language" is a manual setting that is often empty, so it is
// only a fallback.

const NAMES: Record<string, string> = {
  java: "Java",
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  go: "Go",
  rust: "Rust",
  c: "C",
  "c++": "C++",
  ruby: "Ruby",
  php: "PHP",
  nix: "Nix",
  "c#": "C#",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  "objective-c": "Objective-C",
  scala: "Scala",
  groovy: "Groovy",
  shell: "Shell",
  html: "HTML",
  "html/css": "HTML",
  css: "CSS",
  sql: "SQL",
  r: "R",
  lua: "Lua",
  perl: "Perl",
  haskell: "Haskell",
  elixir: "Elixir",
  clojure: "Clojure",
};

const COLORS: Record<string, string> = {
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
  "Objective-C": "#438eff",
  Scala: "#c22d40",
  Groovy: "#4298b8",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  SQL: "#e38c00",
  R: "#198CE7",
  Lua: "#000080",
  Perl: "#0298c3",
  Haskell: "#5e5086",
  Elixir: "#6e4a7e",
  Clojure: "#db5855",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

// Code files only: docs, config, data and assets are left out, like GitHub's
// language stats leave out Markdown and JSON.
const EXTENSIONS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  swift: "Swift",
  m: "Objective-C",
  mm: "Objective-C",
  py: "Python",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++",
  dart: "Dart",
  scala: "Scala",
  groovy: "Groovy",
  gradle: "Groovy",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "SCSS",
  vue: "Vue",
  svelte: "Svelte",
  lua: "Lua",
  ex: "Elixir",
  exs: "Elixir",
  clj: "Clojure",
  hs: "Haskell",
  r: "R",
  nix: "Nix",
};

// Generated, vendored, AI/IDE and tooling files that would drown out
// hand-written code. Same areas the Commitscape analyser leaves out
// ("Generated", "Vendor", "AI & IDE"), plus config scripts.
const IGNORED_PATH =
  /(^|\/)(node_modules|vendor|third_party|third-party|external|dist|build|out|target|coverage|Pods|DerivedData|generated|__generated__|generated-sources|generated-test-sources|\.next|\.expo|\.gradle|\.idea|\.vscode|\.fleet|\.zed|\.settings|\.claude|\.cursor|\.kiro|\.agents|\.windsurf|\.continue|\.husky|\.github)\//;
const IGNORED_FILE =
  /(\.min\.(js|css)|\.map|\.snap|\.lock|\.pbxproj|-lock\.json|\.d\.ts|\.generated\.\w+|\.g\.dart|\.pb\.\w+|\.class)$/i;
// Config written as code: babel.config.js, metro.config.js, .eslintrc.js, …
const CONFIG_SCRIPT =
  /(^|\/)([^/]+\.config|\.[^/]*rc)\.(js|cjs|mjs|ts|cts|mts)$/i;

/** The language of a changed file, or null for non-code or generated files. */
export const languageOfPath = (path: string): string | null => {
  if (
    IGNORED_PATH.test(path) ||
    IGNORED_FILE.test(path) ||
    CONFIG_SCRIPT.test(path)
  ) {
    return null;
  }

  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    return null; // no extension, or a dotfile like .gitignore
  }

  return EXTENSIONS[fileName.slice(dot + 1).toLowerCase()] ?? null;
};

/** A repository's manual language setting ("typescript", "c#"), as a fallback. */
export const normalizeLanguage = (
  language: string | undefined | null,
): string | null => {
  const key = (language ?? "").trim().toLowerCase();
  if (!key || key === "none") {
    return null;
  }

  return NAMES[key] ?? key.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
};

export const languageColor = (name: string): string | null =>
  COLORS[name] ?? null;
