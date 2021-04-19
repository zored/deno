// Usage:
//  deno run --unstable -A https://raw.githubusercontent.com/zored/deno/v0.0.72/src/velobeat.ts 2021-04-05 4,12
// Where:
//  2021-04-05 - is monday date.
//  4,12 - is allowed diff length.
import { existsSync } from "https://deno.land/std@0.91.0/fs/mod.ts";
import { printf } from "https://deno.land/std@0.91.0/fmt/printf.ts";

await main();

async function main() {
  await delayCheck({
    previous: "old.htm",
    current: "new.htm",
  });
}

async function delayCheck(files: Files) {
  const lines = await htmlUpdated(files);
  if (lines.length > 0) {
    console.log(`HTML updated!\n\n${lines}`);
    Deno.exit(0);
  }

  printf(".");
  setTimeout(async function () {
    await delayCheck(files);
  }, 10000);
}

async function htmlUpdated(files: Files) {
  if (!existsSync(files.previous)) {
    await saveHtml(files.previous);
    return "";
  }
  await saveHtml(files.current);
  const lines = await diffLines(files);
  if (
    (Deno.args[1] || "4,12").split(",").map((v) => parseInt(v) + 1).includes(
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
  const date = Deno.args[0];
  if (!date) {
    console.error("Specify monday date like: 2021-04-05");
    Deno.exit(1);
  }
  return await (await fetch(
    "https://velobeat.ru/schedule/?studio_id=0&date=" + date,
  )).text();
}
