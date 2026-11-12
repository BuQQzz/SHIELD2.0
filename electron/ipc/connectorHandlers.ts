import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import {
  CONNECTOR_CATALOG,
  type ManualConnectorInput,
} from "../../src/config/connectors.js";
import { ConnectorService } from "../services/connectors/ConnectorService.js";
import { ConnectorStore } from "../services/connectors/ConnectorStore.js";
import { systemCipher } from "./providerHandlers.js";

let service: ConnectorService | null = null;

/** The connectors, once registerConnectorHandlers has run */
export function getConnectorService(): ConnectorService | null {
  return service;
}

const failure = (error: unknown) => ({
  success: false as const,
  error: error instanceof Error ? error.message : "Unknown error",
});

/**
 * The Plugins page's connectors (src/config/connectors.ts). Every change is
 * pushed to the windows as "connectors:changed", so the page and the model's
 * tool list follow without polling.
 */
export function registerConnectorHandlers(): ConnectorService {
  const store = new ConnectorStore(
    path.join(app.getPath("userData"), "connectors.json"),
    systemCipher
  );
  service = new ConnectorService(store, {
    openExternal: (url) => void shell.openExternal(url),
    onChange: () => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("connectors:changed");
      }
    },
  });
  const connectors = service;

  ipcMain.handle("connectors:catalog", () => ({
    success: true,
    catalog: CONNECTOR_CATALOG,
    canSaveSecrets: store.canPersistSecrets(),
  }));

  ipcMain.handle("connectors:list", () => ({
    success: true,
    connectors: connectors.summaries(),
  }));

  ipcMain.handle(
    "connectors:add-catalog",
    async (_event, catalogId: unknown, token: unknown) => {
      try {
        if (typeof catalogId !== "string") throw new Error("Bad request");
        const connector = await connectors.addFromCatalog(
          catalogId,
          typeof token === "string" ? token : undefined
        );
        return { success: true, connector };
      } catch (error) {
        return failure(error);
      }
    }
  );

  ipcMain.handle("connectors:add-manual", async (_event, input: unknown) => {
    try {
      return {
        success: true,
        connector: await connectors.addManual(validManual(input)),
      };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle("connectors:connect", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string") throw new Error("Bad request");
      await connectors.connect(id, true);
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(
    "connectors:set-enabled",
    async (_event, id: unknown, enabled: unknown) => {
      if (typeof id !== "string" || typeof enabled !== "boolean") {
        return failure(new Error("Bad request"));
      }
      await connectors.setEnabled(id, enabled);
      return { success: true };
    }
  );

  ipcMain.handle(
    "connectors:set-tool-enabled",
    (_event, id: unknown, tool: unknown, enabled: unknown) => {
      if (
        typeof id !== "string" ||
        typeof tool !== "string" ||
        typeof enabled !== "boolean"
      ) {
        return failure(new Error("Bad request"));
      }
      connectors.setToolEnabled(id, tool, enabled);
      return { success: true };
    }
  );

  ipcMain.handle("connectors:sign-out", async (_event, id: unknown) => {
    if (typeof id !== "string") return failure(new Error("Bad request"));
    await connectors.signOut(id);
    return { success: true };
  });

  ipcMain.handle("connectors:remove", async (_event, id: unknown) => {
    if (typeof id !== "string") return failure(new Error("Bad request"));
    await connectors.remove(id);
    return { success: true };
  });

  return connectors;
}

function validManual(input: unknown): ManualConnectorInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  if (value.kind === "remote") {
    return {
      kind: "remote",
      name: text(value.name),
      url: text(value.url),
      token: text(value.token) || undefined,
    };
  }
  if (value.kind === "local") {
    const args = Array.isArray(value.args) ? value.args.map(text) : [];
    const env =
      value.env && typeof value.env === "object"
        ? Object.fromEntries(
            Object.entries(value.env as Record<string, unknown>).map(
              ([k, v]) => [k, text(v)]
            )
          )
        : {};
    return {
      kind: "local",
      name: text(value.name),
      command: text(value.command),
      args,
      env,
    };
  }
  throw new Error("Bad request");
}
