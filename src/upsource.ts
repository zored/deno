#!/usr/bin/env deno run -A
import { createUpsourceApi, UpsourceService } from "./lib/upsource.ts";
import { Commands } from "./lib/command.ts";

const api = createUpsourceApi();
const upsource = new UpsourceService(api);

await new Commands({
  toReview: async ({ _: [path] }) => {
    console.log(JSON.stringify(
      upsource.output(
        (await upsource.getAllMyReviews()).result.reviews || [],
        await upsource.getMyId(),
      ),
    ));
  },
  fetch: async ({ _: [name, body] }) =>
    console.log(
      JSON.stringify(
        await api.rpc(name + "", JSON.parse(body ? body + "" : "{}")),
      ),
    ),
}).runAndExit();

const main = async () => {
  const firstArg = Deno.args[0];
  switch (firstArg) {
    case "for-me":
    case "from-me":
      break;
    default:
      Deno.exit(1);
  }
};

await main();
