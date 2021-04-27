import { SemVer } from "../../deps.ts";
import { Runner } from "./command.ts";
import { JsonFile, load } from "./configs.ts";

const { readTextFile, writeTextFile, remove } = Deno;

interface BranchCommit {
  subject: string;
  hash: string;
}

interface IGitShell {
  reflogSubjects(): Promise<string>;

  getUntracked(): Promise<string[]>;

  lastTag(): Promise<string>;

  pushNewTag(tag: string): Promise<void>;

  getBranchCommits(branch: string): Promise<BranchCommit[]>;

  getCurrentBranch(): Promise<string>;

  getRemoteUrl(origin: string): Promise<string>;
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

  async getBranchCommits(branch: string): Promise<BranchCommit[]> {
    return (await this.run(
      `git log master..${branch} --pretty=%H%s --no-merges`,
    ))
      .split("\n")
      .map((s) => ({
        hash: s.substring(0, 40),
        subject: s.substring(40),
      }));
  }

  async getCurrentBranch(): Promise<string> {
    return await this.run(`git branch --show-current`);
  }

  async getRemoteUrl(upstream: string): Promise<string> {
    return await this.run(`git remote get-url ${upstream}`);
  }

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
  constructor(private api: IGitShell = new GitShell()) {
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
    const output = await this.api.reflogSubjects();
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

  async getUntracked() {
    return this.api.getUntracked();
  }

  lastVersion = async () => await this.getLastVersion();

  pushNewTag(tag: string) {
    return this.api.pushNewTag(tag);
  }

  async getCurrentBranchHashes(): Promise<string[]> {
    const branch = await this.api.getCurrentBranch();
    return (await this.api.getBranchCommits(branch))
      .filter(({ subject }) => subject.startsWith(branch))
      .map(({ hash }) => hash);
  }

  getCurrentBranch(): Promise<string> {
    return this.api.getCurrentBranch();
  }

  getOriginUrl() {
    return this.api.getRemoteUrl("origin");
  }

  private async getLastVersion(): Promise<SemVer> {
    return new SemVer(await this.api.lastTag());
  }
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
    const result = this.getString();
    this.lines = [];
    return result;
  }

  private getString(): string {
    switch (this.lines.length) {
      case 0:
        throw new Error("Nothing to flush.");
      case 1:
        return this.lines[0];
    }
    return this.lines
      .map((l) => this.prefix + l)
      .join(this.glue);
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

  async save(builder: MessageBuilder): Promise<void> {
    const lines = builder.lines;
    if (lines.length === 0) {
      await remove(this.file);
    } else {
      await writeTextFile(this.file, JSON.stringify(lines));
    }
  }

  private loadLines = async (): Promise<string[]> => {
    try {
      return JSON.parse(await readTextFile(this.file)) as string[];
    } catch (e) {
      return [];
    }
  };
}

export namespace History {
  export type Branch = string;
  export type Dir = string;
  export type Item = [Branch, Dir];
  export type Items = Item[];

  export class RepoFactory {
    static create(): Repo {
      const path = load<{ path: string }>("git.history").path;
      return new Repo(
        new GitClient(),
        new JsonFile<Items>(path, []),
      );
    }
  }

  export class Repo {
    constructor(
      private git: GitClient,
      private config: JsonFile<Items>,
      private size = 50,
    ) {
    }

    async push(branch: Branch, dir: Dir): Promise<void> {
      const item: Item = [
        (branch || await this.git.getCurrentBranch()) as Branch,
        dir || Deno.cwd(),
      ];
      if (!branch || branch === "-") {
        return;
      }
      this.config.map((history) => [
        ...history
          .filter((it) => it.some((itemPart, i) => itemPart != item[i]))
          .slice(-this.size),
        item,
      ]);
    }

    list(): Items {
      return this.config.load();
    }
  }
}
