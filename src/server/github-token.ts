import { backendCredentials } from "../helpers/domain.js";

export const getGithubToken = (): string => {
  return backendCredentials().GITHUB_TOKEN;
};
