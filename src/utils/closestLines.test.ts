import { describe, expect, it } from "vitest";
import { closestLines, similarity } from "./closestLines";

const file = [
  "# Disaster Preparedness Checklists & Resources",
  "",
  "| Preparedness Level | Duration | Focus |",
  "|-------------------|----------|-------|",
  "| 72-Hour Kit | 3 days | Immediate emergency response",
  "| 📍 Long Island, NY Specific Resources | N/A | Local resources for Long Island households (NASSA, Red Cross, NY State)",
  "",
  "## Water",
  "- 1 gallon per person per day",
].join("\n");

describe("closestLines", () => {
  it("finds a row the model copied with an extra ' |'", () => {
    expect(
      closestLines(
        file,
        "| 📍 Long Island, NY Specific Resources | N/A | Local resources for Long Island households (NASSA, Red Cross, NY State) |"
      )
    ).toEqual({
      line: 6,
      text: "| 📍 Long Island, NY Specific Resources | N/A | Local resources for Long Island households (NASSA, Red Cross, NY State)",
    });
  });

  it("points a heading the file never had at the line that holds its words", () => {
    expect(
      closestLines(file, "## 📍 Long Island, NY Specific Resources")?.line
    ).toBe(6);
  });

  it("shows as many lines as oldText has, from where it would start", () => {
    expect(closestLines(file, "## Water\n- 1 galon per person a day")).toEqual({
      line: 8,
      text: "## Water\n- 1 gallon per person per day",
    });
  });

  it("returns null when nothing in the file is close", () => {
    expect(closestLines(file, "function main() { return 42; }")).toBeNull();
  });

  it("scores the same text 1 and unrelated text near 0", () => {
    expect(similarity("hello world", "hello world")).toBe(1);
    expect(similarity("hello world", "zzqq")).toBe(0);
  });
});
