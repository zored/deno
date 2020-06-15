import { ProxyRunner } from "./ProxyRunner.ts";
import { ISSHProxy } from "./ProxyHandler/SSHHandler.ts";
import { assertEquals } from "../../../deps.ts";
import { IDockerProxy } from "./ProxyHandler/DockerHandler.ts";
import { IMongoProxy } from "./ProxyHandler/MongoHandler.ts";

const { test } = Deno;

test("test eval", async () => {
  const runner = new ProxyRunner(
    {
      "some/namespace/sample": [
        {
          type: "ssh",
          alias: "kek",
        } as ISSHProxy,
        {
          type: "docker",
          image: "some:1.2.3",
          flags: {
            "custom": "flag",
          },
        } as IDockerProxy,
        {
          type: "mongo",
          slave: true,
          uri: "mongo://example",
        } as IMongoProxy,
      ],
    },
    false,
    [],
  );

  const result = await runner.run(
    "sample",
    ["db.people", ".find()"],
    "some/namespace",
    true,
    {},
    true,
  );

  assertEquals(
    [
      "ssh -t kek",
      "sudo docker run -it --net=host --rm some:1.2.3 --custom flag",
      "mongo mongo://example --quiet '--eval' 'rs.slaveOk(); db.people .find()'",
    ].join(" "),
    result.join(" "),
  );
});
