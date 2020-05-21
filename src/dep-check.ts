#!/usr/bin/env -S deno run --allow-read
import {bold, red} from "https://deno.land/std@0.52.0/fmt/colors.ts"

async function main() {
    const [path, rulesPath] = Deno.args
    if (!path) {
        console.error(`Specify path.`)
        return
    }

    const deps = await new DepFactory().allByPath(path, path.replace(/\/[^/]+$/, ''))
    const depsByDest = new DepGroup().byDestination(deps)
    const checker = await RuleChecker.fromPath(rulesPath)
    if (checker.check(depsByDest, deps)) {
        return
    }

    Deno.exit(1)
}

type Package = string

type LayerConfig = string | string[]

interface Rules {
    layers: LayerConfig[],
}

class Layer {
    private readonly patterns: RegExp[]
    private readonly name: string

    constructor(private layerOrLayers: LayerConfig) {
        const layers: string[] = []
        if (typeof layerOrLayers == 'string') {
            layers.push(layerOrLayers)
        } else {
            layers.push(...layerOrLayers)
        }

        this.patterns = layers.map(s => new RegExp(s + '.*'))
        this.name = layers.join(' or ')
    }

    test(pkg: string): boolean {
        return this.patterns.some(pattern => pattern.test(pkg))
    }

    toString() {
        return this.name
    }
}

class RuleChecker {
    private layers: Layer[]

    constructor(private rules: Rules) {
        this.layers = rules.layers.map(layer => new Layer(layer))
    }

    check(depsByDest: Dep[], deps: Dep[]): boolean {
        return this.checkLayers(depsByDest, deps)
    }

    private checkLayers(depsByDest: Dep[], fileDeps: Dep[]): boolean {
        const depth = 1
        const innerLayers = this.layers.slice(depth)
        const failures: [Dep, Layer][] = depsByDest
            .map((dep): [Dep, number] => [dep, innerLayers.findIndex(layer => layer.test(dep.destination))])
            .filter(([, index]) => index > -1)
            .map(([dep, index]): [Dep, Layer | undefined] => [dep, this.layers
                .slice(0, index + depth)
                .find(layer => dep.sources.some(source => layer.test(source)))
            ])
            .filter((a): a is [Dep, Layer] => a[1] !== undefined)

        if (failures.length === 0) {
            return true
        }
        const message = failures
            .map(([dep, layer]): [Dep, Layer, string[]] => [dep, layer, fileDeps
                .filter(fileDep => fileDep.destination === dep.destination)
                .filter(fileDeps => fileDeps.sources.some(source => layer.test(source)))
                .map(({file}) => file)
                .filter((file): file is string => file !== undefined)])
            .map(([dep, layer, files]) =>
                `${bold(dep.toString())} 👈 ${bold(layer.toString())} 🙅‍♂️:\n` + files.map(file => `- ${file}`).join('\n')
            )
            .join('\n\n')

        console.log(`${red(`You have package dependency flaws 😨\n\n`)}${message}`)
        return false
    }

    static async fromPath(rulesPath: string): Promise<RuleChecker> {
        const file = await Deno.readFile(rulesPath)
        const text = new TextDecoder("utf8").decode(file)
        const rules = JSON.parse(text)

        return new RuleChecker(rules)
    }
}

class DepGroup {
    byDestination(deps: Deps): Deps {
        const byDestination: Record<string, Dep> = {}

        deps.forEach(({destination, sources}) => {
            const dep = byDestination[destination] ?? new Dep(destination, [])
            dep.sources.push(...sources)
            byDestination[destination] = dep
        })

        return Object.values(byDestination)
    }
}

class DepFactory {
    private readonly decoder = new TextDecoder("utf-8")

    async allByPath(path: string, root: string = path): Promise<Deps> {
        const deps: Deps = []
        for await (const {name, isFile, isDirectory} of Deno.readDir(path)) {
            if (isFile) {
                const byFile = await this.byFile(path, name, root)
                if (byFile !== null) {
                    deps.push(byFile)
                }
            }

            if (isDirectory) {
                const allByPath = await this.allByPath(`${path}/${name}`, root)
                deps.push(...allByPath)
            }
        }
        return deps
    }

    private async byFile(dir: string, name: string, root: string): Promise<Dep | null> {
        if (!name.match(/.go$/)) {
            return null
        }

        const filePath = `${dir}/${name}`
        const bytes = await Deno.readFile(filePath)
        const text = this.decoder.decode(bytes)
        const destination = dir.replace(`${root}/`, '')
        const fromFlat = this.match(text, /import\s+"(.*?)"/gm)
        const fromGroups = this.match(text, /import\s+\(([\s\S]*?)\)/gm)
            .flatMap(group => this.match(group, /"(.*?)"/gm))

        return new Dep(destination, fromFlat.concat(fromGroups), name)
    }

    private match(text: string, pattern: RegExp): string[] {
        return [...text.matchAll(pattern)].map(([, source]) => source)
    }
}

class Dep {
    constructor(public destination: Package, public sources: Package[], public file?: string) {
    }

    toString() {
        return this.destination
    }

}

type Deps = Dep[]

await main()