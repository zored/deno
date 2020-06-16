#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --quiet --unstable
import { runShellProxyFromArgs } from "./lib/shell-proxy/ProxyRunnerFactory.ts";

await runShellProxyFromArgs(import.meta, true);
