#!/usr/bin/env deno run --allow-net --quiet
import {
  Application,
  Router,
} from "https://deno.land/x/denotrain@v0.5.2/mod.ts";

const app = new Application({ port: parseInt(Deno.args[0]) || 3000 });
const success = { "ok": true };

const createObjectRoute = () => {
  const router = new Router();
  let storage: object = { hello: "world" };
  router.get("/", () => storage);
  router.post("/", ({ req: {body} }) => {
    if ((typeof body) !== "object") {
      throw new Error(`Invalid JSON request.`);
    }
    storage = body;
    return { "ok": true };
  });
  return router;
};

const createNumbersRoute = () => {
  const router = new Router();
  const parseName = (n: any) => n + "";

  const numbers: Record<string, [Date, number][]> = {};

  // Create:
  router.post("/:name", ({ req: {params: {name}, body} }) => {
    if (!Number.isFinite(body)) {
      throw new Error(`Request JSON with number in body.`);
    }
    name = parseName(name);
    numbers[name] = (numbers[name] ?? []).concat([[
      new Date(),
      body as any,
    ]]);
    return success;
  });

  // Read:
  router.get("/", () => numbers);
  router.get(
    "/:name",
    ({ req: {params: {name}} }) => numbers[parseName(name)],
  );

  // Delete:
  const deleteOne = (name: string) => {
    delete numbers[name];
    return success;
  };
  router.delete(
    "/",
    () => Object.keys(numbers).forEach((k) => delete numbers[k]),
  );
  router.delete("/:name", ({ req: {params: {name}} }) => {
    deleteOne(parseName(name));
    return success;
  });

  return router;
};

const led16 = createObjectRoute();
app.use("/led16", led16);
app.use("/", led16); // - back-compatibility.
app.use("/numbers", createNumbersRoute());

await app.run();
