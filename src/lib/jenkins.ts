import { parseQuery, QueryObject } from "./url.ts";
import { BasicAuthFetcher, Fetcher } from "./utils.ts";
import { load } from "./configs.ts";

export interface JenkinsApiInfo {
  host: string;
  login: string;
}

export type JobName = string;

export interface BuildAddress {
  job: JobName;
  buildId: number;
}

export interface NodeAddress {
  build: BuildAddress;
  nodeId: number;
}

type QueueItemId = number;

export class PathRetriever {
  lastBuild = (j: JobName) => `${this.job(j)}/lastBuild/api/json`;
  getBuildJson = (b: BuildAddress) => `${this.build(b)}/api/json`;
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

  jobJson = (j: JobName) => `${this.job(j)}/api/json`;
  jobDetails = (j: JobName) =>
    `${
      this.jobJson(j)
    }?tree=builds[actions[parameters[name,value]],url,result,building,number,duration,estimatedDuration]`;
  private job = (j: JobName) => `/job/${j}`;
  private build = (a: BuildAddress) => `${this.job(a.job)}/${a.buildId}`;

  private node = (n: NodeAddress) =>
    `${this.job(n.build.job)}/${n.build.job}/execution/node/${n.nodeId}`;
}

class BluePathRetriever {
  nodes = (b: BuildAddress) => `${this.build(b)}/nodes`;
  steps = (n: NodeAddress) => `${this.node(n)}/steps`;
  nodeLog = (a: NodeAddress) => `${this.node(a)}/log`;

  node = (n: NodeAddress) => `${this.nodes(n.build)}/${n.nodeId}`;

  private job = (j: JobName) =>
    `/blue/rest/organizations/jenkins/pipelines/${j}`;

  private build = (b: BuildAddress) => `${this.job(b.job)}/runs/${b.buildId}`;
}

type BuildNumber = number;

export interface QueueItem {
  executable?: {
    number: BuildNumber;
  };
}

export interface Action {
  _class: string;
  parameters?: {
    _class: string;
    name: string;
    value: string;
  }[];
}

export interface Build {
  actions: Action[];
  building: boolean;
  number: number;
  result: string;
  url: string;
  timestamp: number;
  estimatedDuration: number;
}

export interface Node {
  type: "STAGE" | "PARALLEL";
  state:
    | "FINISHED"
    | "SKIPPED"
    | "NOT_BUILT"
    | "RUNNING"
    | "FAILURE"
    | "ABORTED"
    | null;
  actions: {
    link: { href: string };
  }[];
  durationInMillis: number;
}

export interface JobDetails {
  builds: Build[];
}

interface JenkinsConfigFields {
  host: string;
  login: string;
  password: string;
  jobs: {
    aliases: string[];
    id: string;
    flow?: boolean;
    params: Record<string, string | string[]>;
  }[];
  cookiePath: string;
}
export class JenkinsConfig {
  constructor(public all: JenkinsConfigFields) {
  }

  static load() {
    return new JenkinsConfig(load<JenkinsConfigFields>("jenkins"));
  }

  getJobIds(): string[] {
    return this.all.jobs.map((j) => j.id);
  }
}

export class JenkinsApiFactory {
  create(config = JenkinsConfig.load()): JenkinsApi {
    const { host, login, cookiePath } = config.all;
    return new JenkinsApi(
      { host, login },
      new BasicAuthFetcher(cookiePath, login, "jenkins_password"),
    );
  }
}

export class JenkinsApi {
  private static readonly crumbName = "Jenkins-Crumb";
  public crumb: string | undefined = "";
  private paths = new PathRetriever();
  private bluePaths = new BluePathRetriever();
  private loggedIn = false;

  constructor(private info: JenkinsApiInfo, private fetcher: Fetcher) {
  }

  getJobDetails(j: JobName): Promise<JobDetails> {
    return this.json(this.get(this.paths.jobDetails(j)));
  }

  getLastBuild = async (j: JobName): Promise<Build> =>
    this.json(this.get(this.paths.lastBuild(j)));
  getBuild = async (b: BuildAddress): Promise<Build> =>
    this.json(this.get(this.paths.getBuildJson(b)));
  pipelines = async (j: JobName) => this.json(this.get(this.paths.builds(j)));
  pipelineNode = async (n: NodeAddress) =>
    this.json(this.get(this.paths.nodeDescribe(n)));
  pipelineNodeLog = async (a: NodeAddress) =>
    this.text(this.get(this.bluePaths.nodeLog(a)));
  pipelineNodeSteps = async (n: NodeAddress) =>
    this.json(this.get(this.bluePaths.steps(n)));
  getBuildNodes = async (b: BuildAddress): Promise<Node[]> =>
    this.json(this.get(this.bluePaths.nodes(b)));
  getQueueItem = async (id: QueueItemId): Promise<QueueItem> =>
    this.json(this.get(this.paths.queueItem(id)));
  buildWithParameters = async (job: JobName, data: QueryObject) =>
    this.paths.parseQueueItemId(
      (await this.postForm(this.paths.buildParams(job), data))
        .headers
        .get("Location") || "",
    );

  fetch = async (
    path: string,
    request: RequestInit = {},
    headers: HeadersInit = {},
  ) => {
    await this.loginIfNeeded();
    return this.fetcher.fetch(`${this.info.host}/${path.replace(/^\//, "")}`, {
      headers: {
        ...headers,
        ...this.getAuthHeaders(),
      },
      ...request,
    });
  };

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

  private getAuthHeaders(): Record<string, string> {
    return this.crumb ? { [JenkinsApi.crumbName]: this.crumb } : {};
  }

  private async loginIfNeeded() {
    if (this.loggedIn) {
      return;
    }
    this.loggedIn = true;

    const response = await this.get(
      `/crumbIssuer/api/xml?xpath=concat(//crumbRequestField,%22:%22,//crumb)`,
    );
    const [crumbName, crumb] = (await response.text()).split(":");
    if (crumbName !== JenkinsApi.crumbName || !crumb) {
      throw new Error(`Could not login.`);
    }
    this.crumb = crumb;
  }
}
