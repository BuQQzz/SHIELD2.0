# 🧠 AI Memory System - Quick Start

OpenMemory is now configured to give GitHub Copilot **persistent memory** about SHIELD 2.0 development.

## ✅ Status: Active

- **Server**: Running at `http://localhost:8080`
- **Database**: `D:/AI Projects/OpenMemory/backend/data/shield-ai-memory.sqlite`
- **Privacy**: 🔒 100% Local (no external APIs)
- **Stored Memories**: Architecture, refactoring, guidelines, tech stack

## Quick Commands

### Start OpenMemory (if not running)

```powershell
cd "D:/AI Projects/OpenMemory/backend"
npm run dev
```

### Check Health

```powershell
Invoke-RestMethod http://localhost:8080/health
```

### Query Memories

```powershell
Invoke-RestMethod -Uri http://localhost:8080/memory/query `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"query":"your question","k":5,"filters":{"user_id":"copilot-shield"}}'
```

### Store New Memory

```powershell
Invoke-RestMethod -Uri http://localhost:8080/memory/add `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"content":"your knowledge","user_id":"copilot-shield","metadata":{"category":"architecture"}}'
```

## Benefits

✅ **Persistent Context** - I remember past decisions and patterns  
✅ **Reduced Tokens** - Query specific knowledge vs re-reading files  
✅ **Consistency** - Maintain project standards across sessions  
✅ **Learning** - Build knowledge base over time  
✅ **Privacy** - All data stays local on your machine

## Documentation

Full setup guide: [`docs/AI_MEMORY_SETUP.md`](./docs/AI_MEMORY_SETUP.md)

## What I Remember

- SHIELD 2.0 architecture and design patterns
- Refactoring decisions and module structure
- Development guidelines from copilot-instructions.md
- Tech stack (llama.cpp, Electron, React, TypeScript)
- Recent work and project status

---

**Next**: Ready to merge `refactoring` branch to `main` with full AI memory support! 🚀
