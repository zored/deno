import { join, serve } from "../../deps.ts";
import { parseQuery, QueryObject } from "./url.ts";

const { writeTextFile, readTextFile, env: { get: env } } = Deno;

export type IssueKey = string;

export interface ITableIssue {
  id: IssueKey;
  key: string;
  status: string;
  summary: string;
  type: {
    name: string;
  };
}

interface ITableIssueCache {
  date: string;
  issues: ITableIssue[];
}

export class IssueCacherFactory {
  fromEnv = async (client?: BrowserClient) =>
    new IssuesCacher(
      client ?? await new BrowserClientFactory().create(),
      new Repo((env("HOME") ?? ".") + "/jira-issues.json"),
    );
}

export class JiraCookieListener {
  async start(port: number) {
    if (!port) {
      throw new Error("specify port");
    }
    console.log(`Listening port ${port} for Jira cookies...`);
    for await (const request of serve({ port })) {
      const cookies = new TextDecoder().decode(
        await Deno.readAll(request.body),
      );

      const auth: { cookies: string } = JSON.parse(
        await Deno.readTextFile(jiraAuthPath()),
      );
      auth.cookies = cookies;
      Deno.writeTextFileSync(jiraAuthPath(), JSON.stringify(auth));
      console.log("wrote cookies");

      request.respond({
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
        }),
        body: "ok",
      });
    }
  }
}

const debug = (
  f: (
    l: (...p: Parameters<typeof console.log>) => ReturnType<typeof console.log>,
  ) => void,
) => {
  if (Deno.args.includes("-v")) {
    f(console.log);
  }
};

const jiraAuthPath = () => join(env("HOME") ?? ".", "jira-auth.json");

export class BrowserClientFactory {
  create = async () => {
    const auth = {
      host: BrowserClientFactory.getHost() ?? "",
      cookies: env("JIRA_COOKIES") ?? "",
    };

    try {
      const file = JSON.parse(
        await readTextFile(jiraAuthPath()),
      );
      auth.host = file.host || auth.host;
      auth.cookies = file.cookies || auth.cookies;
    } catch (e) {
      debug((l) => l(`could not open ${jiraAuthPath()}`, { e }));
      // That is ok.
    }

    return new BrowserClient(auth.host, auth.cookies);
  };

  static getHost() {
    return env("JIRA_HOST");
  }
}

export class IssuesCacher {
  private allIssues?: ITableIssue[] = undefined;

  constructor(private api: BrowserClient, private repo: Repo) {
  }

  async update() {
    const fresh = await this.repo.isFresh();
    if (fresh) {
      console.log("issues are fresh");
      return;
    }
    const issues = await this.api.fetchAllIssues(
      BrowserClient.JQL_TOUCHED_BY_ME,
      true,
    );
    await this.repo.saveIssues(issues);
  }

  async one(key: string, field: string = "summary"): Promise<string> {
    if (!key) {
      throw new Error(`Specify Jira issue key!`);
    }
    const issues = await this.getAllIssues();
    const issue = issues.find((i) => i.key === key);
    if (!issue) {
      return "";
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

declare module JiraApi {
  export interface Suggestion {
    name: string;
    id: number;
    stateKey: string;
    boardName: string;
    date: Date;
  }

  export interface AllMatch {
    name: string;
    id: number;
    stateKey: string;
    boardName: string;
    date: string;
  }

  export interface SprintAutocomplete {
    suggestions: Suggestion[];
    allMatches: AllMatch[];
  }
}

export class BrowserClient {
  public static JQL_TOUCHED_BY_ME =
    "assignee = currentUser() or assignee was currentUser() and updated > startOfMonth(-1) order by updated desc";
  public static JQL_MY_UNRESOLVED =
    "assignee = currentUser() AND resolution = Unresolved AND status != Done order by updated DESC";

  constructor(private readonly host: string, private readonly cookie: string) {
    this.host = this.host.replace(/\/+$/, "");
  }

  regStartWork = async () =>
    this.json(this.post("/rest/remote-work/1.0/userWorklog/regStartWork"));

  makeAction = async (key: IssueKey, action = 241) => {
    const paths = await this.getPaths(key);
    console.log(paths);
    const actionPath = this.findActionPath(
      paths,
      action,
    );
    if (actionPath instanceof Error) {
      throw actionPath;
    }
    const response = await this.get(actionPath);
    console.log(response);
  };

  deleteIssue = async (key: IssueKey) => {
    const paths = await this.getPaths(key);
    const id = this.getIssueId(paths, key);
    const deletePath = this.findDeletePath(paths, key);
    if (deletePath instanceof Error) {
      throw deletePath;
    }
    if (deletePath.indexOf(id + "") === -1) {
      throw new Error(
        `Invalid delete path ${deletePath} for issue ${key} (id: ${id}).`,
      );
    }

    // Find token:
    let atl_token = "";
    (await this.getHtmlPaths(await this.text(this.get(deletePath))))
      .some((p) => {
        const matches = p.match(/&atl_token=(?<token>[^&]+)$/);
        if (!matches) {
          return false;
        }
        atl_token = matches?.groups?.token || "";
        return true;
      });

    return this.text(
      this.post(
        "/secure/DeleteIssue.jspa",
        parseQuery({
          id,
          confirm: "true",
          atl_token,
        }),
      ),
    );
  };

  createIssue = async (query: QueryObject) => {
    const { formToken, atl_token } = await this.createIssueForm(query);
    const result = await this.doCreateIssue({
      formToken,
      atl_token,
      ...query,
    });

    const key = result?.createdIssueDetails?.key;
    const url = key ? `${this.host}/browse/${key}` : null;
    return [result, url];
  };

  getSprint = async (query: string) => {
    const { suggestions } = await this.fetchSprints(query);
    if (suggestions.length !== 1) {
      throw new Error(
        `Got invalid suggestions: ${JSON.stringify(suggestions)}`,
      );
    }
    return suggestions[0].id;
  };

  async fetchAllIssues(jql: string, verbose = false): Promise<ITableIssue[]> {
    const issues: ITableIssue[] = [];
    const maxIndex = 200;
    for (let startIndex = 0; startIndex <= maxIndex;) {
      if (verbose) {
        console.log(`fetching ${startIndex}...`);
      }
      const response = await this.issueTable(jql, startIndex);
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

  private issueTable = async (jql: string, startIndex = 0) =>
    this.json(this.post(
      "/rest/issueNav/1/issueTable",
      parseQuery({
        startIndex: [startIndex.toString()],
        jql: [
          encodeURIComponent(jql),
        ],
        layoutKey: ["split-view"],
      }),
    ));

  private init = (form = true): RequestInit => ({
    "headers": {
      "__amdmodulename": "jira/issue/utils/xsrf-token-header",
      "accept": "application/json",
      "accept-language": "en,ru-RU;q=0.9,ru;q=0.8",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-atlassian-token": "no-check",
      "x-requested-with": "XMLHttpRequest",
      "cookie": this.cookie,
      ...(form
        ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }
        : {}),
    },
    "referrer": `${this.host}/`,
    "referrerPolicy": "no-referrer-when-downgrade",
    "method": "POST",
    "mode": "cors",
  });

  private getIssueId = (paths: string[], key: IssueKey) => {
    const path = this.findAddCommentPath(paths, key);
    if (path instanceof Error) {
      throw path;
    }
    const matches = path.match(/id=(?<id>\d+)/);
    if (!matches) {
      throw new Error("No id found in comment url");
    }
    return matches.groups?.id || "";
  };

  private fetchSprints = (query: string): Promise<JiraApi.SprintAutocomplete> =>
    this.json(
      this.get(
        `/rest/greenhopper/1.0/sprint/picker?` + parseQuery({
          query,
          _: "" + new Date().getTime(),
        }),
        {},
        false,
      ),
    );

  private getIssueHtml = (issue: IssueKey) =>
    this.text(this.get(`/browse/${issue}`));

  private createIssueForm = async (query: QueryObject) =>
    this.json(
      this.post(
        "/secure/QuickCreateIssue!default.jspa?decorator=none",
        parseQuery({
          "retainValues": "true",
          "customfield_15501": "",
          "summary": "",
          "description": "",
          "toggle": "true",
          "fieldsToRetain": [
            "project",
            "issuetype",
            "summary",
            "description",
            "attachment",
          ],
          // "formToken": "9cfd70c84972b6fe12ec015221ddf756858e60b4",
          ...query,
        }),
      ),
    );

  private doCreateIssue = async (query: Record<string, string>) =>
    this.json(
      this.post(
        "/secure/QuickCreateIssue.jspa?decorator=none",
        parseQuery({
          "dnd-dropzone": "",
          "duedate": "",
          "fieldsToRetain": [
            "project",
            "issuetype",
            "components",
            "customfield_21005",
            "customfield_10051",
            "customfield_10050",
            "customfield_15401",
            "customfield_15500",
            "duedate",
          ],
          ...query,
        }),
      ),
    );

  private post = (path: string, body: BodyInit | null = null, form = true) =>
    this.fetch(path, { body }, form);

  private get = (path: string, init: Partial<RequestInit> = {}, form = true) =>
    this.fetch(path, {
      ...init,
      method: "GET",
    }, form);

  private fetch = (
    path: string,
    init: Partial<RequestInit> = {},
    form = true,
  ) =>
    fetch(
      `${this.host}/${path.replace(/^\//, "")}`,
      {
        ...this.init(form),
        ...init,
      },
    );

  private json = async (p: Promise<Response>) => {
    const response = await p;
    debug((l) => l(response));
    const t = await response.text();
    debug(() => console.log(t));
    return JSON.parse(t);
  };

  private text = async (p: Promise<Response>) => (await p).text();

  private findActionPath = (
    paths: string[],
    action: number,
  ): string | Error =>
    paths.find((p) => p.includes(`action=${action}&`)) ||
    new Error(`No action ${action} URL found.`);

  private findDeletePath = (paths: string[], issue: IssueKey): string | Error =>
    paths
      .find((p) => p.indexOf("DeleteIssue") > 0) ||
    new Error(`No delete link URL found on issue page ${issue}.`);

  private findAddCommentPath = (
    paths: string[],
    issue: IssueKey,
  ): string | Error =>
    paths
      .find((p) => p.indexOf("AddComment") > 0) ||
    new Error(`No add comment link URL found on issue page ${issue}.`);

  private getHtmlPaths = async <T>(html: string): Promise<string[]> =>
    Array
      .from(html.matchAll(/href="(?<path>[^"]*?[^"]*?)"/g))
      .map(({ groups }) => groups?.path ?? "")
      .map((p) => p.replace(/&amp;/g, "&"));

  private getPaths = async <T>(issue: IssueKey): Promise<string[]> =>
    this.getHtmlPaths(await this.getIssueHtml(issue));

  getIssueSummary = async (key: IssueKey) =>
    (await this.json(
      this.get(`/rest/agile/1.0/issue/${key}?fields=summary`, {}, false),
    ))
      .fields.summary;
}

export class Repo {
  constructor(private path: string, private msToLive = 1000 * 60 * 5) {
  }

  async isFresh(): Promise<boolean> {
    const cache = await this.loadCache();
    const msPassed = new Date().getTime() - new Date(cache.date).getTime();
    return msPassed < this.msToLive;
  }

  async saveIssues(issues: ITableIssue[]) {
    await writeTextFile(this.path, JSON.stringify(this.newCache(issues)));
  }

  toString(): string {
    return this.path;
  }

  async getIssues(): Promise<ITableIssue[]> {
    const cache = await this.loadCache();
    return cache.issues;
  }

  private newCache(issues: ITableIssue[] = []): ITableIssueCache {
    return {
      issues,
      date: "0",
    };
  }

  private async loadCache(): Promise<ITableIssueCache> {
    try {
      const cacheText = await readTextFile(this.path);
      return JSON.parse(cacheText);
    } catch (e) {
      return this.newCache();
    }
  }
}
