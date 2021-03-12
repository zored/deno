#!/usr/bin/env deno run --allow-net --allow-read --allow-env --allow-write
import { secrets } from "./rob-only-upsource.ts";
import { UpsourceApi } from "./lib/upsource.ts";

const { authorization, host } = secrets;

const main = async () => {
  const api = new UpsourceApi(host, authorization);

  const firstArg = Deno.args[0];
  switch (firstArg) {
    case "for-me":
    case "from-me":
      const me = firstArg === "for-me" ? "reviewer" : "author";
      console.log(JSON.stringify(
        await api.getReviews({
          limit: 100,
          query: `state: open and ${me}: me`,
        }),
      ));
      break;
    default:
      Deno.exit(1);
  }
};

await main();
