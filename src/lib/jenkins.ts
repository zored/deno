import { parseQuery, QueryObject } from "./url.ts";

export interface ApiInfo {
  host: string;
  login: string;
  password: string;
  cookie?: string;
}

export type JobName = string;

interface BuildAddress {
  job: JobName;
  buildId: number;
}
interface NodeAddress {
  build: BuildAddress;
  nodeId: number;
}

const blue = "/blue/rest/organizations/jenkins";
export class Api {
  public cookie: string | undefined = "";
  private loggedIn = false;

  constructor(private info: ApiInfo) {
    this.cookie = info.cookie;
  }

  lastBuild = async (job: JobName) =>
    this.json(this.get(`/job/${job}/lastBuild/api/json`));

  pipelines = async (job: JobName) =>
    this.json(this.get(`/job/${job}/wfapi/runs`));
  pipelineNode = async (job: JobName, jobId: number, nodeId: number) =>
    this.json(
      this.get(`/job/${job}/${jobId}/execution/node/${nodeId}/wfapi/describe`),
    );
  pipelineNodeLog = async (job: JobName, jobId: number, nodeId: number) =>
    this.text(this.get(`/job/${job}/${jobId}/execution/node/${nodeId}/log`));
  pipelineNodeSteps = async (job: JobName, jobId: number, nodeId: number) =>
    this.json(
      this.get(`${blue}/pipelines/${job}/runs/${jobId}/nodes/${nodeId}/steps/`),
    );
  pipelineNodes = async (job: JobName, jobId: number) =>
    this.json(
      this.get(`${blue}/pipelines/${job}/runs/${jobId}/nodes/?limit=10000`),
    );

  buildWithParameters = async (job: JobName, data: QueryObject) =>
    this.text(this.postForm(`/job/${job}/buildWithParameters`, data));

  private text = async (response: Promise<Response>) => (await response).text();

  private json = async (response: Promise<Response>) => (await response).json();

  private postForm = async (path: string, data: QueryObject) =>
    this.fetch(
      path,
      {
        method: "POST",
        body: parseQuery(data),
      },
      {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    );

  private get = async (path: string) => this.fetch(path);

  private fetch = async (
    path: string,
    request: RequestInit = {},
    headers: HeadersInit = {},
  ) => {
    await this.loginIfNeeded();
    const url = `${this.info.host}/${path.replace(/^\//, "")}`;
    const init = {
      headers: {
        ...headers,
        ...this.getAuthHeaders(),
      },
      credential: "inline",
      ...request,
    };
    return fetch(url, init);
  };

  private getAuthHeaders = (): HeadersInit => {
    const Cookie = this.cookie;
    if (Cookie && Cookie.length) {
      return { Cookie };
    }
    const { login, password } = this.info;
    return {
      Authorization: "Basic " + btoa(`${login}:${password}`),
    };
  };

  private loginIfNeeded = async () => {
    if (this.loggedIn) {
      return;
    }
    this.loggedIn = true;

    const response = await this.get("/api/json?tree=jobs");
    const { jobs } = await response.json();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      throw new Error(`Could not login`);
    }
    this.cookie = response.headers.get("set-cookie") || "";
  };
}
