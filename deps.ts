// STD:
export { parse } from "https://deno.land/std@0.67.0/flags/mod.ts";
export type { Args } from "https://deno.land/std@0.67.0/flags/mod.ts";
export { delay } from "https://deno.land/std@0.67.0/async/mod.ts";
export {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.67.0/path/mod.ts";
export { bold, red, green } from "https://deno.land/std@0.67.0/fmt/colors.ts";
export {
  assertEquals,
  assertStringContains as assertStrContains,
} from "https://deno.land/std@0.67.0/testing/asserts.ts";

export { exec, OutputMode } from "https://deno.land/x/exec@0.0.5/mod.ts";

// Object:
import camelCase from "https://deno.land/x/lodash@4.17.15-es/camelCase.js";
import snakeCase from "https://deno.land/x/lodash@4.17.15-es/snakeCase.js";
import upperFirst from "https://deno.land/x/lodash@4.17.15-es/upperFirst.js";
import parseXml from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";

export { camelCase, snakeCase, upperFirst, parseXml };
export { SemVer } from "https://deno.land/x/semver@v1.0.0/mod.ts";
