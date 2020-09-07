import { assertEquals, SemVer } from "../../deps.ts";

const { test } = Deno;

test("increment pre-release", () => {
  assertEquals("1.1.0", (new SemVer("1.1.0-alpha+1")).inc("patch") + "");
});
