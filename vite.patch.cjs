// Windows dev fix: Suppress taskkill "process not found" errors in dev mode
const cp = require("node:child_process");
const _origExecSync = cp.execSync;

cp.execSync = function patchedExecSync(cmd, opts) {
  // Check if this is a Windows taskkill command
  if (process.platform === "win32" && /taskkill/.test(String(cmd))) {
    try {
      // Redirect stderr to suppress "process not found" output
      const result = _origExecSync.call(
        this,
        cmd,
        Object.assign({}, opts, { stdio: ["inherit", "pipe", "ignore"] })
      );
      return result;
    } catch (err) {
      // Check if it's the expected "process not found" error
      const errText = String(err.message || err);
      if (/not found/i.test(errText)) {
        // Process already exited - this is OK in dev mode
        return Buffer.from("");
      }
      // Re-throw unexpected errors
      throw err;
    }
  }

  // Normal execution for non-taskkill commands
  return _origExecSync.call(this, cmd, opts);
};
