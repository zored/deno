const { exit } = Deno;
import { bold, red } from "https://deno.land/std@0.52.0/fmt/colors.ts";

export class DepChecker {
  async byPaths(path: string, rulesPath = "dep-check.json"): Promise<void> {
    if (!path) {
      console.error(`Specify path.`);
      return;
    }

    const deps = await new DepFactory().allByPath(
      path,
      path.replace(/\/[^/]+$/, ""),
    );
    const depsByDest = new DepGroup().byDestination(deps);
    const checker = await RuleChecker.fromPath(rulesPath);
    const errorMessage = checker.check(depsByDest, deps);
    if (errorMessage.length === 0) {
      return;
    }

    console.log(errorMessage);
    exit(1);
  }
}

type Package = string;

type LayerConfig = string | string[];
type LayersName = string;

interface Rules {
  layers: Record<LayersName, LayerConfig[]>;
}

class Layer {
  private readonly patterns: RegExp[];
  private readonly name: string;

  constructor(private layerOrLayers: LayerConfig) {
    const layers: string[] = [];
    if (typeof layerOrLayers == "string") {
      layers.push(layerOrLayers);
    } else {
      layers.push(...layerOrLayers);
    }

    this.patterns = layers.map((s) => new RegExp(s + ".*"));
    this.name = layers.join(" or ");
  }

  test(pkg: string): boolean {
    return this.patterns.some((pattern) => pattern.test(pkg));
  }

  toString() {
    return this.name;
  }
}

type DependsOnChild = boolean;
type LayerIndex = number;
type TailLayerIndex = number;

class RuleChecker {
  private readonly layers: [LayersName, Layer[]][] = [];

  constructor(private rules: Rules) {
    Object.entries(rules.layers).forEach(
      ([name, layers]) =>
        this.layers.push([name, layers.map((layer) => new Layer(layer))]),
    );
  }

  check(depsByDest: Dep[], deps: Dep[]): string {
    return this.layers
      .map(([name, layers]) => this.checkLayers(name, layers, depsByDest, deps))
      .join("\n\n").trim();
  }

  private checkLayers(
    layerName: string,
    layers: Layer[],
    depsByDest: Dep[],
    fileDeps: Dep[],
  ): string {
    const depth = 1;
    const innerLayers = layers.slice(depth);
    const failures: [Dep, Layer[]][] = depsByDest
      .map((
        dep,
      ): [Dep, TailLayerIndex] => [
        dep,
        innerLayers.findIndex((layer) => layer.test(dep.destination)),
      ])
      .filter(([, index]) => index > -1)
      .map(([dep, index]): [Dep, [DependsOnChild, LayerIndex][]] => [
        dep,
        layers
          .slice(0, index + depth)
          .map((layer, layerIndex) => [
            dep.sources.some((source) => layer.test(source)),
            layerIndex,
          ]),
      ])
      .map(([dep, layerResults]): [Dep, Layer[]] => [
        dep,
        layerResults
          .filter(([dependsOnChild]) => dependsOnChild)
          .map(([, layerIndex]) => layers[layerIndex]),
      ])
      .filter(([, layers]) => layers.length > 0);

    if (failures.length === 0) {
      return "";
    }
    const message = failures
      .flatMap(([dep, layers]) =>
        layers.map((layer): [Dep, Layer, string[]] => [
          dep,
          layer,
          fileDeps
            .filter((fileDep) => fileDep.destination === dep.destination)
            .filter((fileDeps) =>
              fileDeps.sources.some((source) => layer.test(source))
            )
            .map(({ file }) => file)
            .filter((file): file is string => file !== undefined),
        ])
      )
      .map(([dep, layer, files]) =>
        `${bold(dep.toString())} 👈 ${bold(layer.toString())} 🙅‍♂️:\n` +
        files.map((file) => `- ${file}`).join("\n")
      )
      .join("\n\n");

    return `${
      red(`You have layer ${bold(layerName)} dependency flaws 😨\n\n`)
    }${message}`;
  }

  static async fromPath(rulesPath: string): Promise<RuleChecker> {
    const file = await Deno.readFile(rulesPath);
    const text = new TextDecoder("utf8").decode(file);
    const rules = JSON.parse(text);

    return new RuleChecker(rules);
  }
}

class DepGroup {
  byDestination(deps: Deps): Deps {
    const byDestination: Record<string, Dep> = {};

    deps.forEach(({ destination, sources }) => {
      const dep = byDestination[destination] ?? new Dep(destination, []);
      dep.sources.push(...sources);
      byDestination[destination] = dep;
    });

    return Object.values(byDestination);
  }
}

export class DepFactory {
  private readonly decoder = new TextDecoder("utf-8");

  async allByPath(path: string, root: string = path): Promise<Deps> {
    const deps: Deps = [];
    for await (const { name, isFile, isDirectory } of Deno.readDir(path)) {
      if (isFile) {
        const byFile = await this.byFile(path, name, root);
        if (byFile !== null) {
          deps.push(byFile);
        }
      }

      if (isDirectory) {
        const allByPath = await this.allByPath(`${path}/${name}`, root);
        deps.push(...allByPath);
      }
    }
    return deps;
  }

  private async byFile(
    dir: string,
    name: string,
    root: string,
  ): Promise<Dep | null> {
    const matches = name.match(/.(go|kt)$/);
    if (!matches) {
      return null;
    }
    const fileExtension = matches[1];

    const sourceRetrievers: Record<string, (text: string) => string[]> = {
      go: (text: string): string[] => this
        .match(text, /import\s+\(?([\s\S]+)?\)?;/gm)
        .flatMap(m => this.match(m, /"(.*?)"/gm)),
      kt: (text: string): string[] => this.match(text, /import\s+(.*?)[\s|;]/gm),
    };

    const getSources = sourceRetrievers[fileExtension];
    if (!getSources) {
      return null;
    }

    const filePath = `${dir}/${name}`;
    const bytes = await Deno.readFile(filePath);
    const text = this.decoder.decode(bytes);
    const destination = dir.replace(`${root}/`, "");
    return new Dep(destination, getSources(text), name);
  }

  private match(text: string, pattern: RegExp): string[] {
    return [...text.matchAll(pattern)].map(([, source]) => source);
  }
}

export class Dep {
  constructor(
    public destination: Package,
    public sources: Package[],
    public file?: string,
  ) {
  }

  toString() {
    return this.destination;
  }
}

type Deps = Dep[];
