import { merge } from "../../deps.ts";

type ProjectId = number | string;

interface Pipeline {
  id: number;
  project_id: number;
  sha: string;
  ref: string;
  status: string;
  created_at: string;
  updated_at: string;
  web_url: string;
}

// https://docs.gitlab.com/ee/api
export class GitlabApi {
  constructor(
    private host: string,
    private token: string,
  ) {
  }

  getPipelines = async (p: ProjectId): Promise<Pipeline[]> =>
    this.fetch(`projects/${this.project(p)}/pipelines`);

  groups = async (p: ProjectId) => this.fetch(`groups/${this.project(p)}/`);

  private project = (p: ProjectId) =>
    typeof p === "number" ? p : encodeURIComponent(p);

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
