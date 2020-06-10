#!/usr/bin/env -S deno run --allow-net --allow-write
import {
  Application,
  Router,
} from "../deps.ts";
const { args, readAll, writeTextFile } = Deno;
const responseBody = args[0] || '{"ok": true}';
const port = args[1];
const app = new Application({ port });
const router = new Router();

let requestIndex = 0;

app.use(/.+/, async (ctx) => {
  const body = await ctx.req.bodyAsString();
  const { path, cookies, query } = ctx.req;

  const info = { path, cookies, query, date: new Date() };
  const file = `request_${requestIndex++}.json`;
  await writeTextFile(
    file,
    JSON.stringify(info, null, 2),
  );

  console.log(`${file}`);
  return responseBody;
});

await app.run();
