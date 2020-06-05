import { Duration, Milliseconds, parseDuration } from "./duration.ts";
import { assertEquals } from "../../deps.ts";
const { test } = Deno;

const data: [Duration, Milliseconds][] = [
  ["1s", 1000],
  ["1d1h1m1s1ms", 36061001],
];

test("durations", () => {
  data.forEach(([duration, ms]) => {
    assertEquals(ms, parseDuration(duration));
  });
});
