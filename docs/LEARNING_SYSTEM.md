# SHIELD 2.0 Learning System

## Overview

SHIELD 2.0 includes a RAG-based (Retrieval-Augmented Generation) learning system that helps the AI improve over time by remembering past conversations, user preferences, and corrections.

## How It Works

### 1. **Conversation Memory (RAG)**
The system stores conversation exchanges with metadata:
- User questions
- Assistant responses
- Topic keywords
- User feedback (helpful/not helpful)
- Corrections

When you ask a question, the system:
1. Searches past conversations for relevant context
2. Retrieves similar interactions
3. Provides that context to the LLM
4. Helps maintain consistency across conversations

### 2. **User Preference Tracking**
The system learns your preferences over time:
- **Response style**: Brief vs detailed, technical vs casual
- **Domain knowledge**: Specialized topics you discuss frequently
- **Corrections**: Facts you've corrected in past conversations
- **Format preferences**: Code style, explanation depth, etc.

### 3. **Feedback Loop**
You can help the AI learn by:
- **Thumbs up/down**: Mark responses as helpful or not
- **Corrections**: When the AI gets something wrong, your correction is stored
- **Follow-ups**: Clarifying questions help refine understanding

## Current Implementation Status

### ✅ **Implemented**
- Memory database schema (SQLite)
- Conversation storage with metadata
- Preference tracking system
- Feedback recording
- Basic keyword-based memory search

### 🚧 **In Progress**
- Full integration into message flow
- UI feedback buttons (thumbs up/down)
- Automatic memory retrieval
- Topic extraction from conversations

### 📋 **Planned**
- **Embeddings for semantic search**: Use vector embeddings for better memory retrieval
- **Automatic preference learning**: Extract preferences from conversation patterns
- **Memory consolidation**: Merge similar memories to improve relevance
- **Privacy controls**: User control over what gets remembered
- **Export/import**: Back up and transfer your learning data

## Usage (When Fully Integrated)

### Providing Feedback
```
# Future UI will include:
- 👍 / 👎 buttons on each response
- "Correct this" option for inaccurate information
- Preference settings panel
```

### How Corrections Work
When you correct the AI:
```
You: "What's the capital of Canada?"
AI: "The capital of Canada is Toronto."
You: "Actually, it's Ottawa."

→ System stores: Ottawa is capital of Canada (with correction flag)
→ Future responses will use Ottawa instead of Toronto
```

### Preference Learning Example
```
# After several brief responses:
You: "Please provide more detailed explanations."

→ System learns: User prefers detailed responses
→ Adjusts response style for future interactions
```

## Technical Details

### Memory Service
Located in: `electron/services/MemoryService.ts`

Key features:
- **Storage**: SQLite database for fast, local storage
- **Privacy**: All data stays on your machine
- **Cleanup**: Automatically manages memory size (keeps last 1000 interactions)
- **Indexing**: Fast search by timestamp, conversation, and keywords

### Database Schema

**memories table**:
```sql
- id: Unique identifier
- conversationId: Links to conversation
- timestamp: When interaction occurred
- userMessage: What you asked
- assistantResponse: What AI answered
- topics: JSON array of keywords
- wasHelpful: User feedback (1/0/null)
- userCorrection: Your correction if any
- metadata: Additional context (JSON)
```

**preferences table**:
```sql
- key: Preference identifier
- value: Preference value
- lastUpdated: Timestamp
```

## Privacy & Control

### What Gets Stored
- Conversation history (user questions and AI responses)
- Feedback you explicitly provide (thumbs up/down)
- Corrections you make
- Preferences you set

### What DOESN'T Get Stored
- No telemetry sent to external servers
- No personal information unless you choose to share it
- No automatic tracking of behavior
- All data stays 100% local

### User Controls (Planned)
- Clear all memories
- Clear specific conversation memories
- Export your learning data
- Import learning data
- Disable learning system entirely
- Set memory retention period

## Benefits

### For Users
1. **Consistency**: AI remembers your preferences across sessions
2. **Improved accuracy**: Learns from corrections
3. **Personalization**: Adapts to your communication style
4. **Context awareness**: Recalls relevant past discussions
5. **Privacy**: Everything stays local

### For the AI
1. **Better responses**: Access to relevant past context
2. **Fewer hallucinations**: Learns from corrections
3. **Domain adaptation**: Builds knowledge in topics you discuss
4. **Style matching**: Adapts tone and format to your preferences

## Future Enhancements

### Semantic Search with Embeddings
Current: Simple keyword matching
Planned: Vector embeddings for true semantic search

Example:
```
Query: "How do I optimize performance?"
Current: Matches keyword "performance"
Future: Also retrieves "speed up application", "reduce latency", "improve efficiency"
```

### Automatic Topic Extraction
Extract key topics from conversations automatically using NLP:
- Technical terms
- Named entities
- Domain-specific concepts

### Memory Consolidation
Merge similar memories to improve relevance:
```
Memory 1: "Python uses indentation for blocks"
Memory 2: "Python code blocks use spaces/tabs"
Consolidated: "Python uses indentation (spaces/tabs) for code blocks"
```

### Adaptive Learning Rate
Learn more quickly from:
- Explicit corrections
- Repeated patterns
- User confirmations

### Context Window Management
Intelligently select which memories to include based on:
- Relevance score
- Recency
- User feedback
- Topic match
- Token budget

## Development Roadmap

### Phase 1: Foundation (Current)
- [x] Memory service implementation
- [x] Database schema
- [ ] IPC handlers for memory operations
- [ ] Integration into message flow

### Phase 2: UI Integration
- [ ] Feedback buttons (thumbs up/down)
- [ ] Correction interface
- [ ] Memory viewer
- [ ] Preference settings panel

### Phase 3: Intelligence
- [ ] Implement embedding-based search
- [ ] Automatic topic extraction
- [ ] Preference inference
- [ ] Memory consolidation

### Phase 4: Polish
- [ ] Export/import functionality
- [ ] Memory analytics dashboard
- [ ] Privacy controls
- [ ] Performance optimization

## Contributing

To extend the learning system:

1. **Add new memory types**: Extend `MemoryEntry` interface
2. **Improve search**: Implement better similarity algorithms
3. **Add embeddings**: Integrate embedding models for semantic search
4. **UI components**: Create feedback and preference UI

## Performance Considerations

- **Memory limit**: Default 1000 interactions (configurable)
- **Search speed**: Indexed for fast keyword search
- **Storage**: ~1KB per interaction average
- **Cleanup**: Automatic removal of old memories

## Questions?

For questions or feature requests related to the learning system, please open an issue on GitHub with the `learning-system` label.

---

*Note: This is an experimental feature. The learning system is designed to improve your experience while maintaining complete privacy and local control.*
