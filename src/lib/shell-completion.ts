import { CommandMap, Commands, Silent } from "./command.ts";

export class CompletionGenerator {
  constructor(private commandsScriptUrl: string) {
  }
  generate(name: string = "./run.ts"): string {
    const infoFactory = new InfoFactory();
    const self = [new URL(this.commandsScriptUrl).pathname, "completionComplete"].join(' ');
    const variablesString = infoFactory.getVariablesString();
    const completionName = `_${
      name.replace(/[\W]+/g, "")
    }_zored_shell_completion`;

    return `
${completionName}() { COMPREPLY=( $(${self} ${variablesString}) ) ; }
complete -F ${completionName} ${name}
        `;
  }
}

const print = (s: string) => Deno.stdout.writeSync(new TextEncoder().encode(s));

export class CompletionCommandFactory {
  constructor(private commandsScriptUrl: string, private execName = "./run.ts"){}
  apply(commands: Commands): void {
    commands.add({
      completion: args => print(new CompletionGenerator(this.commandsScriptUrl).generate(args['name'] ?? this.execName)),
      completionComplete: (args) => print(
        new CompletionHandler(() => commands
          .getConfig()
          .children
          ?.map(({name})=> name) ?? []
        ).handle(args._.map((s) => s.toString()))
      ),
    })
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

class Info {
  private readonly wordTillCursor: string;

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

  isUnique(word: string, wordIndex = 1): boolean {
    if (this.wordIndex !== wordIndex) {
      return false;
    }

    if (this.words.slice(wordIndex).includes(word)) {
      return false;
    }

    if (word.indexOf(this.wordTillCursor) !== 0) {
      return false;
    }

    return true;
  }
}

export class CompletionHandler {
  constructor(private getWords: () => string[], private wordIndex = 1) {
  }

  handle(s: string[]): string {
    const info = new InfoFactory().create(s);
    Deno.writeTextFileSync(
      "/Users/r.akhmerov/git/github.com/zored/deno/shell-completion.log",
      JSON.stringify(info, null, 2),
    );
    return this.getReplacementsForWordBeforeCursor(info).join(" ");
  }

  private getReplacementsForWordBeforeCursor(info: Info): string[] {
    return this.getWords().filter((w) => info.isUnique(w, this.wordIndex));
  }
}
