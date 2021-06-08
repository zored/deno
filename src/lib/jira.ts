import { serve } from "../../deps.ts";
import { parseQuery, QueryObject } from "./url.ts";
import { load } from "./configs.ts";
import { myFetch } from "./utils.ts";

const { writeTextFile, readTextFileSync, env: { get: env } } = Deno;

export type IssueKey = string;

export interface ITableIssue {
  id: number;
  key: IssueKey;
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
  create(client?: BrowserClient): IssuesCacher {
    const clientFactory = BrowserClientFactory.get();
    return new IssuesCacher(
      client ?? clientFactory.create(),
      new Repo(clientFactory.getIssuesPath()),
    );
  }
}

export class JiraCookieListener {
  async start(port: number, path: string) {
    if (!port) {
      throw new Error("specify port");
    }
    console.log(
      `Listening port ${port} for Jira cookies to save in ${path}...`,
    );
    for await (const request of serve({ port })) {
      const cookies = new TextDecoder().decode(
        await Deno.readAll(request.body),
      );

      const url = request.url;

      const matches = url.match(/siteId=(.+?)(&|$)/);
      if (!matches) {
        throw new Error(`siteId is not provided`);
      }
      const siteId = matches[1] as "jira" | "upsource";
      if (!["jira", "upsource"].includes(siteId)) {
        throw new Error(`siteId '${siteId}' is invalid`);
      }

      const auth: {
        jira: { cookies: string };
        upsource: { authorization: string; cookies: string };
      } = JSON.parse(
        readTextFileSync(path),
      );
      switch (siteId) {
        case "upsource":
          auth.upsource.authorization = `Bearer ${cookies}`;
          break;
        default:
          auth.jira.cookies = cookies;
      }
      Deno.writeTextFileSync(path, JSON.stringify(auth));
      console.debug(`wrote '${siteId}' cookies`);

      request.respond({
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
        }),
        body: "ok",
      });
    }
  }
}

export class BrowserClientFactory {
  private static instance?: BrowserClientFactory;

  private constructor(
    private readonly host: string,
    private readonly cookies: string,
    private readonly issuesPath: string,
  ) {
  }

  static get(): BrowserClientFactory {
    if (!BrowserClientFactory.instance) {
      const c = load<{
        host: string;
        cookies: string;
        issuesPath: string;
      }>("jira");
      BrowserClientFactory.instance = new BrowserClientFactory(
        c.host,
        c.cookies,
        c.issuesPath,
      );
    }
    return BrowserClientFactory.instance;
  }

  create(): BrowserClient {
    return new BrowserClient(this.host as string, this.cookies as string);
  }

  getHost() {
    return this.host;
  }

  getIssuesPath() {
    return this.issuesPath;
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
      BrowserClient.JQL_LAST_VIEWED,
      true,
    );
    await this.repo.saveIssues(issues);
  }

  async one(key: string, field: string = "summary"): Promise<string> {
    return (await this.all([key], field))[key] || "";
  }

  async all(
    keys: string[],
    field: string = "summary",
  ): Promise<Record<IssueKey, string>> {
    keys = keys.filter((k) => !!k);
    if (!keys.length) {
      throw new Error(`Specify Jira issue key!`);
    }
    return (await this.getAllIssues())
      .filter((v) => keys.includes(v.key))
      .reduce((r, v) => {
        r[v.key] = (v as any)[field];
        return r;
      }, {} as Record<IssueKey, string>);
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

export class JiraError implements Error {
  constructor(private r: { errorMessages: string[]; errors: object }) {
  }

  get message() {
    return this.r.errorMessages.join("\n");
  }

  get name() {
    return "jira error";
  }
}

export class BrowserClient {
  public static JQL_LAST_VIEWED =
    "lastViewed is not empty order by lastViewed desc";
  public static JQL_MY_UNRESOLVED_OR_ASSIGNED_TO_MERGE =
    '(assignee = currentUser() AND resolution = Unresolved AND status != Done) OR (assignee was currentUser() and status = "To Merge") order by updated DESC';

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

  async findIssues(
    {
      jql = undefined as string | undefined,
      fields = [] as string[],
    },
  ) {
    return (await this.json(this.get(
      `/rest/api/2/search?${
        parseQuery({
          jql: jql ? encodeURIComponent(jql) : undefined,
          fields: fields.length === 0 ? undefined : fields.join(","),
        })
      }`,
      {},
      false,
    ))).issues;
  }

  getIssueFields(
    key: IssueKey,
    fields: string[],
    expand: string[] = [],
  ): Promise<any> {
    return this.json(
      this.get(
        `/rest/agile/1.0/issue/${key}?${
          parseQuery({
            fields: fields.length > 0 ? fields.join(",") : undefined,
            expand: expand.length > 0 ? expand.join(",") : undefined,
          })
        }`,
        {},
        false,
      ),
    );
  }

  async getCurrentUserName() {
    return (await this.json(this.get(`/rest/auth/1/session`, {}, false))).name;
  }

  async fetchSimple(method: string, path: string) {
    const request = method === "get"
      ? this.get(path, {}, false)
      : this.post(path, null, true);
    return await this.json(request);
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

  private init(form = true): RequestInit {
    return {
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
          ? {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          }
          : {}),
      },
      "referrer": `${this.host}/`,
      "referrerPolicy": "no-referrer-when-downgrade",
      "method": "POST",
      "mode": "cors",
    };
  }

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

  private fetch(
    path: string,
    init: Partial<RequestInit> = {},
    form = true,
  ) {
    return myFetch(
      `${this.host}/${path.replace(/^\//, "")}`,
      {
        ...this.init(form),
        ...init,
      },
    );
  }

  private async json(p: Promise<Response>): Promise<any> {
    const text = await (await p).text();
    let r: any;
    try {
      r = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `could not parse Jira response: ${
          text.replaceAll(/\s+/mg, " ").substring(0, 200)
        }`,
      );
    }
    if (r.errorMessages) {
      throw new JiraError(r);
    }
    return r;
  }

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
      const cacheText = readTextFileSync(this.path);
      return JSON.parse(cacheText);
    } catch (e) {
      return this.newCache();
    }
  }
}
