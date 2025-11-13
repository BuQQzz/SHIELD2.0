# AI Memory Setup for SHIELD 2.0

## Overview

OpenMemory provides **persistent long-term memory** for GitHub Copilot when working on SHIELD 2.0. This enables the AI to:

- Remember architecture decisions and patterns
- Recall past conversations and context
- Understand project evolution over time
- Reduce token usage by accessing stored knowledge
- Provide more consistent and informed assistance

## 🔒 Privacy & Security

**100% Local Operation:**

- All data stored in local SQLite database
- No external API calls (using local embeddings)
- No cloud services or data transmission
- Complete data ownership and control
- Database location: `D:/AI Projects/OpenMemory/backend/data/shield-ai-memory.sqlite`

## Setup

### 1. OpenMemory Backend

The backend is already configured and running:

```bash
# Start OpenMemory (if not already running)
cd "D:/AI Projects/OpenMemory/backend"
npm run dev
```

Server runs on `http://localhost:8080`

### 2. Verify Health

```bash
curl http://localhost:8080/health
```

Should return `{"ok":true, "embedding": {"provider":"synthetic",...}}`

### 3. MCP Configuration

OpenMemory is configured as an MCP server in `.mcp-config.json`. GitHub Copilot can now:

**Available Tools:**

- `openmemory_query` - Search for relevant memories
- `openmemory_store` - Store new knowledge
- `openmemory_reinforce` - Strengthen important memories
- `openmemory_list` - Browse stored memories
- `openmemory_get` - Retrieve specific memory

## What Gets Stored

### Project Knowledge

- Architecture decisions (refactoring patterns, module organization)
- Tech stack details (llama.cpp, React, Electron, TypeScript)
- Development guidelines (.github/copilot-instructions.md)
- Feature implementations and their reasoning
- Performance optimizations
- Security considerations

### Conversation Context

- User preferences and coding style
- Recurring questions and their answers
- Project-specific terminology
- Problem-solving approaches

## Usage Examples

### Store Memory (via API)

```bash
curl -X POST http://localhost:8080/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "content": "SHIELD 2.0 uses 300-line limit per file to maintain code quality",
    "user_id": "shield-ai",
    "metadata": {"category": "architecture", "importance": "high"}
  }'
```

### Query Memory

```bash
curl -X POST http://localhost:8080/memory/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "refactoring patterns",
    "k": 5,
    "filters": {"user_id": "shield-ai"}
  }'
```

## Memory Sectors

OpenMemory organizes memories by type:

- **Semantic** - Facts and concepts (architecture, APIs)
- **Episodic** - Events and conversations
- **Procedural** - How-to knowledge (workflows, patterns)
- **Emotional** - User preferences and priorities
- **Reflective** - Meta-insights and learnings

## Maintenance

### View Statistics

```bash
curl http://localhost:8080/stats
```

### Memory Decay

- Automatic decay runs daily at 2 AM
- Less-accessed memories gradually fade
- Important memories can be reinforced

### Backup

```bash
# Backup the database
cp "D:/AI Projects/OpenMemory/backend/data/shield-ai-memory.sqlite" \
   "D:/AI Projects/SHIELD2.0/backups/ai-memory-backup-$(date +%Y%m%d).sqlite"
```

### Reset (if needed)

```bash
# Delete database to start fresh
rm "D:/AI Projects/OpenMemory/backend/data/shield-ai-memory.sqlite"
# Restart server - new database will be created
```

## Performance

- Query response: ~115ms average
- Storage: ~15MB per 10,000 memories
- Max capacity: 50,000 memories
- No performance degradation at scale

## Troubleshooting

### Server Won't Start

```bash
# Check if port 8080 is in use
netstat -ano | findstr :8080

# Kill process if needed
taskkill /PID <process_id> /F
```

### Connection Errors

- Ensure OpenMemory backend is running
- Check firewall settings for localhost:8080
- Verify `.env` configuration

### Memory Not Storing

- Check server logs for errors
- Verify write permissions on data directory
- Ensure disk space available

## Integration with Development Workflow

1. **Start of Session**: OpenMemory automatically loads when backend starts
2. **During Coding**: Copilot queries memories for relevant context
3. **After Decisions**: Important choices can be stored for future reference
4. **End of Session**: Memories persist for next session

## Benefits

✅ **Reduced Context Window Usage** - Retrieve specific knowledge instead of re-reading files  
✅ **Consistency** - AI remembers past decisions and patterns  
✅ **Faster Responses** - Quick memory retrieval vs. full file scanning  
✅ **Learning** - AI improves over time by building knowledge base  
✅ **Privacy** - 100% local, no data leaves your machine

## Next Steps

1. ✅ OpenMemory backend running
2. ⏳ Store initial project knowledge
3. ⏳ Test memory-enhanced coding
4. ⏳ Monitor and optimize

---

**Status**: ✅ Active  
**Database**: `shield-ai-memory.sqlite`  
**Server**: `http://localhost:8080`  
**Privacy**: 🔒 100% Local
