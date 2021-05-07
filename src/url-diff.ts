import { printf } from "https://deno.land/std@0.91.0/fmt/printf.ts";
import { existsSync, wait } from "./lib/utils.ts";

const [url, allowedDiffLengthsByComma] = Deno.args;
await main();

async function main() {
  await wait(() =>
    delayCheck({
      previous: "url_diff_old.htm",
      current: "url_diff_new.htm",
    }), 10000);
}

async function delayCheck(files: Files): Promise<boolean> {
  const lines = await htmlUpdated(files);
  if (lines.length > 0) {
    console.log(`HTML updated!\n\n${lines}`);
    return true;
  }
  printf(".");
  return false;
}

async function htmlUpdated(files: Files) {
  if (!existsSync(files.previous)) {
    await saveHtml(files.previous);
    return "";
  }
  await saveHtml(files.current);
  const lines = await diffLines(files);
  if (
    (allowedDiffLengthsByComma || "4,12").split(",").map((v) => parseInt(v) + 1)
      .includes(
        lines.length,
      )
  ) {
    return "";
  }

  return lines.join("\n");
}

async function saveHtml(path: string) {
  await Deno.writeTextFile(path, await html());
}

interface Files {
  current: string;
  previous: string;
}

async function diffLines(files: Files): Promise<string[]> {
  return new TextDecoder().decode(
    await Deno.run({
      cmd: ["diff", files.previous, files.current],
      stdout: "piped",
      stderr: "piped",
    }).output(),
  ).split("\n");
}

async function html(): Promise<string> {
  return await (await fetch(url)).text();
}
