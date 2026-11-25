<img width="1200" alt="readme" src="https://github.com/remotion-dev/github-unwrapped-2023/assets/73991323/0a907f4f-a591-4d98-8b38-c90581ccfb33">

**Try it out live:** [GitHubUnwrapped.com](https://www.githubunwrapped.com)

A platform that generates a year-in-review video for each GitHub user. Built with Vite 5 and Remotion.

## Make your own

Want to make your own year-in-review for your users?

Feel free to fork and use this repository as a template! Note the legal disclaimers at the bottom of this README.

## Versions

- 2024: `main` branch
- 2023: `2023` branch
- 2022: [`github-unwrapped-2022` Repo](https://github.com/remotion-dev/github-unwrapped-2022)
- 2021: [`github-unwrapped-2021` Repo](https://github.com/remotion-dev/github-unwrapped-2021)

## Run locally

This fork runs entirely on your machine: stats are fetched from GitHub, cached as files,
and videos are rendered locally with Remotion. No AWS, MongoDB, Discord or Sentry is needed.

### Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 8)
- A GitHub personal access token: create one at https://github.com/settings/tokens
  (classic or fine-grained, no scopes needed for public data). To include **private repositories**,
  the token must be able to read them: a fine-grained token with access to those repositories
  (Contents, Pull requests and Issues: read; for an organization's repositories, the organization
  as resource owner, and it may need to approve the token), or a classic token with the `repo` scope.
  Without that, Studio shows how many contributions it couldn't see.
- Around 1 GB of free disk space. Remotion downloads a headless Chrome on the first render.

### Setup

```console
npm install
cp .env.example .env   # then paste your token into GITHUB_TOKEN
```

### Generate a video for any date range (Studio)

```console
npm run dev
```

Open http://localhost:8080/studio. The page walks through five steps:

1. **GitHub key**: paste a personal access token. It stays in the tab's memory and is only used for
   that request's GitHub calls; it is never written to disk or logged. Leave it empty to use
   `GITHUB_TOKEN` from `.env`.
2. **GitHub user** whose activity to unwrap.
3. **Date range**: _This year so far_, _Last year_, _Last 12 months_, or custom dates. The default is
   this year so far from 1 July onwards, and the whole of last year before that. GitHub limits a range
   to one year.
4. **Stats**: press **Fetch stats** to preview the numbers for the range.
5. **Video**: pick a rocket colour and press **Generate video**, then watch or download it.

Every number is filtered to the range: contributions and the contribution grid, longest streak,
pull requests and issues opened, repositories starred, commits (most productive day and hour) and
languages. The video labels the period "2026", or "2025–26" when a range crosses a year.

**All dates and times are in IST (UTC+05:30).** A range runs from midnight to midnight IST, and
the most productive day and hour are given in IST, whatever timezone a commit was made in or the
server runs in. The timezone is set in [`src/helpers/timezone.ts`](src/helpers/timezone.ts).

The server only listens on `127.0.0.1`. Set `HOST=0.0.0.0` to expose it on your network.

### Bitbucket Unwrapped

The Studio can also make a year in review for a **Bitbucket Cloud** account: pick **Bitbucket** in
step 1. The video is for the account that owns the API token, across all its workspaces.

1. Create a token at [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens):
   **Create API token with scopes**, choose **Bitbucket**, and tick `read:user:bitbucket`,
   `read:workspace:bitbucket`, `read:repository:bitbucket` and `read:pullrequest:bitbucket`.
2. Enter your Atlassian account email and the token on the page, or set `BITBUCKET_EMAIL` and
   `BITBUCKET_API_TOKEN` in `.env`.

Optionally, press **Find my repositories** (step 3) to choose which repositories count. By
default, every repository with your pull requests in the range is used.

Bitbucket's API has no contribution calendar, issues, stars or "commits by user" search, and busy
shared repositories get thousands of commits a year from the whole team, so everything is derived
from your pull requests:

| In the video                      | From Bitbucket                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Contributions and grid            | Your commits + pull requests you opened + pull requests you approved, per day (IST)                                         |
| Commits, most productive day/hour | Your own commits in your pull requests (IST); merge commits and cherry-picked copies left out                               |
| Issues scene                      | Pull requests opened, and how many were merged                                                                              |
| Pull requests merged              | Your merged pull requests                                                                                                   |
| Stars ("PRs raised")              | How many pull requests you raised; the cockpit lists your biggest ones by lines of code changed (feature PRs, not releases) |
| Top languages                     | Lines changed in a sample of your feature pull requests, by file extension                                                  |

Details:

- **Copies counted once.** Release branches built by cherry-picking (e.g. `cp_and_5.5.3`) hold copies
  of your commits under new hashes. As in the Commitscape analyser, commits with the same subject are
  compared by patch (changed lines, ignoring line numbers), and copies are counted once.
- **Languages** leave out generated files, lockfiles, docs, config scripts (`babel.config.js`,
  `.eslintrc.js`), AI and IDE folders (`.claude/`, `.cursor/`…), and release pull requests into
  `main`/`master`, which carry the whole team's changes. Bitbucket's own repository language
  setting (often empty) is used only if no code files were found.
- **Requests.** A fresh fetch uses about 200–300 API requests (at most 800), within Bitbucket's limit
  of 1,000+ an hour, and takes about 30 seconds for a busy year. Results are cached per range and
  repository selection, so fetching again is instant unless you tick **Refetch**. If a list is cut
  short, the page says which one.

The video says "BitbucketUnwrapped", uses your Bitbucket avatar and shows the Bitbucket logo on the
end badge. The Bitbucket name and logo are trademarks of Atlassian.

### Generate a video in the original web app

```console
npm run dev
```

Open http://localhost:8080 and enter a GitHub username. The first render bundles the
project and takes a few minutes. After that, the MP4 is cached and downloadable.

Local data lives in `.local-data/` (gitignored):

| Path                                                 | Contents                    |
| ---------------------------------------------------- | --------------------------- |
| `.local-data/stats/<user>/<from>_<to>.json`          | Cached GitHub stats         |
| `.local-data/renders/<user>/<theme>_<from>_<to>.mp4` | Rendered videos             |
| `.local-data/og/<user>/`, `.local-data/ig/<user>/`   | Social preview / IG stories |

To refetch a user's stats and re-render, visit `/<username>?reset=true` or delete their files there.

### Optional: Sign in with GitHub (private contributions)

Create a [GitHub OAuth app](https://github.com/settings/developers) with the callback URL
`http://localhost:8080/login`, then set `VITE_CLIENT_ID` and `CLIENT_SECRET` in `.env`.
Without these, the sign-in buttons are hidden.

### Edit the video

```console
npm run remotion
```

This opens Remotion Studio with the sample data.

### Change the year

The reviewed year is set in [`src/helpers/year.ts`](src/helpers/year.ts).

## Credits

We thank [GitHub](https://github.com/github) and [For One Red](https://github.com/foronered) for their support in realization and promoting of this project.

## Audio copyright disclaimer

The audio was licensed for GitHubUnwrapped.com from [SmartSound](https://www.smartsound.com/). If you create a derivative project, you must contact them for licensing.

## License

The code in this repository: Licensed under MIT.  
The Remotion framework (a dependency of this project): Companies need to obtain a paid license. Read the terms [here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md#company-license).
