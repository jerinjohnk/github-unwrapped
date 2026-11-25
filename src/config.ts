import { zColor } from "@remotion/zod-types";
import { random } from "remotion/no-react";
import { z } from "zod";

const availablePlanets = ["Ice", "Silver", "Gold", "Leafy", "Fire"] as const;
export type Planet = (typeof availablePlanets)[number];

export const PlanetEnum = z.enum(availablePlanets);

export const LanguagesEnum = z.enum([
  "Java",
  "Python",
  "JavaScript",
  "TypeScript",
  "Go",
  "Rust",
  "C",
  "C++",
  "Ruby",
  "PHP",
  "Nix",
  "C#",
]);

export const cornerTypeValues = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export const cornerType = z.enum(cornerTypeValues);
export type Corner = z.infer<typeof cornerType>;

export const languageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("other"),
    name: z.string(),
    color: zColor().or(z.null()),
    percent: z.number(),
  }),
  z.object({
    type: z.literal("designed"),
    name: LanguagesEnum,
    percent: z.number(),
  }),
]);

export type TopLanguage = z.infer<typeof languageSchema>;

const days = ["0", "1", "2", "3", "4", "5", "6"] as const;
export const topWeekdaySchema = z.enum(days);

const hours = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
] as const;

export const topHourSchema = z.enum(hours);

export type Hour = (typeof hours)[number];

export type Weekday = (typeof days)[number];

export const productivityPerHourSchema = z.object({
  time: z.number(),
  productivity: z.number(),
});

export type ProductivityPerHour = z.infer<typeof productivityPerHourSchema>;

export const topLanguagesSchema = z.object({
  language1: languageSchema,
  language2: languageSchema.or(z.null()),
  language3: languageSchema.or(z.null()),
});

export const openingSceneStartAngle = z.enum(["left", "right"]);

export const rocketValues = ["blue", "orange", "yellow"] as const;
export const rocketSchema = z.enum(rocketValues);
export type Rocket = (typeof rocketValues)[number];

export const starredRepoExample = z.object({
  author: z.string(),
  name: z.string(),
});

export const platformValues = ["github", "bitbucket"] as const;
export const platformSchema = z.enum(platformValues);
export type Platform = z.infer<typeof platformSchema>;

/** Extra numbers only Bitbucket stats have, shown on the studio page. */
// Bump when the way Bitbucket stats are computed changes, so older cached
// stats are fetched again.
export const BITBUCKET_STATS_VERSION = 6;

export type BitbucketSummary = {
  version: number;
  workspaces: number;
  // Repositories the user opened pull requests in.
  repositories: number;
  // The user's own commits in those pull requests (no merge commits).
  commits: number;
  // Rebased or cherry-picked copies of those commits, counted once.
  copiesSkipped?: number;
  // Pull requests by others the user approved.
  approvals: number;
  // The user's biggest pull requests by lines of code changed (the video's
  // cockpit shows them).
  biggestPullRequests?: {
    id: number;
    repo: string;
    title: string;
    added: number;
    removed: number;
  }[];
  pullRequests: { open: number; merged: number; declined: number };
  // Bitbucket API requests the fetch used.
  requests: number;
  // False if page limits or the request budget cut some lists short;
  // `gaps` says which (at most 5).
  complete: boolean;
  gaps?: string[];
};

export const compositionSchema = z.object({
  topLanguages: topLanguagesSchema.or(z.null()),
  corner: cornerType,
  showHelperLine: z.boolean(),
  login: z.string(),
  planet: PlanetEnum,
  starsGiven: z.number(),
  issuesOpened: z.number(),
  issuesClosed: z.number(),
  totalPullRequests: z.number(),
  topWeekday: topWeekdaySchema,
  topHour: topHourSchema,
  graphData: z.array(productivityPerHourSchema),
  openingSceneStartAngle,
  rocket: rocketSchema,
  contributionData: z.array(z.number()),
  totalContributions: z.number(),
  longestStreak: z.number(),
  sampleStarredRepos: z.array(starredRepoExample),
  // Shown where the video names the period, e.g. "2026" or "2025–26".
  periodLabel: z.string().optional(),
  // Where the stats come from; changes the branding and a few scenes.
  platform: platformSchema.optional(),
  // Profile picture; defaults to https://github.com/<login>.png.
  avatarUrl: z.string().optional(),
  // Custom rocket colour ("#rrggbb"); `rocket` then picks the flame and music.
  rocketColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

// `from`/`to` (YYYY-MM-DD, inclusive) pick the review period; omitted means
// the whole of YEAR_TO_REVIEW, as in the original app.
const optionalRange = {
  from: z.string().optional(),
  to: z.string().optional(),
};

export const RenderRequest = z.object({
  username: z.string(),
  theme: rocketSchema,
  platform: platformSchema.optional().default("github"),
  // Custom rocket colour ("#rrggbb"); overrides `theme` for the rocket art.
  rocketColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // Bitbucket stats limited to chosen repositories (see the studio page).
  variant: z
    .string()
    .regex(/^[a-f0-9]{8}$/)
    .optional(),
  ...optionalRange,
});

export type RenderResponse =
  | {
      type: "video-available";
      url: string;
    }
  | {
      type: "render-running";
      progress: number;
    }
  | {
      type: "render-error";
      error: string;
    };

export const ProgressRequest = z.object({
  username: z.string(),
  theme: z.string(),
});

export const StatsRequest = z.object({
  username: z.string(),
  refreshCache: z.boolean().optional().default(false),
  ...optionalRange,
});

export const generateRandomCorner = ({
  lowercasedUsername,
}: {
  lowercasedUsername: string;
}): Corner => {
  const randomSeed = random(lowercasedUsername);

  const index = Math.floor(randomSeed * cornerTypeValues.length);

  return cornerTypeValues[index];
};

export type ProfileStats = {
  // Missing on stats cached before Bitbucket support: means GitHub.
  platform?: Platform;
  avatarUrl?: string;
  bitbucket?: BitbucketSummary;
  // The inclusive date range every number below was filtered to.
  range: { from: string; to: string };
  periodLabel: string;
  totalPullRequests: number;
  username: string;
  lowercasedUsername: string;
  openIssues: number;
  closedIssues: number;
  fetchedAt: number;
  loggedInWithGitHub: boolean;
  totalStars: number;
  sampleStarredRepos: {
    author: string;
    name: string;
  }[];
  longestStreak: number;
  totalContributions: number;
  topLanguages: Array<{
    languageName: string;
    color: string | null;
    percent: number;
  }>;
  bestHours: Record<string, number>;
  topWeekday: Weekday;
  topHour: Hour;
  graphData: ProductivityPerHour[];
  contributionData: number[];
  allWeekdays: number[];
};

export type CompositionParameters = z.infer<typeof compositionSchema>;

const computePlanet = (userStats: ProfileStats): z.infer<typeof PlanetEnum> => {
  if (userStats.totalContributions > 5000) {
    return PlanetEnum.enum.Gold;
  }

  if (userStats.totalContributions > 2400) {
    return PlanetEnum.enum.Silver;
  }

  if (userStats.totalContributions > 500) {
    return PlanetEnum.enum.Fire;
  }

  if (userStats.totalContributions > 25) {
    return PlanetEnum.enum.Leafy;
  }

  return PlanetEnum.enum.Ice;
};

export const parseTopLanguage = (topLanguage: {
  languageName: string;
  color: string | null;
  percent: number;
}): z.infer<typeof languageSchema> => {
  try {
    const lang = LanguagesEnum.parse(topLanguage.languageName);
    return {
      type: "designed",
      name: lang,
      percent: topLanguage.percent,
    };
  } catch (e) {
    return {
      type: "other",
      color: topLanguage.color ?? "black",
      name: topLanguage.languageName,
      percent: topLanguage.percent,
    };
  }
};

export const computeCompositionParameters = (
  userStats: ProfileStats,
  rocketPreference: Rocket | null,
  rocketColor?: string,
): CompositionParameters => {
  const defaultRocket =
    rocketValues[
      Math.floor(
        random(userStats.lowercasedUsername + "rocket") * rocketValues.length,
      )
    ];

  return {
    login: userStats.username,
    corner: generateRandomCorner({
      lowercasedUsername: userStats.lowercasedUsername,
    }),
    topLanguages:
      userStats.topLanguages.length > 0
        ? {
            language1: parseTopLanguage(userStats.topLanguages[0]),
            language2:
              userStats.topLanguages.length > 1
                ? parseTopLanguage(userStats.topLanguages[1])
                : null,
            language3:
              userStats.topLanguages.length > 2
                ? parseTopLanguage(userStats.topLanguages[2])
                : null,
          }
        : null,
    showHelperLine: false,
    planet: computePlanet(userStats),
    starsGiven: userStats.totalStars,
    issuesClosed: userStats.closedIssues,
    issuesOpened: userStats.openIssues,
    totalPullRequests: userStats.totalPullRequests,
    topWeekday: userStats.topWeekday,
    totalContributions: userStats.totalContributions,
    topHour: userStats.topHour,
    graphData: userStats.graphData,
    openingSceneStartAngle:
      random(userStats.lowercasedUsername + "startAngle") > 0.5
        ? "left"
        : "right",
    rocket: rocketPreference ? rocketPreference : defaultRocket,
    contributionData: userStats.contributionData,
    sampleStarredRepos: userStats.sampleStarredRepos,
    longestStreak: userStats.longestStreak,
    periodLabel: userStats.periodLabel,
    platform: userStats.platform ?? "github",
    avatarUrl: userStats.avatarUrl,
    rocketColor,
  };
};

export const ogImageSchema = z.object({
  issues: z.number(),
  stars: z.number(),
  contributionData: z.array(z.number()),
  pullRequests: z.number(),
  weekdays: z.array(z.number()),
  login: z.string(),
  topLanguage: languageSchema.or(z.null()),
  longestStreak: z.number(),
  totalContributions: z.number(),
  periodLabel: z.string().optional(),
});
