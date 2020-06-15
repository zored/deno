#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --quiet
import { runCommands } from "../mod.ts";
import { runFromEnv } from "./lib/shell-proxy/ProxyRunnerFactory.ts";

const name = "i";
await runCommands({ [name]: () => runFromEnv(name) });
