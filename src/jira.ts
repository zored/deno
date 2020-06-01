#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-write

import { Commands, CommandArgs } from "./lib/command.ts";
import { print } from "./lib/print.ts";
import { Repo, BrowserClient, IssuesCacher } from "./lib/jira.ts";
const { writeTextFile, readTextFile, env: {get: env} } = Deno;

const cache = new IssuesCacher(
  new BrowserClient(env("JIRA_HOST") ?? "", env("JIRA_COOKIES") ?? ""),
  new Repo((env("HOME") ?? ".") + "/jira-issues.json"),
);

const one = (a: CommandArgs) => cache.one(a._[0] + '', a.field || "summary");

new Commands({
  cache: () => cache.update(),
  get: async (a) => print(await one(a)),
  getForPrompt: async (a) => print((await one(a)).replace(/[\[\]]/g, '')),
}).runAndExit();
