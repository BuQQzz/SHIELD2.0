import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamToggle } from "./TeamToggle";
import { useConversationStore } from "@/stores/conversation-store";
import type { Conversation } from "@/types/conversation";

const session = (extra: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  title: "t",
  createdAt: new Date(),
  updatedAt: new Date(),
  messages: [],
  kind: "code",
  ...extra,
});

const current = () => useConversationStore.getState().currentConversation;

describe("TeamToggle", () => {
  beforeEach(() => {
    useConversationStore.setState({ currentConversation: session() });
  });

  it("turns Team on and off for a model that can run it", () => {
    render(<TeamToggle />);
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    expect(current()?.team).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    expect(current()?.team).toBe(false);
  });

  it("does nothing for a model whose runtime cannot run a team", () => {
    render(
      <TeamToggle
        availability={{ state: "unavailable", reason: "no llama-server" }}
        modelId="gemma"
      />
    );
    const button = screen.getByRole("button", { name: /Team/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(current()?.team).toBeFalsy();
    expect(button.getAttribute("title")).toContain("no llama-server");
  });

  it("shows Team off for a poor model even if the session had it on", () => {
    useConversationStore.setState({
      currentConversation: session({ team: true }),
    });
    render(
      <TeamToggle
        availability={{ state: "caution", note: "It gave up." }}
        modelId="bonsai-8b"
        modelName="Bonsai 8B"
      />
    );
    expect(
      screen.getByRole("button", { name: /Team/ }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("asks first for a poor model, and turns it on anyway when told to", () => {
    render(
      <TeamToggle
        availability={{ state: "caution", note: "It gave up." }}
        modelId="bonsai-8b"
        modelName="Bonsai 8B"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    expect(current()?.team).toBeFalsy();
    expect(screen.getByText(/not suited to Bonsai 8B/)).toBeTruthy();
    expect(screen.getByText(/It gave up\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Turn on anyway" }));
    expect(current()?.team).toBe(true);
    expect(current()?.teamOverride).toBe("bonsai-8b");
  });

  it("does not ask again for a model the user already accepted", () => {
    useConversationStore.setState({
      currentConversation: session({ teamOverride: "bonsai-8b" }),
    });
    render(
      <TeamToggle
        availability={{ state: "caution", note: "It gave up." }}
        modelId="bonsai-8b"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    expect(current()?.team).toBe(true);
  });

  it("leaves Team off when the user cancels the caution", () => {
    render(
      <TeamToggle
        availability={{ state: "caution", note: "It gave up." }}
        modelId="bonsai-8b"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Team/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(current()?.team).toBeFalsy();
  });
});
