import { parseQuery, QueryObject } from "./url.ts";
import { myFetch } from "./utils.ts";

export interface JenkinsApiInfo {
  host: string;
  login: string;
  password: string;
  cookie?: string;
}

type JobName = string;

interface BuildAddress {
  job: JobName;
  buildId: number;
}

interface NodeAddress {
  build: BuildAddress;
  nodeId: number;
}

type QueueItemId = number;

export class PathRetriever {
  lastBuild = (j: JobName) => `${this.job(j)}/lastBuild/api/json`;
  getBuildJson = (j: JobName, b: BuildNumber) => `${this.job(j)}/${b}/api/json`;
  builds = (j: JobName) => `${this.job(j)}/wfapi/runs`;
  nodeDescribe = (n: NodeAddress) => `${this.node(n)}/wfapi/describe`;
  buildParams = (j: JobName) => `${this.job(j)}/buildWithParameters`;

  parseQueueItemId(queueItemUrl: string): QueueItemId {
    const matches = queueItemUrl.match(/\/queue\/item\/(\d+)/);
    if (!matches) {
      return 0;
    }
    return parseInt(matches[1]);
  }

  parseBuild(queueItemUrl: string): BuildAddress | null {
    const matches = queueItemUrl.match(
      /\/jenkins\/pipelines\/(.+?)\/runs\/(\d+)/,
    );
    if (!matches) {
      return null;
    }
    const buildId = parseInt(matches[2]);
    const job = matches[1];
    return { buildId, job };
  }

  queueItem = (id: QueueItemId) => `/queue/item/${id}/api/json`;

  private job = (j: JobName) => `/job/${j}`;

  private node = (n: NodeAddress) =>
    `${this.job(n.build.job)}/${n.build.job}/execution/node/${n.nodeId}`;
}

class BluePathRetriever {
  nodes = (b: BuildAddress) => `${this.build(b)}/nodes`;
  steps = (n: NodeAddress) => `${this.node(n)}/steps`;
  nodeLog = (a: NodeAddress) => `${this.node(a)}/log`;
  private job = (j: JobName) =>
    `/blue/rest/organizations/jenkins/pipelines/${j}`;
  private build = (b: BuildAddress) => `${this.job(b.job)}/runs/${b.buildId}`;
  private node = (n: NodeAddress) => `${this.build(n.build)}/nodes/${n.nodeId}`;
}

type BuildNumber = number;

interface QueueItem {
  executable: {
    number: BuildNumber;
  };
}

export class JenkinsApi {
  private static readonly crumbName = "Jenkins-Crumb";
  public cookie: string | undefined = "";
  public crumb: string | undefined = "";
  private paths = new PathRetriever();
  private bluePaths = new BluePathRetriever();
  private loggedIn = false;

  constructor(private info: JenkinsApiInfo) {
    this.cookie = info.cookie;
  }

  lastBuild = async (j: JobName) =>
    this.json(this.get(this.paths.lastBuild(j)));
  getBuild = async (j: JobName, b: BuildNumber) =>
    this.json(this.get(this.paths.getBuildJson(j, b)));
  pipelines = async (j: JobName) => this.json(this.get(this.paths.builds(j)));
  pipelineNode = async (n: NodeAddress) =>
    this.json(this.get(this.paths.nodeDescribe(n)));
  pipelineNodeLog = async (a: NodeAddress) =>
    this.text(this.get(this.bluePaths.nodeLog(a)));
  pipelineNodeSteps = async (n: NodeAddress) =>
    this.json(this.get(this.bluePaths.steps(n)));
  pipelineNodes = async (b: BuildAddress) =>
    this.json(this.get(this.bluePaths.nodes(b)));
  getQueueItem = async (id: QueueItemId): Promise<QueueItem> =>
    this.json(this.get(this.paths.queueItem(id)));
  buildWithParameters = async (job: JobName, data: QueryObject) =>
    this.paths.parseQueueItemId(
      (await this.postForm(this.paths.buildParams(job), data))
        .headers
        .get("Location") || "",
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
    return myFetch(`${this.info.host}/${path.replace(/^\//, "")}`, {
      headers: {
        ...headers,
        ...this.getAuthHeaders(),
      },
      credentials: "inline",
      ...request,
    });
  };

  private getAuthHeaders = (): Record<string, string> => {
    const crumb: Record<string, string> = this.crumb
      ? {
        [JenkinsApi.crumbName]: this.crumb,
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
    if (crumbName !== JenkinsApi.crumbName || !crumb) {
      throw new Error(`Could not login`);
    }
    this.crumb = crumb;
    this.cookie = response.headers.get("set-cookie") || "";
  };
}
