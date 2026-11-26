import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePanelWidth } from "./usePanelWidth";

const options = {
  key: "test.panel.width",
  defaultWidth: 320,
  minWidth: 260,
  maxShare: 0.6,
  reserve: 680,
};

const setWindow = (width: number) =>
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });

describe("usePanelWidth", () => {
  afterEach(() => localStorage.removeItem(options.key));

  it("widens, is remembered, and resets", () => {
    setWindow(1920);
    const { result } = renderHook(() => usePanelWidth(options));
    expect(result.current.width).toBe(320);
    act(() => result.current.setWidth(700));
    expect(result.current.width).toBe(700);
    expect(localStorage.getItem(options.key)).toBe("700");
    act(() => result.current.reset());
    expect(result.current.width).toBe(320);
  });

  it("leaves room for the chat, and never goes under its least width", () => {
    setWindow(1920);
    const { result } = renderHook(() => usePanelWidth(options));
    act(() => result.current.setWidth(5000));
    // 60% of 1920 is 1152; 1920 less the 680 kept for the rest is 1240
    expect(result.current.width).toBe(1152);
    setWindow(920);
    act(() => result.current.setWidth(600));
    expect(result.current.width).toBe(260);
  });
});
