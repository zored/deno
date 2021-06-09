// STD:
export { serve } from "https://deno.land/std@0.92.0/http/server.ts";
export { parse } from "https://deno.land/std@0.92.0/flags/mod.ts";
export type { Args } from "https://deno.land/std@0.92.0/flags/mod.ts";
export { delay } from "https://deno.land/std@0.92.0/async/mod.ts";
export {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.92.0/path/mod.ts";
export { bold, green, red } from "https://deno.land/std@0.92.0/fmt/colors.ts";
export {
  assertEquals,
  assertStringIncludes as assertStrContains,
} from "https://deno.land/std@0.92.0/testing/asserts.ts";

export { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";

// Object:
import camelCase from "https://deno.land/x/lodash@4.17.15-es/camelCase.js";
import snakeCase from "https://deno.land/x/lodash@4.17.15-es/snakeCase.js";
import merge from "https://deno.land/x/lodash@4.17.15-es/merge.js";
import zip from "https://deno.land/x/lodash@4.17.15-es/zip.js";
import zipObject from "https://deno.land/x/lodash@4.17.15-es/zipObject.js";
import chunk from "https://deno.land/x/lodash@4.17.15-es/chunk.js";
import fromPairs from "https://deno.land/x/lodash@4.17.15-es/fromPairs.js";
import upperFirst from "https://deno.land/x/lodash@4.17.15-es/upperFirst.js";
import parseXml from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";

export {
  camelCase,
  chunk,
  fromPairs,
  merge,
  parseXml,
  snakeCase,
  upperFirst,
  zip,
  zipObject,
};
export { SemVer } from "https://deno.land/x/semver@v1.0.0/mod.ts";
