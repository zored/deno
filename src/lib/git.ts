import { SemVer } from "../../deps.ts";
import { Runner } from "./command.ts";

const { readTextFile, writeTextFile, remove } = Deno;

interface IGitShell {
  reflogSubjects(): Promise<string>;

  getUntracked(): Promise<string[]>;

  lastTag(): Promise<string>;

  pushNewTag(tag: string): Promise<void>;
}

class GitShell implements IGitShell {
  reflogSubjects = async () =>
    this.run(`git reflog --pretty=%gd%gs --date=iso`);

  getUntracked = async () =>
    (await this.run(`git ls-files --others --exclude-standard`))
      .split("\n")
      .filter((file) => file !== "");

  lastTag = async () =>
    this.run(`git describe --tags ${await this.lastTaggedHash()}`);

  pushNewTag = async (tag: string) => {
    await this.tag(tag);
    await this.run(`git push --tags`);
  };

  private tag = (tag: string) =>
    this.run(`git tag --annotate ${tag} --message ${tag}`);

  private lastTaggedHash = () => this.run(`git rev-list --tags --max-count=1`);

  private run = async (command: string) =>
    (await new Runner().output(command)).trim();
}

type Ref = string;

interface IReflogSubjects {
  date: Date;
  from: Ref;
  to: Ref;
}

export class GitClient {
  constructor(private git: IGitShell = new GitShell()) {
  }

  async recentRefs(): Promise<Ref[]> {
    const subjects = await this.reflogSubjects();
    const refSet = subjects.reduce(
      (set, { from, to }) => [from, to].reduce((set, ref) => set.add(ref), set),
      new Set<Ref>(),
    );
    return Array.from(refSet);
  }

  async reflogSubjects(): Promise<IReflogSubjects[]> {
    const output = await this.git.reflogSubjects();
    return output
      .split("\n")
      .map((line) =>
        line.match(/^HEAD@{(.+?)}checkout: moving from (.+) to (.+)$/) || []
      )
      .map(([, date, from, to]): IReflogSubjects => ({
        date: new Date(date),
        from,
        to,
      }))
      .filter(({ from }) => from !== undefined);
  }

  getUntracked = async () => this.git.getUntracked();

  lastVersion = async () => await this.getLastVersion();

  private getLastVersion = async (): Promise<SemVer> =>
    new SemVer(await this.git.lastTag());

  pushNewTag = (tag: string) => this.git.pushNewTag(tag);
}

export class MessageBuilder {
  constructor(
    public lines: string[],
    private prefix = "- ",
    private glue = "\n",
  ) {
  }

  add(line: string): void {
    this.lines.push(line);
  }

  flush(): string {
    const result = this.lines.length === 1 ? this.lines[0] : this.lines
      .map((l) => this.prefix + l)
      .join(this.glue);
    this.lines = [];
    return result;
  }
}

export class MessageBuilderRepo {
  constructor(private file = ".git_message.json") {
  }

  async each(f: (builder: MessageBuilder) => void): Promise<void> {
    const builder = await this.get();
    f(builder);
    await this.save(builder);
  }

  get = async (): Promise<MessageBuilder> =>
    new MessageBuilder(await this.loadLines());

  private loadLines = async (): Promise<string[]> => {
    try {
      return JSON.parse(await readTextFile(this.file)) as string[];
    } catch (e) {
      return [];
    }
  };

  async save(builder: MessageBuilder): Promise<void> {
    const lines = builder.lines;
    if (lines.length === 0) {
      await remove(this.file);
    } else {
      await writeTextFile(this.file, JSON.stringify(lines));
    }
  }
}
