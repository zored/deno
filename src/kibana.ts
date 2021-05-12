#!/usr/bin/env deno run -A

import { Commands } from "./lib/command.ts";
import { KibanaApiFactory } from "./lib/kibana.ts";

const api = new KibanaApiFactory().create();
await new Commands({
  fetch: async ({ _: [path, body] }) =>
    console.log(JSON.stringify(
      await api.fetch(
        path + "",
        body ? JSON.parse(body + "") : undefined,
      ),
    )),
}).runAndExit();
