#!/usr/bin/env deno run -A

import { CommandArgs, Commands } from "./lib/command.ts";
import { print } from "./lib/print.ts";
import {
  BrowserClientFactory,
  IssueCacherFactory,
  JiraCookieListener,
} from "./lib/jira.ts";
import { QueryObject } from "./lib/url.ts";

const { env: { get: env } } = Deno;

const jira = BrowserClientFactory.get().create();
const cache = new IssueCacherFactory().create(jira);
const one = (a: CommandArgs) => cache.one(a._[0] + "", a.field || "summary");

new Commands({
  cache: () => cache.update(),
  get: async (a) => print(await one(a)),
  action: async ({ _: [issue, action = 241] }) =>
    await jira.makeAction(issue + "", parseInt(action + "", 10)),
  delete: async ({ _: [key] }) => print(await jira.deleteIssue(key + "")),
  getForPrompt: async (a) => print((await one(a)).replace(/[\[\]]/g, "")),
  create: async ({ _: [q] }) => {
    const query: QueryObject = JSON.parse((q + "").trim());
    for (var i in query) {
      const matches = ("" + query[i]).match(/^%sprint\((.+)\)%$/);
      if (!matches) {
        continue;
      }
      const [, sprintQuery] = matches;
      query[i] = "" + await jira.getSprint(sprintQuery);
    }
    console.log(
      await jira.createIssue(query),
    );
  },
  listenCookies: ({ _: [number, path] }) =>
    new JiraCookieListener().start(parseInt(number + ""), path + ""),
  async fetch({ _: [method, path] }) {
    console.log(JSON.stringify(await jira.fetchSimple(method + "", path + "")));
  },
}).runAndExit();
