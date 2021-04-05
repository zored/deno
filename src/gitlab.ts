#!/usr/bin/env deno run -A

import { Commands } from "./lib/command.ts";
import { EnvGitlabApiFactory } from "./lib/gitlab.ts";

const gitlabApi = (new EnvGitlabApiFactory()).create();
await new Commands({
  groups: async ({ _: [path] }) =>
    console.log(JSON.stringify(await gitlabApi.groups(path + ""))),
  fetch: async ({ _: [path, init] }) =>
    console.log(JSON.stringify(
      await gitlabApi.fetch(
        path + "",
        JSON.parse(init ? (init + "") : "{}") as RequestInit,
      ),
    )),
}).runAndExit();
