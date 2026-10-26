# Permission Modes — Implementation Plan

**Status:** Plan. No code written yet.
**Date:** 2026-09-21
**Relates to:** `MODEL_SYSTEM_BRAINSTORM.md` idea #4 (Plan mode), which this absorbs

---

## Why

Two problems, one fix.

**1. The MCP settings surface is mostly fiction.** Six of the eight `settings.mcp.*` keys have zero consumers:

| Setting                 | Live consumers |
| ----------------------- | -------------- |
| `allowedTools`          | 7              |
| `maxToolCallsPerTurn`   | 1              |
| `enabled`               | **0**          |
| `allowedServers`        | **0**          |
| `showPermissionDialog`  | **0**          |
| `rememberChoices`       | **0**          |
| `auditLogRetentionDays` | **0**          |
| `hybridParserEnabled`   | **0**          |

Settings → MCP renders toggles that do nothing. `mcp.enabled` is `false` in the current `settings.json` and MCP runs anyway, because `src/App.tsx` hardcodes `mcpEnabled: true`.

**2. These settings are not independent.** "Permission dialog off + remember choices on + everything allowed" _is_ a mode — there is just no name for it. Users do not reason about eight booleans; they reason about how much leash the model has. And it is a **per-turn** decision, not a per-install one, which is why it belongs in the composer rather than a settings panel.

So modes are not a ninth knob. They are the replacement for a config surface that is already lying.

---

## The modes

Adapted to SHIELD rather than copied from a coding agent. Per the brainstorm doc, SHIELD is "chatbot first, personal assistant, sometimes coding" — so an "Accept edits" mode does not map.

| Mode              | Tools advertised to model               | Prompts             | Executes                              |
| ----------------- | --------------------------------------- | ------------------- | ------------------------------------- |
| **Ask** (default) | All allowlisted                         | Every call          | On approval                           |
| **Auto**          | All allowlisted                         | Mutating calls only | Reads immediately, writes on approval |
| **Plan**          | All allowlisted, described as read-only | Never               | Nothing — model states intent         |
| **Read-only**     | Non-mutating only                       | Never               | Reads immediately                     |

**Ask** is today's behavior and stays the default. No migration surprise.

**Auto** is where most people will live. Read fatigue is what makes the app feel slow; writes are what people actually want to be asked about.

**Read-only** exploits something built on 2026-09-21: the system prompt now advertises only tools that pass a policy filter (`src/App.tsx`). In Read-only the model is never _told_ `write_file` exists, so it will not propose it and the user never sees a denial. That is strictly better than refusing after the fact, and it costs nothing extra — it is the same filter.

**Plan** is brainstorm idea #4. It is the one mode that needs new prompt content rather than just new policy.

### No Bypass mode

Deliberately omitted. SHIELD's differentiation is agentic system access with **explicit consent + audit logging**. Audit logging survives a bypass mode fine — calls still get recorded. Explicit consent does not. Jan, Open WebUI and AnythingLLM do not foreground consent; that is the thing SHIELD has that they do not.

Auto mode delivers most of the perceived speed benefit, because reads are where prompt fatigue comes from.

---

## Read vs. mutating classification

**Finding: MCP tool annotations are not usable for this today.** The spec defines `annotations.readOnlyHint`, but `@modelcontextprotocol/server-filesystem` returns `null` annotations for all 14 of its tools (verified 2026-09-21 against the installed server).

So classification has to be a local table. That is the same shape as the hardcoded-tool-list bug fixed earlier in this session, so it must be built with that failure in mind:

```
READ:     read_file, read_text_file, read_media_file, read_multiple_files,
          list_directory, list_directory_with_sizes, directory_tree,
          search_files, get_file_info, list_allowed_directories

MUTATING: write_file, edit_file, create_directory, move_file
```

**Rules:**

1. **Prefer `annotations.readOnlyHint` when a server provides it.** The table is the fallback, not the primary source.
2. **Fail closed.** An unknown tool is treated as mutating and always prompts. A new server's tools must never be silently auto-approved because they were not in a list written in 2026.
3. The table lives next to the classifier with a comment explaining rule 2, so the next person does not "helpfully" default unknowns to read.

---

## Settings migration

### New shape

```ts
// src/types/settings.ts
export type PermissionMode = "ask" | "auto" | "plan" | "readonly";

mcp: {
  mode: PermissionMode;          // default "ask"
  allowedTools: string[];        // kept - orthogonal to mode
  maxToolCallsPerTurn: number;   // kept
  maxToolRounds: number;         // NEW - currently hardcoded to 5 in messageHandler.ts
}
```

### Absorbed or removed

| Setting                 | Disposition                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `showPermissionDialog`  | **Absorbed.** It is `mode === "ask"`.                                                                                                                        |
| `rememberChoices`       | **Absorbed.** "Allow always" promotes the tool into `allowedTools`, scoped to the active mode.                                                               |
| `enabled`               | **Fix or remove.** Either wire it up (replace the hardcoded `mcpEnabled: true` in `App.tsx`) or delete it. Do not leave it dead.                             |
| `allowedServers`        | **Remove.** Only `filesystem` connects; `MCPService.initialize()` hardcodes it. Reinstate when a second server exists.                                       |
| `auditLogRetentionDays` | **Wire up or remove.** An audit concern, not a permission-mode concern — but it should not stay dead.                                                        |
| `hybridParserEnabled`   | **Remove.** `messageHandler.ts` passes `enableHybridParser: true` literally. Both formats are parsed unconditionally and there is no reason to disable that. |

### Migration for existing `settings.json`

`SettingsStorageService` loads a stored object; unknown keys survive and missing keys need defaults.

```
if (!mcp.mode) {
  mcp.mode = mcp.showPermissionDialog === false ? "auto" : "ask";
}
delete mcp.showPermissionDialog, rememberChoices, allowedServers, hybridParserEnabled
```

Everyone lands on **Ask** unless they had explicitly turned the dialog off. `SettingsValidation.ts` needs a `mode` enum check; today it validates that `allowedTools` is an array and little else.

---

## Where the code changes

Ordered by dependency. Each step leaves the app working.

**1. Schema + migration** — `src/types/settings.ts`, `electron/services/settings/SettingsCategories.ts`, `SettingsValidation.ts`, `SettingsStorageService.ts`. No behavior change; everything defaults to `ask`.

**2. Classifier** — new `src/config/toolClassification.ts`. `isMutatingTool(tool: ToolDefinition): boolean`, preferring `annotations.readOnlyHint`, falling back to the table, failing closed. Pure function, unit-testable, no UI.

**3. Policy layer** — new `src/hooks/useToolPolicy.ts` returning `{ advertisedTools, needsApproval(tool), executes }` from `(mode, allowlist, serverTools)`. The single place a mode turns into behavior.

**4. Wire the prompt** — `src/App.tsx` replaces the current inline `allowedTools` filter with `advertisedTools` from the policy. Read-only mode starts working here.

**5. Wire enforcement** — `src/hooks/useMCPDialogs.ts` consults `needsApproval(tool)` instead of prompting unconditionally. Auto mode starts working here.

**6. Plan mode prompt** — `src/config/systemPrompts.ts` gains a plan-mode variant instructing the model to state intended calls without emitting `<tool_call>`; `src/handlers/mcpMessageHandler.ts` short-circuits execution when `executes` is false.

**7. Mode selector UI** — composer control, alongside the inline permission bar. Modes and that bar are one piece of work: "Allow always" only has a coherent meaning once it can be scoped to a mode.

**8. Settings panel cleanup** — `src/components/settings/MCPSettings.tsx` drops the dead toggles. The Tool Access list stays; it already discovers all 14 tools from the server correctly.

---

## Tests worth writing

- **Classifier:** every filesystem tool lands in the right bucket; an unknown tool is mutating; a server-provided `readOnlyHint` wins over the table.
- **Policy:** Read-only never advertises a mutating tool; Auto approves reads and prompts on writes; Plan advertises but never executes.
- **Migration:** a legacy `settings.json` with `showPermissionDialog: false` becomes `mode: "auto"`; a fresh install is `mode: "ask"`.

---

## Open questions

1. **Is the mode per-conversation or global?** Claude Code's is per-session. Per-conversation is probably right for SHIELD (a chat about files and a chat about recipes want different leash), but it means storing it on the conversation record, not just in settings.
2. **Should Plan mode auto-advance?** After the model states a plan, does the user get an "execute this plan" button, or retype the request in Ask mode? The button is better UX and more work.
3. **Does `auditLogRetentionDays` belong in this work at all?** It is dead, but it is an audit concern, not a permission-mode concern. Probably a separate small task.
