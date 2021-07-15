import { merge } from "../../deps.ts";
import { load } from "./configs.ts";
import { parseQuery } from "./url.ts";
import { myFetch, parseJson, RateLimit } from "./utils.ts";

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
    private readonly host: string,
    private token: string,
    private rateLimit = new RateLimit(5, 200),
  ) {
    this.host = this.host.replace(/\/+$/, "");
  }

  parseProjects(s: string): ProjectId[] {
    const matches = s.matchAll(new RegExp(`${this.host}/(.*?)(/-|\])`, "g"));
    if (!matches) {
      return [];
    }
    return [...new Set([...matches].map((v) => v[1]))].filter((v) =>
      v.includes("/")
    );
  }

  getPipelines = async (
    p: ProjectId,
    params: { ref?: string; per_page?: number; page?: number } = {},
  ): Promise<Pipeline[]> =>
    this.fetch(`projects/${this.project(p)}/pipelines?${parseQuery(params)}`);

  getLastPipeline = async (
    p: ProjectId,
    ref: string,
  ): Promise<Pipeline | undefined> =>
    (await this.getPipelines(p, { ref, per_page: 1, page: 1 }))[0];

  groups = async (p: ProjectId) => this.fetch(`groups/${this.project(p)}/`);

  async fetch(path: string, init: RequestInit = {}) {
    await this.rateLimit.run();
    const response = await myFetch(
      `${this.host}/api/v4/${path}`,
      merge({
        headers: {
          "private-token": this.token,
        },
      } as RequestInit, init),
    );
    const text = await response.text();
    return parseJson(text);
  }

  private project = (p: ProjectId) =>
    typeof p === "number" ? p : encodeURIComponent(p);
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
