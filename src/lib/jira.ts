import { join } from "../../deps.ts";

const { writeTextFile, readTextFile, env: {get: env} } = Deno;
import { parseQuery } from "./url.ts";

export interface ITableIssue {
  key: string;
  status: string;
  summary: string;
}

interface ITableIssueCache {
  date: string;
  issues: ITableIssue[];
}

export class IssueCacherFactory {
  fromEnv = async () =>
    new IssuesCacher(
      await new BrowserClientFactory().create(),
      new Repo((env("HOME") ?? ".") + "/jira-issues.json"),
    );
}

export class BrowserClientFactory {
  create = async () => {
    const auth = {
      host: env("JIRA_HOST") ?? "",
      cookies: env("JIRA_COOKIES") ?? "",
    };

    try {
      const file = JSON.parse(
        await readTextFile(join(env("HOME") ?? ".", "jira-auth.json")),
      );
      auth.host = file.host || auth.host;
      auth.cookies = file.cookies || auth.cookies;
    } catch (e) {
      // That is ok.
    }

    return new BrowserClient(auth.host, auth.cookies);
  };
}

export class IssuesCacher {
  private allIssues?: ITableIssue[] = undefined;
  constructor(private api: BrowserClient, private repo: Repo) {}
  async update() {
    const fresh = await this.repo.isFresh();
    if (fresh) {
      console.log("issues are fresh");
      return;
    }
    const issues = await this.api.fetchAllIssues();
    await this.repo.saveIssues(issues);
  }

  async one(key: string, field: string = "summary"): Promise<string> {
    if (!key) {
      throw new Error(`Specify Jira issue key!`);
    }
    const issues = await this.getAllIssues();
    const issue = issues.find((i) => i.key === key);
    if (!issue) {
      throw new Error(`No issue "${key}" found in cache.`);
    }
    return issue[field as keyof ITableIssue] as string;
  }

  private async getAllIssues(): Promise<ITableIssue[]> {
    if (this.allIssues === undefined) {
      this.allIssues = await this.repo.getIssues();
    }
    return this.allIssues;
  }
}

export class BrowserClient {
  private readonly init: RequestInit;

  constructor(private readonly host: string, private readonly cookie: string) {
    this.host = this.host.replace(/\/+$/, "");
    this.init = {
      "headers": {
        "__amdmodulename": "jira/issue/utils/xsrf-token-header",
        "accept": "application/json",
        "accept-language": "en,ru-RU;q=0.9,ru;q=0.8",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-atlassian-token": "no-check",
        "x-requested-with": "XMLHttpRequest",
        cookie,
      },
      "referrer": `${this.host}/`,
      "referrerPolicy": "no-referrer-when-downgrade",
      "method": "POST",
      "mode": "cors",
    };
  }

  regStartWork = async () =>
    this.json(this.post("/rest/remote-work/1.0/userWorklog/regStartWork"));

  fetchIssues = async (startIndex = 0) =>
    this.json(this.post(
      "/rest/issueNav/1/issueTable",
      parseQuery({
        startIndex: [startIndex.toString()],
        jql: [
          encodeURIComponent(
            "assignee = currentUser() or assignee was currentUser() and updated > startOfMonth(-1) order by updated desc",
          ),
        ],
        layoutKey: ["split-view"],
      }),
    ));

  private post = async (path: string, body: string | null = null) =>
    await fetch(
      `${this.host}/${path.replace(/^\//, "")}`,
      { ...this.init, body },
    );

  private json = async (p: Promise<Response>) => (await p).json();
  private text = async (p: Promise<Response>) => (await p).text();

  async fetchAllIssues() {
    const issues: ITableIssue[] = [];
    for (let startIndex = 0;;) {
      console.log(`fetching ${startIndex}...`);
      const response = await this.fetchIssues(startIndex);
      const { table, pageSize } = response.issueTable;
      const done = table.length < pageSize;
      issues.push(...table);
      if (done) {
        break;
      }
      startIndex += pageSize;
    }
    return issues;
  }
}

export class Repo {
  constructor(private path: string, private msToLive = 1000 * 60 * 5) {}

  async isFresh(): Promise<boolean> {
    const cache = await this.loadCache();
    const msPassed = new Date().getTime() - new Date(cache.date).getTime();
    return msPassed < this.msToLive;
  }

  async saveIssues(issues: ITableIssue[]) {
    await writeTextFile(this.path, JSON.stringify(this.newCache(issues)));
  }

  private newCache(issues: ITableIssue[] = []): ITableIssueCache {
    return {
      issues,
      date: "0",
    };
  }

  toString(): string {
    return this.path;
  }

  async getIssues(): Promise<ITableIssue[]> {
    const cache = await this.loadCache();
    return cache.issues;
  }

  private async loadCache(): Promise<ITableIssueCache> {
    try {
      const cacheText = await readTextFile(this.path);
      return JSON.parse(cacheText);
    } catch (e) {
      console.log(e);
      return this.newCache();
    }
  }
}
