<div align="center">

<img src="public/shield-logo.png" alt="SHIELD logo" width="120" />

# SHIELD 2.0

**A private AI agent for your desktop. It runs local models on your own GPU, works in your files and terminal with your permission, and keeps your data on your machine.**

[![Latest release](https://img.shields.io/github/v/release/BuQQzz/SHIELD2.0?style=flat-square&logo=github&label=Latest%20release&color=green)](https://github.com/BuQQzz/SHIELD2.0/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/BuQQzz/SHIELD2.0/total?style=flat-square&logo=github&label=Downloads&color=blue)](https://github.com/BuQQzz/SHIELD2.0/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)

### [⬇️ Download SHIELD for Windows](https://github.com/BuQQzz/SHIELD2.0/releases/latest)

Installer or portable `.exe`, no account and no sign-up.

</div>

---

## What SHIELD is

SHIELD started as a local chatbot. It is now an **agent harness**, built to be as capable as hosted coding agents but **offline-first**: the model, your chats, its memory and your files all stay on your PC unless you choose a hosted model.

- 💬 **Chat** with local GGUF models, with live token counts and collapsible reasoning.
- 🛠️ **Code** in a project folder. SHIELD reads, edits and writes files, runs terminal commands and searches the web, and asks you first when a step can change something.
- 👥 **Team mode** lets an orchestrator delegate parts of a task to sub-agents, for example a coder and a reviewer.
- 🧠 **Memory and projects**: notes survive restarts, past chats can be searched, and a project remembers its folder and its `AGENTS.md` instructions.

## Features

### ⚡ Local inference on the Prism / llama.cpp engine

- **One engine:** every local model runs on `llama-server` (PrismML's llama.cpp build), managed by SHIELD.
- **One-click runtime install:** in **Settings › Runtime**, SHIELD picks the right build for your hardware (CUDA 13, CUDA 12.4, Vulkan or CPU), checks its SHA-256, test-runs it before switching over, and keeps the previous build so you can roll back.
- **GPU-aware loading:** context size and layer placement are planned from your VRAM. Models that need it get a fixed all-on-GPU placement, and speculative drafting (ngram) is always on.
- **Model Library:** browse, download and manage GGUF models, including gated Hugging Face models with your own token.
- **Native tool calls:** on models that support them, llama-server limits each tool call to the tool's JSON schema, so the model can't write a malformed call.

### 🤖 Agent harness and tools

- **MCP tools:** built-in filesystem tools (read, write, edit, list, search) through the Model Context Protocol, plus your own MCP servers.
- **SHIELD's own tools:** `run_command` (PowerShell / shell), web search and page fetch, deletion through the Recycle Bin, and memory search.
- **Plan mode:** the model describes the steps without running anything that changes your files.
- **Reliable long tasks:** context summaries when the window fills, a progress check instead of a fixed round limit, a repetition and thinking-loop guard, and a **stuck bar** (Nudge, Skip step, Restart and retry) when a step stalls.
- **Edit safety:** an `edit_file` that would match more than one place is sent back to the model unrun, and a failed edit shows the model the file's closest lines.
- **Tolerant parsing:** XML, OpenAI, Qwen and DeepSeek DSML call formats are all read as SHIELD tool calls.
- **Model-switch handoff:** switching models mid-chat offers a new session that starts from a short briefing the old model writes.

### 🔐 Permissions, security and privacy

| Mode          | What the agent may do                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| **Ask**       | Approve each tool call, or allow one tool for the session                          |
| **Auto**      | Reads run on their own. Deleting, and any command that isn't read-only, still asks |
| **Plan**      | Describe the steps, run nothing                                                    |
| **Read only** | Tools that can change files are hidden from the model                              |

- Unknown tools fail closed.
- **Tool results are untrusted data:** file contents, web pages and command output are wrapped in a `trusted="false"` envelope so that instructions planted inside them are not obeyed (see [Research](#-research-and-experimental-work)).
- **API keys** for hosted providers are encrypted with the operating system's credential store (Electron `safeStorage`) and never reach the app window.
- **No telemetry.** Model lists are fetched only when you open the picker, never at startup. Message text isn't logged for hosted models.

### ☁️ Optional hosted models, privacy first

Bring your own API key in **Settings › Providers** to run the same harness on a hosted model:

- **Experiential Labs** preset, with **zero data retention required by default.** Every request asks for it, and any reply the gateway doesn't confirm as zero-retention is thrown away. This preset gives access to models such as **DeepSeek V4.1**, whose native call markup SHIELD reads.
- **Any OpenAI-compatible API** through the custom preset.
- A badge under each hosted reply shows who served it and whether that route kept your data. A model with no zero-retention route can be allowed on its own, and its replies are marked **"keeps data"**.

## Working vs experimental

| ✅ Working (used in real sessions)                     | 🧪 Experimental / in progress                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Local chat and Code sessions on llama-server           | Team mode on hosted models (untested)                             |
| File tools, terminal, web search, permission modes     | Native function calling for hosted models                         |
| Runtime installer (Vulkan build tested end to end)     | Recall tool: re-reading what a summary replaced                   |
| Hosted models through Experiential with zero retention | Policy: always ask before a change that follows an untrusted read |
| Memory, projects, `AGENTS.md`, Plan mode               | Linux build (runs from source; no packaged release yet)           |
| Native tool calls on Bonsai 2 27B                      | Grammar-constrained calls for more model families                 |

## Tested models

Measured on consumer GPUs (RTX 2070 SUPER 8 GB, RTX 4070 12 GB):

| Model                   | Notes                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| **Bonsai 2 27B** PTQ1_0 | Default. Fully on GPU, ~36-42 tok/s, best tool-call reliability so far |
| Gemma 4 12B Q4_K_M      | ~42 tok/s on 12 GB, 8/8 on the GPU smoke test                          |
| Qwen3.5 9B Q4_K_M       | ~39-62 tok/s, good on 8 GB cards                                       |
| Qwen3-Coder 30B         | Works, spills into system RAM on 12 GB                                 |

## 🧪 Research and experimental work

SHIELD is also a test bed for **agent security on small local models**:

- **Prompt injection through tool results:** a planted "create pwned.txt" instruction inside a file the model was asked to summarise was obeyed **3/3** times on the text-call path (Qwen2.5-7B) and **1/3** with native calling. That finding led to the untrusted-data envelope. The next step being designed is a policy that asks before any change that follows a read of untrusted content.
- **SHIELD Agent Benchmark:** repeatable multi-model runs that measure tool-call failures, rounds, speed and whether the file really changed. See [docs/testing/AGENT_BENCHMARK.md](docs/testing/AGENT_BENCHMARK.md).
- **Architecture notes:** permission and trust model, context engine, tool calling and the decision log are in [docs/SHIELD_AGENT_ARCHITECTURE.md](docs/SHIELD_AGENT_ARCHITECTURE.md).

## Getting started

### Install

1. Download `SHIELD-<version>-x64.exe` (installer) or `SHIELD-<version>-portable.exe` from the [latest release](https://github.com/BuQQzz/SHIELD2.0/releases/latest).
2. Open **Settings › Runtime** and install the llama.cpp runtime (one click).
3. Open the **Library**, download a model, and start a chat.

**Recommended:** Windows 10/11, 16 GB+ RAM, and an NVIDIA GPU with 8 GB+ VRAM (12 GB is comfortable). Vulkan and CPU builds also work, but more slowly.

> **Windows SmartScreen:** SHIELD isn't code-signed yet, so Windows may say it "couldn't verify" the file. Click **More info → Run anyway**. The source is all here if you want to check it or build it yourself.

### Build from source

```powershell
git clone https://github.com/BuQQzz/SHIELD2.0.git
cd SHIELD2.0
npx npm@11 install
npm run dev:electron          # run the app
npx vitest run                # tests
npm run build:win             # installer + portable in release/<version>/
```

## Tech stack

Electron 40 · React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · shadcn/ui · llama.cpp (`llama-server`, PrismML build) · Model Context Protocol SDK · Zustand · Vitest

## Documentation

- [Changelog](CHANGELOG.md)
- [Agent architecture](docs/SHIELD_AGENT_ARCHITECTURE.md)
- [Agent benchmark](docs/testing/AGENT_BENCHMARK.md)
- [Windows build](docs/WINDOWS_BUILD.md)
- [MCP integration](docs/mcp-integration.md)
- [Docs index](docs/README.md)

---

<div align="center">

MIT licensed · Built by [BuQQzz](https://github.com/BuQQzz) · Privacy first

</div>
