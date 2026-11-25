/** Errors from GitHub that the user can act on, with the HTTP status to report. */
export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const badKeyError = () =>
  new GitHubError(
    "GitHub rejected the key (401 Bad credentials). Check that it is correct and has not expired.",
    401,
  );

export const rateLimitError = (kind: "search" | "API") =>
  new GitHubError(
    kind === "search"
      ? "GitHub's search rate limit was hit (30 searches a minute). Wait a minute and try again."
      : "GitHub's API rate limit for this key was hit. Wait a while and try again, or use another key.",
    429,
  );
