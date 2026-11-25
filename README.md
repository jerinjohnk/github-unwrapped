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

- Node.js 18.18 or newer
- A GitHub personal access token: create one at https://github.com/settings/tokens
  (classic or fine-grained, no scopes needed for public data)
- Around 1 GB of free disk space. Remotion downloads a headless Chrome on the first render.

### Setup

```console
npm install
cp .env.example .env   # then paste your token into GITHUB_TOKEN
```

### Generate a video in the web app

```console
npm run dev
```

Open http://localhost:8080 and enter a GitHub username. The first render bundles the
project and takes a few minutes. After that, the MP4 is cached and downloadable.

Local data lives in `.local-data/` (gitignored):

| Path                                     | Contents                    |
| ---------------------------------------- | --------------------------- |
| `.local-data/stats/<user>.json`          | Cached GitHub stats         |
| `.local-data/renders/<user>-<theme>.mp4` | Rendered videos             |
| `.local-data/og/`, `.local-data/ig/`     | Social preview / IG stories |

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
