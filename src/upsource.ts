#!/usr/bin/env deno run -A
import { secrets } from "./rob-only-upsource.ts";
import { UpsourceApi } from "./lib/upsource.ts";
import { Commands } from "./lib/command.ts";

const { authorization, host } = secrets;

const api = new UpsourceApi(host, authorization);

await new Commands({
  toReview: async ({ _: [path] }) =>
    console.log(JSON.stringify(
      (await Promise.all([
        "reviewer",
        "author",
      ].map((me) =>
        api.getReviews({
          limit: 100,
          query: `state: open and ${me}: me`,
        })
      )))
        .flatMap((r, i) => (r.result.reviews || []).map((r) => [r, i == 1]))
        .sort(([a], [b]) => a.updatedAt - b.updatedAt)
        .map(([r, myBranch]) => ({
          url:
            `https://upsource.kube.ec.devmail.ru/${r.reviewId.projectId}/review/${r.reviewId.reviewId}`,
          updatedAt: (new Date(r.updatedAt)).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          }),
          unread: r.isUnread,
          concern: r.completionRate.hasConcern,
          myBranch,
        })),
    )),
  fetch: async ({ _: [name, body] }) =>
    console.log(
      JSON.stringify(await api.rpc(name + "", JSON.parse(body + ""))),
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
