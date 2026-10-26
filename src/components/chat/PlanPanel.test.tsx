import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlanPanel } from "./PlanPanel";
import type { Plan } from "@/config/plan";

const plan: Plan = {
  steps: [
    { step: "Read cart.js", status: "completed" },
    { step: "Fix the total", status: "in_progress" },
    { step: "Run the tests", status: "pending" },
  ],
  note: "Total was off by tax",
  updatedAt: "2026-09-28T20:00:00.000Z",
  by: "model",
  remarks: { 0: "not confirmed: an edit of cart.js failed" },
};

beforeEach(() => localStorage.clear());

describe("PlanPanel", () => {
  it("shows the steps, progress, note and SHIELD's remarks", () => {
    render(<PlanPanel plan={plan} onChange={() => {}} />);
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(screen.getByText("· 1 not confirmed")).toBeTruthy();
    expect(screen.getByText("Fix the total")).toBeTruthy();
    expect(screen.getByText("Total was off by tax")).toBeTruthy();
    expect(
      screen.getByText("not confirmed: an edit of cart.js failed")
    ).toBeTruthy();
  });

  it("moves a step on when its mark is clicked", () => {
    const onChange = vi.fn();
    render(<PlanPanel plan={plan} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Run the tests: Not started"));
    expect(onChange).toHaveBeenCalledWith([
      plan.steps[0],
      plan.steps[1],
      { step: "Run the tests", status: "in_progress" },
    ]);
  });

  it("rewords, removes and adds steps", () => {
    const onChange = vi.fn();
    render(<PlanPanel plan={plan} onChange={onChange} />);

    fireEvent.click(screen.getByText("Fix the total"));
    const input = screen.getByDisplayValue("Fix the total");
    fireEvent.change(input, { target: { value: "Fix the tax" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith([
      plan.steps[0],
      { step: "Fix the tax", status: "in_progress" },
      plan.steps[2],
    ]);

    fireEvent.click(screen.getByLabelText("Remove Read cart.js"));
    expect(onChange).toHaveBeenLastCalledWith([plan.steps[1], plan.steps[2]]);

    const add = screen.getByPlaceholderText("Add a step");
    fireEvent.change(add, { target: { value: "Commit" } });
    fireEvent.keyDown(add, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith([
      ...plan.steps,
      { step: "Commit", status: "pending" },
    ]);

    fireEvent.click(screen.getByText("Clear plan"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("folds to one line with the current step", () => {
    render(<PlanPanel plan={plan} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.getByText("· Fix the total")).toBeTruthy();
    expect(screen.queryByText("Run the tests")).toBeNull();
  });
});
