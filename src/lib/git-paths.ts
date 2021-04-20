export interface Dirs extends Record<string, Dirs | null> {
}

const { readDirSync } = Deno;

interface IFileSystem {
  getDirs(root: string, maxDepth: number): Dirs;

  // isGit(dir: string): boolean;
}

type Name = string;

interface DirInfo {
  dir: boolean;
  symlink: boolean;
  name: Name;
}

const maxDepth = 4;

type Path = string;

class FileSystem implements IFileSystem {
  private cache: Record<Path, DirInfo[]> = {};

  getDirs = (root: string, maxDepth: number): Dirs =>
    this.read(root)
      .reduce((dirs, { name, dir, symlink }) => {
        if (!dir) {
          return dirs;
        }

        const path = `${root}/${name}`;

        dirs[name] = this.isGit(path) ? null : this.getDirs(path, maxDepth);
        return dirs;
      }, {} as Dirs);

  private isGit = (dir: Path): boolean =>
    this.read(dir).some(({ dir, name }) => dir && name === ".git");

  private read = (dir: Path): DirInfo[] =>
    this.cache[dir] = this.cache[dir] ??
      Array.from(readDirSync(dir)).map(({ isDirectory, isSymlink, name }) => ({
        dir: isDirectory,
        symlink: isSymlink,
        name,
      }));
}

const log = <T>(a: T): T => {
  console.log(a);
  return a;
};

export class GitPaths {
  private readonly matcher = new Matcher();

  constructor(
    private readonly root: string,
    private readonly fs: IFileSystem = new FileSystem(),
  ) {
    this.root = this.root.replace(/\/$/, "");
  }

  getPathByUrl(url: string): string | undefined {
    const parts = this.matcher.matchUrl(url);
    if (!parts) {
      return undefined;
    }
    const { domain, project, path } = parts;
    return `${this.root}/${domain}/${project}/${path}`;
  }

  getOriginByPath(inputPath: string, ssh: boolean): string | undefined {
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
  }

  getOptions(query: string) {
    return DirsMethods.getLeafs(
      this.fs.getDirs(this.root, maxDepth),
      this.root,
      (name: Name) => name.toLowerCase().indexOf(query.toLowerCase()) > -1,
    );
  }
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
