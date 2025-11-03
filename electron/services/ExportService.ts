import { dialog } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import type { Conversation } from "../../src/types/electron";

export class ExportService {
  /**
   * Export conversation as JSON
   */
  static async exportAsJSON(conversation: Conversation): Promise<boolean> {
    try {
      const result = await dialog.showSaveDialog({
        title: "Export Conversation as JSON",
        defaultPath: `${conversation.title.replace(/[^a-z0-9]/gi, "_")}.json`,
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return false;
      }

      const exportData = {
        ...conversation,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      await fs.writeFile(
        result.filePath,
        JSON.stringify(exportData, null, 2),
        "utf-8"
      );

      return true;
    } catch (error) {
      console.error("[ExportService] Failed to export as JSON:", error);
      return false;
    }
  }

  /**
   * Export conversation as Markdown
   */
  static async exportAsMarkdown(conversation: Conversation): Promise<boolean> {
    try {
      const result = await dialog.showSaveDialog({
        title: "Export Conversation as Markdown",
        defaultPath: `${conversation.title.replace(/[^a-z0-9]/gi, "_")}.md`,
        filters: [{ name: "Markdown Files", extensions: ["md"] }],
      });

      if (result.canceled || !result.filePath) {
        return false;
      }

      const markdown = this.convertToMarkdown(conversation);
      await fs.writeFile(result.filePath, markdown, "utf-8");

      return true;
    } catch (error) {
      console.error("[ExportService] Failed to export as Markdown:", error);
      return false;
    }
  }

  /**
   * Convert conversation to Markdown format
   */
  private static convertToMarkdown(conversation: Conversation): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${conversation.title}`);
    lines.push("");
    lines.push(`**Created:** ${new Date(conversation.createdAt).toLocaleString()}`);
    lines.push(`**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}`);
    lines.push(`**Model:** ${conversation.modelId || "Unknown"}`);
    lines.push(`**Messages:** ${conversation.messages.length}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    // Messages
    for (const message of conversation.messages) {
      const role = message.role === "user" ? "🧑 User" : "🤖 Assistant";
      const timestamp = new Date(message.timestamp).toLocaleString();

      lines.push(`## ${role}`);
      lines.push(`*${timestamp}*`);
      lines.push("");
      lines.push(message.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    // Footer
    lines.push("");
    lines.push("---");
    lines.push(`*Exported from SHIELD 2.0 on ${new Date().toLocaleString()}*`);

    return lines.join("\n");
  }

  /**
   * Import conversation from JSON file
   */
  static async importFromJSON(): Promise<Conversation | null> {
    try {
      const result = await dialog.showOpenDialog({
        title: "Import Conversation from JSON",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (result.canceled || !result.filePaths.length) {
        return null;
      }

      const fileContent = await fs.readFile(result.filePaths[0], "utf-8");
      const data = JSON.parse(fileContent);

      // Validate conversation structure
      if (!this.isValidConversation(data)) {
        throw new Error("Invalid conversation format");
      }

      // Remove export metadata if present
      const { exportedAt, version, ...conversation } = data;

      return conversation as Conversation;
    } catch (error) {
      console.error("[ExportService] Failed to import from JSON:", error);
      return null;
    }
  }

  /**
   * Validate conversation structure
   */
  private static isValidConversation(data: any): boolean {
    if (!data || typeof data !== "object") return false;
    if (!data.id || !data.title || !Array.isArray(data.messages)) return false;
    if (!data.createdAt || !data.updatedAt) return false;

    // Validate messages
    for (const msg of data.messages) {
      if (!msg.id || !msg.role || !msg.content || !msg.timestamp) {
        return false;
      }
      if (msg.role !== "user" && msg.role !== "assistant") {
        return false;
      }
    }

    return true;
  }
}
