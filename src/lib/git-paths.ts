export interface Dirs extends Record<string, Dirs | null> {}

const { readDirSync } = Deno;
interface IFileSystem {
  getDirs(root: string): Dirs;
  // isGit(dir: string): boolean;
}

type Name = string;

interface DirInfo {
  dir: boolean;
  name: Name;
}

type Path = string;

class FileSystem implements IFileSystem {
  private cache: Record<Path, DirInfo[]> = {};

  getDirs = (root: string): Dirs =>
    this.read(root)
      .reduce((dirs, file) => {
        const path = `${root}/${file.name}`;
        dirs[file.name] = (file.dir && !this.isGit(path))
          ? this.getDirs(path)
          : null;
        return dirs;
      }, {} as Dirs);

  private isGit = (dir: Path): boolean =>
    this.read(dir).some(({ dir, name }) => dir && name === ".git");

  private read = (dir: Path): DirInfo[] =>
    this.cache[dir] = this.cache[dir] ??
      Array.from(readDirSync(dir)).map(({ isDirectory, name }) => ({
        dir: isDirectory,
        name,
      }));
}

export class GitPaths {
  private readonly matcher = new Matcher();
  constructor(
    private readonly root: string,
    private readonly fs: IFileSystem = new FileSystem(),
  ) {
    this.root = this.root.replace(/\/$/, "");
  }

  getPathByUrl = (url: string): string | undefined => {
    const parts = this.matcher.matchUrl(url);
    if (!parts) {
      return undefined;
    }
    const { domain, project, path } = parts;
    return `${this.root}/${domain}/${project}/${path}`;
  };

  getOriginByPath = (inputPath: string, ssh: boolean): string | undefined => {
    if (inputPath.indexOf(this.root) !== 0) {
      return undefined;
    }
    const parts = this.matcher.matchPath(inputPath.substring(this.root.length));
    if (!parts) {
      return undefined;
    }
    const { domain, project, path } = parts;
    return ssh
      ? `git@${domain}:${project}/${path}.git`
      : `https://${domain}/${project}/${path}`;
  };

  getOptions = (query: string) =>
    DirsMethods.getLeafs(
      this.fs.getDirs(this.root),
      this.root,
      (name: Name) => name.toLowerCase().indexOf(query.toLowerCase()) === 0,
    );
}

class DirsMethods {
  static getLeafs = (
    dirs: Dirs,
    prefix: string,
    filter = (name: Name) => true,
  ): Name[] =>
    Object.entries(dirs).flatMap(([name, child]) => {
      const path = (name: Name) => `${prefix}/${name}`;
      return child === null
        ? [name].filter(filter).map(path)
        : DirsMethods.getLeafs(child, path(name), filter);
    });
}

class Matcher {
  matchUrl = (url: string) =>
    url.match(
      /^(?<schema>https?:\/\/|git@)?(?<domain>.*?)(\/|:)(?<project>.*?)\/(?<path>.*?)(.git)?($|\?|\#)/,
    )?.groups;
  matchPath = (url: string) =>
    url.match(/^\/(?<domain>.*?)\/(?<project>.*?)\/(?<path>.*?)$/)?.groups;
}
