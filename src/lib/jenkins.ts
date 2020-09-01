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

class PathRetriever {
  lastBuild = (j: JobName) => `${this.job(j)}/lastBuild/api/json`;
  builds = (j: JobName) => `${this.job(j)}/wfapi/runs`;
  nodeDescribe = (n: NodeAddress) => `${this.node}/wfapi/describe`;
  nodeLog = (n: NodeAddress) => `${this.node}/log`;
  buildParams = (j: JobName) => `${this.job(j)}/buildWithParameters`;
  private job = (j: JobName) => `/job/${j}`;
  private node = (n: NodeAddress) =>
    `${this.job(n.build.job)}/${n.build.job}/execution/node/${n.nodeId}`;
}

class BluePathRetriever {
  nodes = (b: BuildAddress) => `${this.build(b)}/nodes`;
  steps = (n: NodeAddress) => `${this.node(n)}/steps`;
  private job = (j: JobName) =>
    `/blue/rest/organizations/jenkins/pipelines/${j}`;
  private build = (b: BuildAddress) => `${this.job(b.job)}/runs/${b.buildId}`;
  private node = (n: NodeAddress) => `${this.build(n.build)}/nodes/${n.nodeId}`;
}

export class Api {
  public cookie: string | undefined = "";
  public crumb: string | undefined = "";

  private static readonly crumbName = "Jenkins-Crumb";

  private paths = new PathRetriever();
  private bluePaths = new BluePathRetriever();
  private loggedIn = false;

  constructor(private info: ApiInfo) {
    this.cookie = info.cookie;
  }

  lastBuild = async (j: JobName) =>
    this.json(this.get(this.paths.lastBuild(j)));
  pipelines = async (j: JobName) => this.json(this.get(this.paths.builds(j)));
  pipelineNode = async (n: NodeAddress) =>
    this.json(this.get(this.paths.nodeDescribe(n)));
  pipelineNodeLog = async (n: NodeAddress) =>
    this.text(this.get(this.paths.nodeLog(n)));
  pipelineNodeSteps = async (n: NodeAddress) =>
    this.json(this.get(this.bluePaths.steps(n)));
  pipelineNodes = async (b: BuildAddress) =>
    this.json(this.get(this.bluePaths.nodes(b)));
  buildWithParameters = async (job: JobName, data: QueryObject) =>
    this.text(
      this.postForm(this.paths.buildParams(job), data),
    );

  private text = async (response: Promise<Response>) => (await response).text();
  private json = async (response: Promise<Response>) => (await response).json();
  private postForm = async (path: string, data: QueryObject) =>
    this.fetch(
      path,
      {
        method: "POST",
        body: parseQuery(data),
      },
      { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
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

  private getAuthHeaders = (): Record<string, string> => {
    const crumb: Record<string, string> = this.crumb
      ? {
        [Api.crumbName]: this.crumb,
      }
      : {};
    const Cookie = this.cookie;
    if (Cookie && Cookie.length) {
      return {
        ...crumb,
        Cookie,
      };
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

    const response = await this.get(
      `/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)`,
    );
    const [crumbName, crumb] = (await response.text()).split(":");
    if (crumbName !== Api.crumbName || !crumb) {
      throw new Error(`Could not login`);
    }
    this.crumb = crumb;
    this.cookie = response.headers.get("set-cookie") || "";
  };
}
