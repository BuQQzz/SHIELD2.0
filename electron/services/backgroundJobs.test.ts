// @vitest-environment node
import { spawn, type ChildProcess } from "child_process";
import os from "os";
import { afterEach, describe, expect, it } from "vitest";
import {
  jobOutput,
  MAX_JOBS,
  startJob,
  stopAllJobs,
  stopJob,
} from "./backgroundJobs";

const kill = (child: ChildProcess) => {
  try {
    process.kill(-child.pid!, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
};
const deps = { spawn, kill };
const sh = (command: string) => ({ file: "/bin/sh", args: ["-c", command] });
const start = (command: string, wait = 500) =>
  startJob(command, sh(command), os.tmpdir(), process.env, deps, wait);
const body = (result: { data?: unknown }) =>
  (result.data as { content: { text: string }[] }).content[0]!.text;
const jobOf = (text: string) => Number(/job (\d+)/.exec(text)![1]);

describe.skipIf(process.platform === "win32")("background jobs", () => {
  afterEach(() => stopAllJobs(kill));

  it("starts a server-like command, reads its new output, and stops it", async () => {
    const started = await start(
      "echo ready; sleep 1; echo request 1; sleep 30"
    );
    expect(started.success).toBe(true);
    expect(body(started)).toContain("Started in the background as job");
    expect(body(started)).toContain("ready");
    const job = jobOf(body(started));

    const next = await jobOutput({ job, wait_seconds: 5 });
    expect(body(next)).toContain("request 1");
    expect(body(next)).not.toContain("ready");
    expect(body(next)).toContain("is running");

    const stopped = stopJob({ job }, kill);
    expect(body(stopped)).toContain(`Job ${job} stopped`);
    expect((await jobOutput({ job })).success).toBe(false);
  });

  it("says when the command ended at once", async () => {
    const started = await start("echo port in use; exit 3");
    expect(body(started)).toContain("exit code 3");
    expect(body(started)).toContain("ended at once");
    expect(body(started)).toContain("port in use");
  });

  it(`runs at most ${MAX_JOBS} at once, and Stop ends them all`, async () => {
    for (let i = 0; i < MAX_JOBS; i++) {
      expect((await start("sleep 30", 50)).success).toBe(true);
    }
    const refused = await start("sleep 30", 50);
    expect(refused.success).toBe(false);
    expect(refused.error).toContain("Stop one with stop_command");
    expect(stopAllJobs(kill)).toBe(MAX_JOBS);
  });

  it("names the jobs there are when asked for one that is not", async () => {
    const result = await jobOutput({ job: 999 });
    expect(result.error).toMatch(/No background job 999/);
  });
});
