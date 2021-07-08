import { readLines } from "https://deno.land/std@0.97.0/io/bufio.ts";
import { serve } from "./deps.ts";

interface Storage {
  pods: Pods;
  version: number;
  fileVersion: number;
}

type Pods = Record<Name, Pod>;
type Name = string;

type Status = "Running" | "Completed";

interface Pod {
  name: Name;
  readyContainers: number;
  totalContainers: number;
  status: Status;
  restarts: number;
  age: string; // parse?
  ip: string;
  node: string;
  nominatedNode?: string;
  readinessGates?: string;
}

async function main() {
  const storage: Storage = {
    pods: {},
    fileVersion: 0,
    version: 0,
  };
  await Promise.all([
    // periodicPersist(storage),
    handleStorage(storage),
    runServer(storage),
  ]);
}

async function runServer(storage: Storage) {
  for await (const req of serve({ port: 9988 })) {
    await (async () => {
      const { url } = req;
      let status = 200;
      if (url !== "/") {
        status = 404;
      }
      const podRequest = JSON.parse(
        new TextDecoder().decode(await Deno.readAll(req.body)),
      ) as { name?: string[]; notName?: string[]; running?: boolean };
      const filters: ((p: Pod) => boolean)[] = [];

        const nameParts = podRequest.name;
        if (nameParts) {
            filters.push((p) => !nameParts.some((name) => !p.name.includes(name)));
        }
        const notNameParts = podRequest.notName;
        if (notNameParts) {
            filters.push((p) => !notNameParts.some((name) => p.name.includes(name)));
        }
      if (podRequest.running === true) {
        filters.push((p) => p.status === "Running");
      }

      const pods = Object.values(storage.pods).filter((p) =>
        !filters.some((f) => !f(p))
      );
      const body = JSON.stringify({ pods, version: storage.version });
      req.respond({
        headers: new Headers({ "content-type": "text/javascript" }),
        body,
        status,
      });
    })();
  }
}

async function periodicPersist(storage: Storage) {
  if (storage.fileVersion !== storage.version) {
    await Deno.writeTextFile(
      "rob-only-pods.txt",
      Object.values(storage.pods).map((p) => `${p.name}`).join("\n"),
    );
    storage.fileVersion = storage.version;
  }
  setTimeout(() => periodicPersist(storage), 10000);
}

async function handleStorage(storage: Storage) {
  const process = Deno.run({
    cmd: [
      "sh",
      "-c",
      `kubectl get pods --output-watch-events=true --no-headers=true -w -owide`,
    ],
    stdout: "piped",
  });

  type EventType = "ADDED" | "MODIFIED" | "DELETED";

  function parseNone(v: string): string | undefined {
    return v === "<none>" ? undefined : v;
  }

  for await (const line of readLines(process.stdout)) {
    // No line, restart:
    if (!line) {
      process.close()
      handleStorage(storage)
      return
    }

    const [
      eventString,
      name,
      readyString,
      status,
      restartsString,
      age,
      ip,
      node,
      nominatedNodeString,
      readinessGatesString,
    ] = line.split(/\s+/, 10);
    const event = eventString as EventType;
    const [readyContainers, totalContainers] = readyString.split("/", 2).map(
      (v) => parseInt(v)
    ) as [number, number];
    const restarts = parseInt(restartsString);
    const nominatedNode = parseNone(nominatedNodeString);
    const readinessGates = parseNone(readinessGatesString);

    const pod: Pod = {
      name,
      readyContainers,
      totalContainers,
      status: status as Status,
      restarts,
      age,
      ip,
      node,
      nominatedNode,
      readinessGates,
    };

    switch (event) {
      case "DELETED":
        delete storage.pods[name];
        break;
      case "ADDED":
      case "MODIFIED":
        storage.pods[name] = pod;
        break;
      default:
        throw new Error(`Type '${eventString}' is not supported!`);
    }
    storage.version++;
  }
}

await main();
