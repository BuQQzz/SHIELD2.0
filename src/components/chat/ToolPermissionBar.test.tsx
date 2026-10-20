import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToolPermissionBar } from "./ToolPermissionBar";
import { trashName } from "@/utils/platform";

const base = {
  serverName: "filesystem",
  arguments: {},
  isMutating: true,
};

describe("ToolPermissionBar", () => {
  it("asks plainly before a delete and never offers Allow for session", () => {
    render(
      <ToolPermissionBar
        request={{
          ...base,
          toolName: "delete_file",
          targetPath: "C:/p/awsome sauce.md",
          isDestructive: true,
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(
      screen.getAllByText(`Move to ${trashName()}`).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/awsome sauce\.md/)).toBeTruthy();
    expect(screen.queryByText("Allow for session")).toBeNull();
  });

  it("shows a command in full and asks for it alone", () => {
    render(
      <ToolPermissionBar
        request={{
          ...base,
          serverName: "terminal",
          toolName: "run_command",
          arguments: { command: "npm test -- --run" },
          command: "npm test -- --run",
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(screen.getByText("Run this command?")).toBeTruthy();
    expect(screen.getByText("npm test -- --run")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.queryByText("Allow for session")).toBeNull();
  });

  it("shows the model's reason, and a script it wrote on request", () => {
    render(
      <ToolPermissionBar
        request={{
          ...base,
          serverName: "terminal",
          toolName: "run_command",
          arguments: {},
          command: "pwsh -File integration-test.ps1",
          commandReason: "Runs the integration test",
          modelScripts: [
            { path: "integration-test.ps1", content: ". .\\set-radio.ps1" },
          ],
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(screen.getByText("Runs the integration test")).toBeTruthy();
    expect(
      screen.getByText(
        "Runs integration-test.ps1, which the model wrote in this session."
      )
    ).toBeTruthy();
    expect(screen.queryByText(". .\\set-radio.ps1")).toBeNull();
    fireEvent.click(screen.getByText("Show script"));
    expect(screen.getByText(". .\\set-radio.ps1")).toBeTruthy();
  });

  it("shows a change to AGENTS.md on request, asked on its own", () => {
    render(
      <ToolPermissionBar
        request={{
          ...base,
          toolName: "write_file",
          targetPath: "AGENTS.md",
          previewContent: "# Repository Guidelines",
          instructionsFile: true,
          proposed: "# Repository Guidelines",
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(screen.getByText("Write AGENTS.md?")).toBeTruthy();
    expect(screen.queryByText("Allow for session")).toBeNull();
    expect(screen.queryByText("# Repository Guidelines")).toBeNull();
    fireEvent.click(screen.getByText("Show the new text"));
    expect(screen.getByText("# Repository Guidelines")).toBeTruthy();
  });

  it("shows where a move goes", () => {
    render(
      <ToolPermissionBar
        request={{
          ...base,
          toolName: "move_file",
          targetPath: "C:/p/awsome sauce.md",
          destinationPath: "C:/p/trash_file.md",
        }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(screen.getByText(/trash_file\.md/)).toBeTruthy();
    expect(screen.getByText("Allow for session")).toBeTruthy();
  });
});
