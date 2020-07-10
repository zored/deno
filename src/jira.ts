#!/usr/bin/env deno run --allow-net --allow-read --allow-env --allow-write

import { Commands, CommandArgs } from "./lib/command.ts";
import { print } from "./lib/print.ts";
import { BrowserClientFactory, IssueCacherFactory } from "./lib/jira.ts";
import { QueryObject } from "./lib/url.ts";
const { env: { get: env } } = Deno;

const jira = await new BrowserClientFactory().create();
const cache = await new IssueCacherFactory().fromEnv(jira);
const one = (a: CommandArgs) => cache.one(a._[0] + "", a.field || "summary");

new Commands({
  cache: () => cache.update(),
  get: async (a) => print(await one(a)),
  action: async ({ _: [issue, action = 241] }) =>
    await jira.makeAction(issue + "", parseInt(action + "", 10)),
  getForPrompt: async (a) => print((await one(a)).replace(/[\[\]]/g, "")),
  create: async ({ _: [q] }) => {
    Deno.writeTextFileSync("a.json", q + "");
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
}).runAndExit();
