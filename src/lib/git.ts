import { Commands, CommandArgs } from "../../mod.ts";
import { exec, OutputMode, assertEquals } from "../../deps.ts";

interface IGitShell {
  reflogSubjects(): Promise<string>;
}

class GitShell implements IGitShell {
  async reflogSubjects(): Promise<string> {
    return this.run(`git reflog --pretty=%gd%gs --date=iso`);
  }

  private async run(command: string): Promise<string> {
    const response = await exec(command, { output: OutputMode.Capture });
    return response.output;
  }
}

type Ref = string;
interface IReflogSubjects {
  date: Date;
  from: Ref;
  to: Ref;
}

export class GitClient {
  constructor(private git: IGitShell = new GitShell()) {}

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
        line.match(/^HEAD@\{(.+?)\}checkout: moving from (.+) to (.+)$/) || []
      )
      .map(([, date, from, to]): IReflogSubjects => ({
        date: new Date(date),
        from,
        to,
      }))
      .filter(({ from }) => from !== undefined);
  }
}
