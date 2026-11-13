// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KeyCipher } from "../ProviderStore";
import { ConnectorStore } from "./ConnectorStore";
import { ConnectorService } from "./ConnectorService";
import { ConnectorOAuth, redirectUrlFor, startLoopback } from "./oauth";

/** Reversible and unlike the plain text: enough to test the store */
function fakeCipher(available = true): KeyCipher {
  return {
    isAvailable: () => available,
    encrypt: (plain) =>
      Buffer.from(`enc(${Buffer.from(plain).toString("hex")})`),
    decrypt: (data) =>
      Buffer.from(data.toString().slice(4, -1), "hex").toString(),
  };
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-connectors-"));
  file = path.join(dir, "connectors.json");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const remote = {
  id: "notion",
  name: "Notion",
  enabled: true,
  disabledTools: [],
  catalogId: "notion",
  kind: "remote" as const,
  url: "https://mcp.notion.com/mcp",
  auth: "oauth" as const,
};

describe("ConnectorStore", () => {
  it("keeps connectors, and their secrets only encrypted", () => {
    const store = new ConnectorStore(file, fakeCipher());
    store.put(remote);
    store.updateSecrets("notion", (s) => {
      s.token = "secret-token-123";
    });

    const written = fs.readFileSync(file, "utf8");
    expect(written).not.toContain("secret-token-123");

    const again = new ConnectorStore(file, fakeCipher());
    expect(again.list()).toEqual([remote]);
    expect(again.getSecrets("notion").token).toBe("secret-token-123");
  });

  it("never writes secrets where it cannot encrypt", () => {
    const store = new ConnectorStore(file, fakeCipher(false));
    store.put(remote);
    store.updateSecrets("notion", (s) => {
      s.token = "secret-token-123";
    });
    expect(store.getSecrets("notion").token).toBe("secret-token-123");
    expect(fs.readFileSync(file, "utf8")).not.toContain("secret");

    const again = new ConnectorStore(file, fakeCipher(false));
    expect(again.list()).toHaveLength(1);
    expect(again.getSecrets("notion")).toEqual({});
  });

  it("forgets a removed connector's secrets", () => {
    const store = new ConnectorStore(file, fakeCipher());
    store.put(remote);
    store.updateSecrets("notion", (s) => {
      s.token = "t";
    });
    store.remove("notion");
    expect(store.list()).toEqual([]);
    expect(store.getSecrets("notion")).toEqual({});
  });
});

describe("ConnectorOAuth", () => {
  it("drops a registration made for another loopback port", () => {
    const store = new ConnectorStore(file, fakeCipher());
    store.put(remote);
    const first = new ConnectorOAuth("notion", store, 40001, null);
    first.saveClientInformation({
      client_id: "abc",
      redirect_uris: [redirectUrlFor(40001)],
    } as never);

    expect(first.clientInformation()).toMatchObject({ client_id: "abc" });
    expect(store.getSecrets("notion").oauth?.redirectPort).toBe(40001);
    expect(
      new ConnectorOAuth("notion", store, 40002, null).clientInformation()
    ).toBeUndefined();
  });

  it("does not open a browser when no one is there to sign in", () => {
    const store = new ConnectorStore(file, fakeCipher());
    const opened: string[] = [];
    new ConnectorOAuth("notion", store, 1, null).redirectToAuthorization(
      new URL("https://example.com/authorize")
    );
    new ConnectorOAuth("notion", store, 1, (u) =>
      opened.push(u)
    ).redirectToAuthorization(new URL("javascript:alert(1)"));
    expect(opened).toEqual([]);
  });
});

describe("the sign-in listener", () => {
  it("hands over the code that comes back with this sign-in's state", async () => {
    const loopback = await startLoopback();
    try {
      const code = loopback.waitForCode(() => "state-1", 5000);
      const other = await fetch(
        `http://127.0.0.1:${loopback.port}/callback?code=wrong&state=other`
      );
      expect(other.status).toBe(200);
      await fetch(
        `http://127.0.0.1:${loopback.port}/callback?code=the-code&state=state-1`
      );
      await expect(code).resolves.toBe("the-code");
    } finally {
      loopback.close();
    }
  });

  it("reports a refused sign-in", async () => {
    const loopback = await startLoopback();
    try {
      const refused = expect(
        loopback.waitForCode(() => "s", 5000)
      ).rejects.toThrow(/access_denied/);
      await fetch(
        `http://127.0.0.1:${loopback.port}/callback?error=access_denied&state=s`
      );
      await refused;
    } finally {
      loopback.close();
    }
  });
});

describe("a sign-in in progress", () => {
  it("ends when the listener closes", async () => {
    const loopback = await startLoopback();
    const waiting = expect(
      loopback.waitForCode(() => "s", 60_000)
    ).rejects.toThrow(/cancelled/);
    loopback.close();
    await waiting;
  });
});

describe("ConnectorService with a server on this PC", () => {
  const server = path.resolve(
    "node_modules/@modelcontextprotocol/server-filesystem/dist/index.js"
  );

  it("starts it, offers its tools by prefix, runs a call and honours switched-off tools", async () => {
    fs.writeFileSync(path.join(dir, "hello.txt"), "hi from the test");
    const store = new ConnectorStore(file, fakeCipher());
    let changes = 0;
    const service = new ConnectorService(store, {
      openExternal: () => {
        throw new Error("no browser in this test");
      },
      onChange: () => changes++,
    });
    try {
      const added = await service.addManual({
        kind: "local",
        name: "Files",
        command: process.execPath,
        args: [server, dir],
        env: { SOME_KEY: "value" },
      });
      expect(added.state).toBe("connected");
      expect(added.envNames).toEqual(["SOME_KEY"]);
      expect(changes).toBeGreaterThan(0);
      expect(service.connectedIds()).toEqual(["files"]);

      const tools = service.listTools("files");
      const read = tools.find((t) => t.name === "files__read_text_file");
      expect(read?.description).toMatch(/^\[Files\] /);
      // Added by hand: its read-only claims are not trusted
      expect(tools.every((t) => !t.annotations)).toBe(true);

      const result = await service.callTool("files", "read_text_file", {
        path: path.join(dir, "hello.txt"),
      });
      expect(result.success).toBe(true);
      expect(JSON.stringify(result.data)).toContain("hi from the test");

      service.setToolEnabled("files", "read_text_file", false);
      expect(
        service
          .listTools("files")
          .some((t) => t.name === "files__read_text_file")
      ).toBe(false);
      const refused = await service.callTool("files", "read_text_file", {
        path: path.join(dir, "hello.txt"),
      });
      expect(refused.success).toBe(false);

      await service.setEnabled("files", false);
      expect(service.connectedIds()).toEqual([]);
      expect(service.summaries()[0]?.state).toBe("off");
    } finally {
      await service.shutdown();
    }
  }, 30_000);

  it("reports a command that does not start", async () => {
    const store = new ConnectorStore(file, fakeCipher());
    const service = new ConnectorService(store, {
      openExternal: () => {},
      onChange: () => {},
    });
    const added = await service.addManual({
      kind: "local",
      name: "Broken",
      command: path.join(dir, "no-such-program"),
      args: [],
      env: {},
    });
    expect(added.state).toBe("error");
    expect(added.error).toBeTruthy();
    await service.shutdown();
  });

  it("refuses plain http to another computer, and credentials in the address", async () => {
    const service = new ConnectorService(
      new ConnectorStore(file, fakeCipher()),
      {
        openExternal: () => {},
        onChange: () => {},
      }
    );
    await expect(
      service.addManual({
        kind: "remote",
        name: "x",
        url: "http://example.com/mcp",
      })
    ).rejects.toThrow(/https/);
    await expect(
      service.addManual({
        kind: "remote",
        name: "x",
        url: "https://u:p@example.com/mcp",
      })
    ).rejects.toThrow(/token/);
  });
});
