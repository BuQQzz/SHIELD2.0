# SHIELD - Social Media Introduction Posts

Use these templates to introduce SHIELD to various social media platforms. Customize the placeholders (like `[Link]`) before posting.

## 🚀 Short Pitch (Elevator Pitch)

**SHIELD** is a privacy-first, local AI assistant for Windows. It runs powerful LLMs (like Qwen, Llama, Mistral) entirely on your machine using llama.cpp. With features like transparent "Thinking" animations, privacy-focused web search, and local file operations via MCP, it's the ultimate tool for secure, offline productivity. No data leaves your PC.

---

## 🐦 Twitter / X Thread

**Tweet 1 (The Hook):**
Meet SHIELD 🛡️
The privacy-first AI assistant that runs 100% locally on Windows.
🧠 Powered by llama.cpp
🔒 No data leaves your machine
⚡ Run 32B+ models on consumer GPUs
📂 Local file access via MCP

Your data, your hardware, your AI.
[Link to Repo/Release]
#LocalLLM #AI #Privacy #OpenSource

**Tweet 2 (Thinking UI):**
See what your AI is thinking. 🧠
SHIELD features a transparent "Thinking" UI for Chain-of-Thought models. Watch the reasoning process unfold in real-time before getting the final answer.
[Attach Video/GIF of Thinking UI]

**Tweet 3 (GPU Offloading):**
Limited VRAM? No problem.
With smart GPU Layer Offloading, SHIELD automatically splits models between VRAM and System RAM. Run massive 32B models on a 12GB card without crashing.
#Hardware #Optimization

**Tweet 4 (Web Search & MCP):**
Need real-time info? Toggle on privacy-focused Web Search (via DuckDuckGo). 🔍
Need to work with files? SHIELD uses the Model Context Protocol (MCP) to safely read and write files on your PC with explicit permissions.
#MCP #Productivity

**Tweet 5 (Call to Action):**
Built with Electron, React, and TypeScript.
Open source and ready for you to try.

Download now: [Link]
Star us on GitHub: [Link]

---

## 💼 LinkedIn Post

**Headline: Introducing SHIELD: The Privacy-First Local AI Assistant for Windows**

I'm excited to share **SHIELD**, a powerful desktop application designed to bring the power of Large Language Models (LLMs) to your local machine without compromising privacy.

Unlike cloud-based assistants, SHIELD runs entirely on your hardware using **llama.cpp**. This means your data never leaves your computer—perfect for sensitive workflows, coding, and personal data processing.

**Key Features:**
*   **🔒 100% Local Privacy**: No external API calls for inference.
*   **🧠 Transparent Reasoning**: Visual "Thinking" animation for Chain-of-Thought models, letting you see the AI's logic.
*   **⚡ Smart Hardware Usage**: GPU Layer Offloading allows you to run large models (like Qwen 2.5 32B) even on consumer GPUs with limited VRAM.
*   **📂 File System Integration**: Built on the Model Context Protocol (MCP), SHIELD can safely read and write files on your PC with granular permission controls.
*   **🔍 Private Web Search**: Integrated DuckDuckGo search for real-time information without tracking.

Built with a modern tech stack: **Electron, React, TypeScript, and shadcn/ui**.

Whether you're a developer needing a secure coding assistant or a privacy advocate wanting control over your data, SHIELD is built for you.

Check it out on GitHub: [Link]

#AI #LocalLLM #Privacy #OpenSource #Electron #React #MachineLearning

---

## 🤖 Reddit Post (r/LocalLLaMA, r/opensource)

**Title: [Project Share] SHIELD - A Privacy-First, Local AI Desktop App for Windows (llama.cpp, MCP, Web Search)**

Hey everyone,

I wanted to share **SHIELD**, an open-source project I've been working on. It's a local AI assistant for Windows that focuses heavily on privacy and UX.

**The Goal:**
To create a polished, user-friendly interface for local LLMs that feels as good as commercial cloud apps but keeps all data on your machine.

**Under the Hood:**
*   **Backend**: Electron + Node.js + **llama.cpp** (via node-llama-cpp)
*   **Frontend**: React 19 + TypeScript + shadcn/ui
*   **Models**: Supports GGUF format (Qwen, Llama 3, Mistral, etc.)

**Cool Features:**
1.  **Thinking UI**: For models that support Chain-of-Thought (like DeepSeek R1 or Qwen), we parse the `<think>` tags and show a collapsible "AI Reasoning" section. You can see exactly how the model got to the answer.
2.  **GPU Layer Offloading**: If you have a 12GB card but want to run a 32B model, SHIELD automatically splits layers between VRAM and System RAM so it actually runs (instead of OOMing).
3.  **MCP Integration**: We implemented the **Model Context Protocol** to give the AI tools. It can read/write files on your desktop/documents, but *only* with your explicit permission via a native dialog.
4.  **Private Web Search**: Toggles on/off. Uses DuckDuckGo (no API key needed) + Playwright to fetch and parse content locally.

**Why another UI?**
I wanted something that integrated deeply with the OS (file system access) while maintaining strict privacy controls. Plus, the "Thinking" animation makes working with reasoning models much more satisfying.

**Repo**: [Link to GitHub]
**Releases**: [Link to Releases]

Would love to hear your feedback or feature requests!

---

## 💬 Discord Announcement

**📢 ANNOUNCEMENT: SHIELD is Live!**

We are thrilled to unveil **SHIELD** – your new privacy-first AI companion. 🛡️

SHIELD brings the power of local LLMs to your Windows desktop with a beautiful, modern interface.

**✨ Highlights:**
*   **Run Locally**: Powered by `llama.cpp`. Your data stays yours.
*   **Smart Offloading**: Run bigger models on smaller GPUs.
*   **Thinking Mode**: Watch the AI "think" through complex problems.
*   **Tools (MCP)**: Give the AI access to your files safely.
*   **Web Search**: Get up-to-date info privately.

**📥 Download:** [Link]
**⭐ Star on GitHub:** [Link]

Give it a spin and let us know what you think in the feedback channel!
