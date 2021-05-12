#!/usr/bin/env deno run -A

import { Commands } from "./lib/command.ts";
import { KibanaApiFactory } from "./lib/kibana.ts";
import { parseJson } from "./lib/utils.ts";

const api = new KibanaApiFactory().create();
await new Commands({
  fetch: async ({ _: [path, body], m = "GET", t = "json" }) => {
    let result = await api.fetch(
      path + "",
      body ? parseJson(body + "") : undefined,
      m + "",
      t + "",
    );

    switch (t) {
      case "json":
        result = JSON.stringify(result);
    }
    return console.log(result);
  },
}).runAndExit();
