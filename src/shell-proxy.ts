#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --quiet --unstable
import { runShellProxyFromArgs } from "./lib/shell-proxy/ProxyRunnerFactory.ts";
import { Commands, runCommands } from "./lib/command.ts";

runShellProxyFromArgs(import.meta, true);
