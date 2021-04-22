import { merge } from "../../deps.ts";
import { load } from "./configs.ts";
import { parseQuery } from "./url.ts";

export type ProjectId = number | string;

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

  getPipelines = async (
    p: ProjectId,
    params: { ref?: string; per_page?: number; page?: number } = {},
  ): Promise<Pipeline[]> =>
    this.fetch(`projects/${this.project(p)}/pipelines?${parseQuery(params)}`);

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

export class ConfigGitlabApiFactory implements GitlabApiFactory {
  create(): GitlabApi {
    const c = load<{ host: string; token: string }>("gitlab");
    return new GitlabApi(c.host, c.token);
  }
}
