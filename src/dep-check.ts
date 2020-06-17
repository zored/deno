#!/usr/bin/env deno run --allow-read
import { DepChecker } from "./lib/dep-check.ts";
const { args } = Deno;

const [path, rulesPath] = args;
await new DepChecker().byPaths(path, rulesPath);
