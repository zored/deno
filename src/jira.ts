#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-write

import { Commands, CommandArgs } from "./lib/command.ts";
import { print } from "./lib/print.ts";
import { BrowserClientFactory, IssueCacherFactory } from "./lib/jira.ts";
const { env: {get: env} } = Deno;

const jira = await new BrowserClientFactory().create();
const cache = await new IssueCacherFactory().fromEnv(jira);
const one = (a: CommandArgs) => cache.one(a._[0] + "", a.field || "summary");

new Commands({
  cache: () => cache.update(),
  get: async (a) => print(await one(a)),
  action: async () => {
    await jira.makeAction("MALL-10521", 241);
  },
  getForPrompt: async (a) => print((await one(a)).replace(/[\[\]]/g, "")),
}).runAndExit();
