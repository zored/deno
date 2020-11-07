const { test } = Deno;
import { assertEquals } from "../../deps.ts";
import { Dirs, GitPaths } from "./git-paths.ts";

test("path by url", () => {
  const httpsUrl = "https://github.com/zored/deno/inner";
  const originUrl = "git@github.com:zored/deno/inner.git";
  const inputs = [httpsUrl, originUrl];
  const paths = new GitPaths("/git/root");

  inputs.forEach((url) => {
    const path = paths.getPathByUrl(url) as string;
    assertEquals("/git/root/github.com/zored/deno/inner", path);
    assertEquals(originUrl, paths.getOriginByPath(path, true));
    assertEquals(httpsUrl, paths.getOriginByPath(path, false));
  });
});

test("completes by innermost directory", () => {
  const paths = new GitPaths("/root", {
    getDirs: (): Dirs => ({
      "a.com": {
        "one": {
          "deno": null,
        },
        "two": {
          "deno": null,
        },
        "deno": {
          "land": {
            "here": null,
          },
        },
      },
    }),
  });
  assertEquals(
    [
      "/root/a.com/one/deno",
      "/root/a.com/two/deno",
      "/root/a.com/deno/land/here",
    ],
    paths.getOptions(""),
  );
  assertEquals(
    ["/root/a.com/one/deno", "/root/a.com/two/deno"],
    paths.getOptions("den"),
  );
  assertEquals(["/root/a.com/deno/land/here"], paths.getOptions("her"));
  assertEquals([], paths.getOptions("tw"));
});
