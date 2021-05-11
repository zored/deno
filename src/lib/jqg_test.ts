import { assertEquals } from "../../deps.ts";
import { Key, Path, pathToString } from "./jqg.ts";

const { test } = Deno;

test("pathToString", () => {
  ([
    [".a.b.c", ["a", "b", "c"]],
    [".a[1].c[2]", ["a", "1", "c", "2"]],
    [`.a["a-b"].c`, ["a", "a-b", "c"]],
  ] as [Key, Path][]).forEach(([key, path]) =>
    assertEquals(
      pathToString(path),
      key,
    )
  );
});
