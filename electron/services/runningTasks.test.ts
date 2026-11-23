// @vitest-environment node
import { describe, expect, it } from "vitest";
import os from "os";
import { killTree, runCommand } from "./terminalTool";
import {
  leftoverNote,
  noteLeftovers,
  runningTasks,
  stopTask,
  type FindProcesses,
} from "./runningTasks";

/** Polls up to a second: a process may still be starting or ending */
async function eventually<T>(read: () => T, ok: (value: T) => boolean) {
  let value = read();
  for (let i = 0; i < 20 && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, 50));
    value = read();
  }
  return value;
}

const text = (result: { data?: unknown }) =>
  (result.data as { content: { text: string }[] }).content[0]!.text;

describe("leftovers from a fake process list", () => {
  it("lists a task while it has processes, and only tasks it noted", () => {
    let alive = true;
    const find: FindProcesses = (taskId) =>
      alive && taskId === "t1" ? [{ pid: 501, args: "python3 server.py" }] : [];
    const still = noteLeftovers(
      "t1",
      500,
      "nohup python3 server.py &",
      1,
      find
    );
    expect(still).toEqual([{ pid: 501, args: "python3 server.py" }]);
    expect(runningTasks(find)).toContainEqual(
      expect.objectContaining({
        id: "left-t1",
        kind: "left",
        processes: ["python3 server.py"],
      })
    );
    // A task SHIELD did not note is never stopped from here
    const killed: number[] = [];
    expect(
      stopTask("left-other", killTree, find, (pid) => killed.push(pid))
    ).toBe(false);
    expect(killed).toEqual([]);
    alive = false;
    expect(runningTasks(find).some((t) => t.id === "left-t1")).toBe(false);
  });

  it("notes nothing for a command that left nothing", () => {
    expect(noteLeftovers("t2", 600, "ls", 1, () => [])).toEqual([]);
    expect(leftoverNote([])).toBe("");
  });

  it("tells the model what it left and that it is its to stop", () => {
    const note = leftoverNote([{ pid: 7, args: "python3 server.py" }]);
    expect(note).toContain("python3 server.py (pid 7)");
    expect(note).toContain("stop it when you are done");
    expect(note).toContain("Tasks running");
  });
});

describe.skipIf(process.platform !== "linux")("a real setsid server", () => {
  it("is found by its marker though it left the command's group", async () => {
    const result = await runCommand(
      {
        command:
          "setsid nohup sleep 38 > /dev/null 2>&1 < /dev/null & disown; echo started",
      },
      os.tmpdir()
    );
    expect(text(result)).toMatch(
      /Still running after this command: (setsid |nohup )*sleep 38/
    );
    const task = (
      await eventually(runningTasks, (tasks) =>
        tasks.some((t) => t.processes.some((p) => p.endsWith("sleep 38")))
      )
    ).find((t) => t.processes.some((p) => p.endsWith("sleep 38")));
    expect(stopTask(task!.id, killTree)).toBe(true);
    const after = await eventually(
      runningTasks,
      (tasks) => !tasks.some((t) => t.id === task!.id)
    );
    expect(after.some((t) => t.id === task!.id)).toBe(false);
  });
});

describe.skipIf(process.platform === "win32")("a real nohup server", () => {
  it("is noted, listed, and stopped by the user", async () => {
    const result = await runCommand(
      { command: "nohup sleep 37 > /dev/null 2>&1 & echo started" },
      os.tmpdir()
    );
    expect(text(result)).toContain("started");
    expect(text(result)).toMatch(
      /Still running after this command: (setsid |nohup )*sleep 37/
    );
    const task = (
      await eventually(runningTasks, (tasks) =>
        tasks.some((t) => t.processes.some((p) => p.endsWith("sleep 37")))
      )
    ).find((t) => t.processes.some((p) => p.endsWith("sleep 37")));
    expect(task?.kind).toBe("left");
    expect(stopTask(task!.id, killTree)).toBe(true);
    const after = await eventually(
      runningTasks,
      (tasks) => !tasks.some((t) => t.id === task!.id)
    );
    expect(after.some((t) => t.id === task!.id)).toBe(false);
  });
});
