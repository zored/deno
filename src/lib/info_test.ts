import { Info } from "./info.ts";
import { assertEquals, assert } from "https://deno.land/std/testing/asserts.ts";
const { test } = Deno;

test("updates test", () => {
  const [before, afterExpected] = [
    `<!-- info.ts.textFromXml("src/lib/info_test.xml", "//tag1[1]") { -->xxxxxx<!-- } --> 123 <!-- info.ts.textFromXml("src/lib/info_test.xml", "//tag2[1]") { -->xxxxxx<!-- } -->`,
    `<!-- info.ts.textFromXml("src/lib/info_test.xml", "//tag1[1]") { -->value1<!-- } --> 123 <!-- info.ts.textFromXml("src/lib/info_test.xml", "//tag2[1]") { -->value2<!-- } -->`,
  ];
  const after = new Info().updateText(before);
  assertEquals(afterExpected, after);
});
