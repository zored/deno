import { CommandMap, Commands, Silent, ICommandsConfig } from "./command.ts";

const defaultGenerateName = "completion";
const defaultCompleteName = "completionComplete";

const print = (s: string): void => {
  Deno.stdout.writeSync(new TextEncoder().encode(s));
};

export class Generator {
  constructor(
    private commandsScriptUrl: string,
    private completeName: string = defaultCompleteName,
  ) {
  }
  generate(name: string = "./run.ts"): string {
    const infoFactory = new InfoFactory();
    const url = new URL(this.commandsScriptUrl);
    const self = [
      url.protocol.match(/^https?\:$/)
        ? `~/.deno/bin/` + url.pathname.split('/').pop()?.split('.').pop()
        : url.pathname,
      this.completeName,
    ].join(" ");
    const variablesString = infoFactory.getVariablesString();
    const completionPrefix = name.replace(/[\W]+/g, "");
    const completionName = `_${completionPrefix}_zored_shell_completion`;

    return `
${completionName}() { COMPREPLY=( $(${self} ${variablesString}) ) ; }
complete -F ${completionName} ${name}
`;
  }
}

export class CompletionCommandFactory {
  constructor(
    private commandsScriptUrl: string,
    private execName = "./run.ts",
    private generateName: string = defaultGenerateName,
    private completeName: string = defaultCompleteName,
    private write = print,
  ) {}
  apply(commands: Commands): void {
    commands.add({
      [this.generateName]: (args) =>
        this.write(
          new Generator(this.commandsScriptUrl).generate(
            args["name"] ?? this.execName,
          ),
        ),
      [this.completeName]: (args) =>
        this.write(
          new Completor((info) =>
            info.fromTree(
              this.commandsToTree(commands.getConfig().children ?? []),
            )
          ).run(args._.map((s) => s.toString())),
        ),
    });
  }

  private commandsToTree(configs: ICommandsConfig[]): IInfoTree {
    const tree: IInfoTree = {};
    configs.forEach(({ name, children }) =>
      tree[name] = children ? this.commandsToTree(children) : null
    );
    return tree;
  }
}

class InfoFactory {
  readonly variables = [
    "COMP_CWORD",
    "COMP_POINT",
    "COMP_LINE",
    "COMP_WORDBREAKS",
    "{COMP_WORDS[@]}",
  ];

  create(variables: string[]): Info {
    const [
      COMP_CWORD,
      COMP_POINT,
      COMP_LINE,
      COMP_WORDBREAKS,
      ...COMP_WORDS
    ] = variables;

    return new Info(
      parseInt(COMP_POINT),
      COMP_LINE,
      COMP_WORDS,
      parseInt(COMP_CWORD),
      COMP_WORDBREAKS.split(""),
    );
  }

  getVariablesString(): string {
    return this.variables.map((v) => `"\$${v}"`).join(" ");
  }
}

export interface IInfoTree {
  [key: string]: null | IInfoTree;
}

export class Info {
  private readonly wordTillCursor: string;
  private wordOffset = 0;

  constructor(
    private index: number,
    private args: string,
    private readonly words: string[],
    private readonly wordIndex: number,
    wordbreaks: string[],
  ) {
    const lineTillCursor = this.args.substring(0, this.index);
    const latestWordbreakIndex = Math.max(
      ...wordbreaks
        .map((b) => lineTillCursor.lastIndexOf(b))
        .filter((i) => i >= 0),
    );
    this.wordTillCursor = lineTillCursor.substring(latestWordbreakIndex + 1);
  }

  withWordOffset(wordOffset: number): Info {
    this.wordOffset = wordOffset;
    return this;
  }
  fromTree(tree: IInfoTree, wordIndex = 0): string[] {
    if (this.wordIndex - this.wordOffset === wordIndex) {
      return Object.keys(tree);
    }

    return Object.values(tree)
      .filter((v): v is IInfoTree => v !== null)
      .flatMap((tree) => this.fromTree(tree, wordIndex + 1));
  }

  isUnique(word: string): boolean {
    if (this.words.slice(this.wordOffset).includes(word)) {
      return false;
    }

    if (word.indexOf(this.wordTillCursor) !== 0) {
      return false;
    }

    return true;
  }
}

export type WordRetriever = (info: Info) => string[];
export class Completor {
  constructor(
    private getWords: WordRetriever,
    private wordOffset = 1,
  ) {}

  run(s: string[]): string {
    const info = new InfoFactory().create(s).withWordOffset(this.wordOffset);
    // Deno.writeTextFileSync('request_complete.json', JSON.stringify(info, null, 2))
    return this.getReplacementsForWordBeforeCursor(info).join(" ");
  }

  private getReplacementsForWordBeforeCursor(info: Info): string[] {
    return this.getWords(info).filter((w) => info.isUnique(w));
  }
}
