import { getNestedCommand, tailNest } from "./utils.ts";
import { assertEquals } from "../../../deps.ts";

Deno.test("quotes", () => {
  const c = [
    "sh -c",
    "sh -c",
    "sh -c",
    `a=1 && echo "$\{a}" && echo ${getNestedCommand('strict "string"', 3)}`,
  ];
  assertEquals(
    tailNest(c, true).join(" "),
    Deno.readTextFileSync("src/lib/shell-proxy/utils_test.sh").split("\n")[0],
  );
  assertEquals(
    tailNest(c, false),
    [
      "sh",
      "-c",
      `sh -c $'sh -c $\\'a=1 && echo "\${a}" && echo $\\\\\\\\\\\\\\'strict "string"\\\\\\\\\\\\\\'\\''`,
    ],
  );
});
