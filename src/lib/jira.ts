import { join } from "../../deps.ts";

const { writeTextFile, readTextFile, env: { get: env } } = Deno;
import { parseQuery, QueryObject } from "./url.ts";

export type IssueKey = string;
export interface ITableIssue {
  key: IssueKey;
  status: string;
  summary: string;
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

const debug = (
  f: (
    l: (...p: Parameters<typeof console.log>) => ReturnType<typeof console.log>,
  ) => void,
) => {
  if (Deno.args.includes("-v")) {
    f(console.log);
  }
};

export class BrowserClientFactory {
  create = async () => {
    const auth = {
      host: env("JIRA_HOST") ?? "",
      cookies: env("JIRA_COOKIES") ?? "",
    };

    const path = "jira-auth.json";
    try {
      const file = JSON.parse(
        await readTextFile(join(env("HOME") ?? ".", path)),
      );
      auth.host = file.host || auth.host;
      auth.cookies = file.cookies || auth.cookies;
    } catch (e) {
      debug((l) => l(`could not open ${path}`, { e }));
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
  constructor(private readonly host: string, private readonly cookie: string) {
    this.host = this.host.replace(/\/+$/, "");
  }

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

  regStartWork = async () =>
    this.json(this.post("/rest/remote-work/1.0/userWorklog/regStartWork"));

  makeAction = async (issue: IssueKey, action = 241) => {
    const actionPath = await this.getActionPathFromIssuePage(issue, action);
    const response = await this.get(actionPath);
    console.log(response);
  };

  private async postActionForm(action: number, actionPath: string) {
    const issueId = "0";
    const formToken = ""; // - take from form.
    const atl_token = ""; // - take from path.
    const Transition = "In Progress"; // - do we need it?
    const sprintField = "customfield_15401";
    const body = new URLSearchParams({
      action: action + "",
      id: issueId,
      formToken,
      [sprintField]: "14020",
      comment: "",
      commentLevel: "",
      atl_token,
      Transition,
    });

    const response = await this.post(actionPath ?? "", body);
  }

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

  private getActionPathFromIssuePage = async (
    issue: IssueKey,
    action: number,
  ): Promise<string> => {
    const html = await this.getIssueHtml(issue);
    const matches = html.matchAll(
      /href="(?<path>[^"]*?action=(?<action>\d+)[^"]*?)"/g,
    );
    if (!matches) {
      throw new Error(`No `);
    }
    const path = Array
      .from(matches)
      .map(({ groups }) => ({
        path: groups?.path ?? "",
        action: parseInt(groups?.action ?? "0", 10),
      }))
      .find(({ action: a }) => a === action)
      ?.path;
    if (!path) {
      throw new Error(`No link with action ${action} found.`);
    }
    return path.replace(/&amp;/g, "&");
  };
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
