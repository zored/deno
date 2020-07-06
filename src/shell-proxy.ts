#!/usr/bin/env deno run --allow-run --allow-env --allow-read --quiet --unstable
import { runShellProxyFromArgs } from "./lib/shell-proxy/runShellProxyFromArgs.ts";

await runShellProxyFromArgs(import.meta, true);
