import parse from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";
const {readTextFileSync, writeTextFileSync} = Deno;

export class Info {
  private readonly methods = new Methods();
  updateFiles(files: string[]): void {
    files.forEach((file): void => {
    });
  }

  private updateFile(file: string): void {
    const contents = readTextFileSync(file);
    const newContents = contents.replace(
      /<!--\s*info\.ts\.textFromXml\(\`(.+?)\`,\s*\`(.+?)\`\)\s*\{\s*-->([\s\S]+?)<!--\s*\}\s*-->/gm,
      (match, xmlFile, xpath, contents): string => {
        return [
          "<!-- info.ts.textFromXml(`" + file + "`, `" + xpath + "`) { -->",
          this.methods.textFromXml(xmlFile, xpath).trim(),
          "<!-- } -->",
        ].join("\n");
      },
    );
    writeTextFileSync(file, newContents);

  }
}
class Methods {
  textFromXml(file: string, xpath: string): string {
    const text = readTextFileSync(file);
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
