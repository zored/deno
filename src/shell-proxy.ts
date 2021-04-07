#!/usr/bin/env deno run -A --quiet --unstable
import { runShellProxyFromArgs } from "./lib/shell-proxy/runShellProxyFromArgs.ts";

await runShellProxyFromArgs(import.meta, true);
