#!/usr/bin/env deno run -A
import {
  basename,
  camelCase,
  dirname,
  join,
  snakeCase,
  upperFirst,
} from "../deps.ts";
import { Commands } from "./lib/command.ts";

const { readTextFile, writeTextFile, rename } = Deno;

class Position {
  constructor(
    private line: number,
    private column: number,
  ) {}

  right(newLine: boolean = false): void {
    this.column++;
    if (!newLine) {
      return;
    }
    this.column = 1;
    this.line++;
  }

  equals(p: Position): boolean {
    return this.line == p.line && this.column == p.column;
  }

  assertOutOfBounds(bounds: Position): void {
    if (
      this.line <= bounds.line ||
      (this.line == bounds.line && this.column <= bounds.column)
    ) {
      return;
    }
    throw new Error(`Position ${this} is out of bounds: ${bounds}.`);
  }

  toString() {
    return `${this.line}:${this.column}`;
  }
}
class Cursor {
  constructor(
    public path: string,
    public position: Position,
  ) {}
  static fromString(s: string): Cursor {
    const [path, line, column] = s.split(":");
    return new Cursor(path, new Position(parseInt(line), parseInt(column)));
  }

  insert(text: string, needle: string): string {
    const [before, after] = this.splitText(text);
    return [before, needle, after].join("");
  }

  getWord(text: string): string {
    const [before, after] = this.splitText(text);
    const [, prefix] = before.match(/(\w*)$/) || [];
    const [, postfix] = after.match(/^(\w*)/) || [];
    return "" + prefix + postfix;
  }

  private splitText(text: string): [string, string] {
    const index = this.getIndex(text);
    return [
      text.substring(0, index),
      text.substring(index),
    ];
  }

  private getIndex(text: string): number {
    let index = 0;
    const position = new Position(1, 1);
    for (var letter of text) {
      position.right(letter == "\n");

      index += letter.length;
      if (position.equals(this.position)) {
        break;
      }
    }

    this.position.assertOutOfBounds(position);

    return index;
  }
}

class File {
  private static extPattern = /(\.[^.]+?)$/;
  constructor(private path: string) {
  }

  async map(f: (text: string) => string): Promise<void> {
    await this.write(f(await this.read()));
  }

  read(): Promise<string> {
    return readTextFile(this.path);
  }
  async renameButExtension(name: string): Promise<void> {
    const [, ext] = this.path.match(File.extPattern) || [];
    const newPath = join(
      dirname(this.path),
      name + (ext || ""),
    );
    console.log([this.path, newPath]);
    await rename(this.path, newPath);
  }
  getNameWithoutExtension(): string {
    return basename(this.path).replace(File.extPattern, "");
  }
  private write(text: string): Promise<void> {
    return writeTextFile(this.path, text);
  }
  static fromPath(path: string): File {
    return new File(path);
  }
}

class Editor {
  constructor(private cursor: Cursor, private file: File) {}

  static fromString(s: string): Editor {
    const cursor = Cursor.fromString(s);
    return new Editor(cursor, File.fromPath(cursor.path));
  }

  async pasteFileName(textCase: string) {
    await this.file.map((text) =>
      this.cursor.insert(text, this.getName(textCase))
    );
  }

  async pasteNewLines() {
    await this.file.map((text) =>
      text.replace(
        /(\})\s*(\n{1}|\n{3,})\s*(func|type|var)/gm,
        (substring, prefix, nl, postfix) => {
          return `${prefix}\n\n${postfix}`;
        },
      )
    );
  }

  async renameByCursor() {
    const text = await this.file.read();
    const word = this.cursor.getWord(text);
    await this.file.renameButExtension(snakeCase(word));
  }

  private getName(textCase: string): string {
    const name = camelCase(this.file.getNameWithoutExtension());
    switch (textCase) {
      case "camel":
        return name;
      case "study":
        return upperFirst(name);
    }
    throw new Error(`Unknown case ${textCase}.`);
  }
}

await new Commands({
  rename: ({ _: [cursor] }) => Editor.fromString(cursor + "").renameByCursor(),
  paste: {
    name: ({ _: [cursor, textCase] }) =>
      Editor.fromString(cursor + "").pasteFileName(textCase + ""),
    newLines: ({ _: [cursor] }) =>
      Editor.fromString(cursor + "").pasteNewLines(),
  },
}).runAndExit();
