import { merge } from "../../deps.ts";

export class GitlabApi {
  constructor(
    private host: string,
    private token: string,
  ) {
  }

  async groups(path: string) {
    return this.fetch(`groups/${encodeURIComponent(path)}/`);
  }

  async fetch(path: string, init: RequestInit = {}) {
    return await (await fetch(
      `${this.host}/api/v4/${path}`,
      merge({
        headers: {
          "private-token": this.token,
        },
      }, init),
    )).json();
  }
}

export interface GitlabApiFactory {
  create(): GitlabApi;
}
export class EnvGitlabApiFactory implements GitlabApiFactory {
  create(): GitlabApi {
    const env = (name: string): string => Deno.env.get(name) || "";
    return new GitlabApi(
      env("GITLAB_HOST"),
      env("GITLAB_TOKEN"),
    );
  }
}
