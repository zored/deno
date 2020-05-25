#!/usr/bin/env -S deno run --allow-read
import { DepChecker } from "./data/dep-check.ts";
const { args } = Deno;

const [path, rulesPath] = args;
await new DepChecker().byPaths(path, rulesPath);
