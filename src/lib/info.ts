import parse from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";
const { readTextFileSync, writeTextFileSync } = Deno;

export class Info {
  private readonly methods = new Methods();
  updateFiles(files: string[]): void {
    files.forEach((file): void => this.updateFile(file));
  }

  updateText(text: string): string {
    return text.replace(
      /<!--\s*info\.ts\.textFromXml\("(.+?)",\s*"(.+?)"\)\s*\{\s*-->([\s\S]+?)<!--\s*\}\s*-->/gm,
      (match, xmlFile, xpath, contents): string => {
        return [
          '<!-- info.ts.textFromXml("' + xmlFile + '", "' + xpath + '") { -->',
          this.methods.textFromXml(xmlFile, xpath).trim(),
          "<!-- } -->",
        ].join("");
      },
    );
  }

  private updateFile(file: string): void {
    const contents = readTextFileSync(file);
    const newContents = this.updateText(contents);
    writeTextFileSync(file, newContents);
  }
}
class Methods {
  textFromXml(file: string, xpath: string): string {
    const text = readTextFileSync(file);
    const node = parse(text);

    // Get name:
    const match = xpath.match(/^\/\/(.*)\[1\]$/);
    if (!match) {
      throw new Error(`Can't support xpath ${xpath}`);
    }
    const [, tagName] = match;

    return node
      ?.root
      ?.children
      .find(({ name }) => name === tagName)
      ?.content ?? "";
  }
}
