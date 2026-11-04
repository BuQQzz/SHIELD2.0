# SHIELD 2.0 v0.2.0: Local Agent Harness

SHIELD has grown from a local chatbot into a private **agent harness**. It runs local models on your GPU, works in your files and terminal with your permission, and can optionally use hosted models with zero data retention.

## Highlights

- **Prism / llama.cpp engine:** every local model now runs on `llama-server`. **Settings › Runtime** installs the right build for your hardware in one click (CUDA 13, CUDA 12.4, Vulkan or CPU), checks its SHA-256 and keeps the previous build so you can roll back.
- **Agent harness:** a Code view for project folders with file tools, a terminal tool, web search and page fetch, Plan mode, and Team mode with sub-agents.
- **Permission modes:** Ask, Auto, Plan and Read only. Deleting, and any command that isn't read-only, still asks in Auto. Unknown tools fail closed.
- **Security:** tool results are marked as untrusted data, so instructions planted in files or web pages are not followed. API keys are encrypted with the OS credential store.
- **Reliability:** native tool calls held to each tool's JSON schema on supported models, context summaries, a thinking-loop guard, a stuck bar (Nudge, Skip, Restart), refusal of ambiguous edits, and readers for more tool-call formats.
- **Memory and projects:** notes survive restarts, past chats can be searched, and projects keep their folder and `AGENTS.md`.
- **Optional hosted models:** bring your own key. Experiential Labs requires zero data retention by default (DeepSeek V4.1 and others), and any OpenAI-compatible API works through the custom preset. A badge on each reply shows who served it.
- **Model-switch handoff:** switching models mid-chat can start a fresh session from a short briefing.
- **Simpler UI:** one model picker in the composer and a lighter header.

## Downloads

| File                        | What it is                          |
| --------------------------- | ----------------------------------- |
| `SHIELD-0.2.0-x64.exe`      | Installer (Start menu, uninstaller) |
| `SHIELD-0.2.0-portable.exe` | Portable, no install                |

Models are not bundled. After installing, open **Settings › Runtime** to install the engine, then the **Library** to download a model.

**Windows SmartScreen:** the build isn't code-signed yet. Click **More info → Run anyway**.

## Still experimental

Team mode on hosted models, native function calling for hosted models, the recall tool, and the "ask after an untrusted read" policy. Linux runs from source only.

Full list: [CHANGELOG.md](https://github.com/BuQQzz/SHIELD2.0/blob/main/CHANGELOG.md)
