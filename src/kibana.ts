#!/usr/bin/env deno run -A

import { Commands } from "./lib/command.ts";
import { KibanaApiFactory } from "./lib/kibana.ts";
import { parseJson } from "./lib/utils.ts";

const fetch = async ({ _: [host, path, body], m = "GET", t = "json" }) => {
  let result = await new KibanaApiFactory().create(host).fetch(
    path + "",
    body ? parseJson(body + "") : undefined,
    m + "",
    t + "",
  );

  switch (t) {
    case "json":
      result = JSON.stringify(result.hits.hits);
  }
  console.log(result);
};

await new Commands({
  fetch,
  discover: async ({ _: [host, index, query, from] }) => {
    await fetch({
      _: [
        host,
        `/${index}/_search?q=${encodeURIComponent(query)}`,
        `{"sort":[{"@timestamp":{"order":"desc"}}],"size":20,"from":${from ||
          0}}`,
      ],
    });
  },
}).runAndExit();
