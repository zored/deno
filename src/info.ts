#!/usr/bin/env -S deno run --allow-read --allow-write
import parse from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";

class Methods {
  textFromXml(file: string, xpath: string): string {
    const text = Deno.readTextFileSync(file);
    const node = parse(text);
    switch (xpath) {
      case "//description[1]":
        return node
          ?.root
          ?.children
          .find(({ name }) => name === "description")
          ?.content ?? "";
      default:
        throw new Error(`Can't support xpath ${xpath}`);
    }
  }
}

const methods = new Methods();

Deno.args.forEach((file): void => {
  const contents = Deno.readTextFileSync(file);
  const newContents = contents.replace(
    /<!--\s*info\.ts\.textFromXml\(\`(.+?)\`,\s*\`(.+?)\`\)\s*\{\s*-->([\s\S]+?)<!--\s*\}\s*-->/gm,
    (match, xmlFile, xpath, contents): string => {
      return [
        "<!-- info.ts.textFromXml(`" + file + "`, `" + xpath + "`) { -->",
        methods.textFromXml(xmlFile, xpath).trim(),
        "<!-- } -->",
      ].join("\n");
    },
  );
  Deno.writeTextFileSync(file, newContents);
});
