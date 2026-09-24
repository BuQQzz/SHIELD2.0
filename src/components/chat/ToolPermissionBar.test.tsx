import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolPermissionBar } from "./ToolPermissionBar";

const base = {
  serverName: "filesystem",
  arguments: {},
  isMutating: true,
};

describe("ToolPermissionBar", () => {
  it("asks plainly before a delete and never offers Allow always", () => {
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
    expect(screen.getAllByText("Move to Recycle Bin").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText(/awsome sauce\.md/)).toBeTruthy();
    expect(screen.queryByText("Allow always")).toBeNull();
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
    expect(screen.getByText("Allow always")).toBeTruthy();
  });
});
