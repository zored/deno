#!/usr/bin/env deno run -A
import {
  createUpsourceApi,
  ParticipantState,
  ReviewDescriptor,
  UpsourceService,
} from "./lib/upsource.ts";
import { Commands } from "./lib/command.ts";

const api = createUpsourceApi();
const upsource = new UpsourceService(api);

await new Commands({
  toReview: async ({ _: [path] }) => {
    const myId = await upsource.getMyId();
    console.log(JSON.stringify(
      ((await upsource.getAllMyReviews()).result.reviews || [])
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((r) =>
          [
            r,
            r.createdBy === myId
              ? !r.completionRate.hasConcern
              : r.participants.find((p) =>
                p.userId === myId && p.state && [
                  ParticipantState.Accepted,
                  ParticipantState.Rejected,
                ].includes(p.state)
              ) !== null,
          ] as [ReviewDescriptor, boolean]
        )
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
