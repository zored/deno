import { Dep, DepFactory } from "./dep-check.ts";
import { assertEquals } from "../../deps.ts";

const { test } = Deno;

test("retrieve correct deps", async () => {
  const path = "src/lib/dep-check_test/";
  const deps = await new DepFactory().allByPath(path);
  const byFile = (a: Dep, b: Dep) => (a.file ?? "").localeCompare(b.file ?? "");
  assertEquals(
    [
      new Dep(path, ["a", "b", "c", "d", "e"], "a.go"),
      new Dep(path, ["some.dep.a", "some.dep.b"], "a.kt"),
    ].sort(byFile),
    deps.sort(byFile),
  );
});
