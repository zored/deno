#!/usr/bin/env deno run -A
import { exec, OutputMode } from "../deps.ts";

const { exit } = Deno;
const responses = await Promise.all([
  "chromedriver --version",
  '"/Applications/Google\ Chrome.app/Contents/MacOS/Google Chrome" --version',
].map(async (command) => await exec(command, { output: OutputMode.Capture })));

const getVersion = (s: string): string => {
  const matches = s.match(/(\d{2}.\d{1}.\d{4})/);
  if (!matches) {
    return "";
  }
  return matches[1];
};
const versions = responses.map((r) => getVersion(r.output)).reduce(
  (set, v) => set.add(v),
  new Set(),
);
console.log(Array.from(versions).join("\n"));
Deno.exit(versions.size > 1 ? 1 : 0);
