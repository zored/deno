#!/usr/bin/env deno run -A
import { secrets } from "./rob-only-upsource.ts";
import { Err, ParticipantState, UpsourceApi } from "./lib/upsource.ts";
import { Commands } from "./lib/command.ts";

const { authorization, host } = secrets;

const api = new UpsourceApi(host, authorization);

await new Commands({
  toReview: async ({ _: [path] }) => {
    const isErr = function <T>(e: T | Err): e is Err {
      return !!(e as unknown as Err).error;
    };
    const currentUserResponse = (await api.getCurrentUser());
    if (isErr(currentUserResponse)) {
      throw new Error("No current user found.");
    }
    const myId = currentUserResponse.result.userId;

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
        .flatMap((r) => (r.result.reviews || []))
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((r) => [
          r,
          r.createdBy === myId
            ? !r.completionRate.hasConcern
            : r.participants.find((p) =>
              p.userId === myId && [
                ParticipantState.Accepted,
                ParticipantState.Rejected,
              ].includes(p.state)
            ) !== null,
        ])
        .map(([r, completed]) => ({
          url:
            `https://upsource.kube.ec.devmail.ru/${r.reviewId.projectId}/review/${r.reviewId.reviewId}`,
          updatedAt: (new Date(r.updatedAt)).toLocaleString("ru-RU", {
            timeZone: "Europe/Moscow",
          }),
          unread: r.isUnread,
          concern: r.completionRate.hasConcern,
          myBranch: r.createdBy === myId,
          completed,
        })),
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
