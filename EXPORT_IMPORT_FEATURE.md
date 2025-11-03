# Conversation Export/Import Feature

## Overview
Added the ability to export and import conversations in multiple formats, enabling users to backup, share, and migrate their chat history.

## Implementation Details

### Backend Service (`electron/services/ExportService.ts`)
- **exportAsJSON()**: Exports conversation with metadata (timestamp, version)
- **exportAsMarkdown()**: Exports formatted conversation with headers and emojis
- **importFromJSON()**: Imports and validates conversation structure
- **File Dialog Integration**: Native Electron file save/open dialogs

### IPC Layer (`electron/main.ts`)
Added three IPC handlers:
- `conversation:export-json` - Export conversation as JSON file
- `conversation:export-markdown` - Export conversation as Markdown file
- `conversation:import` - Import conversation from JSON file

### Type Definitions (`src/types/electron.d.ts`)
```typescript
export interface ExportAPI {
  exportJSON: (conversation: Conversation) => Promise<boolean>;
  exportMarkdown: (conversation: Conversation) => Promise<boolean>;
  import: () => Promise<Conversation | null>;
}
```

### Preload API (`electron/preload.ts`)
Exposed export/import functionality to renderer process via `window.electronAPI.export`

### UI Components (`src/components/chat/Sidebar.tsx`)
Added buttons in the sidebar:
- **Import Button**: Import conversations (always visible)
- **Export JSON Button**: Export current conversation as JSON (visible when conversation active)
- **Export Markdown Button**: Export current conversation as Markdown (visible when conversation active)

## Export Formats

### JSON Format
```json
{
  "id": "conversation-id",
  "title": "Conversation Title",
  "messages": [...],
  "createdAt": "2024-11-03T...",
  "updatedAt": "2024-11-03T...",
  "modelId": "qwen-7b",
  "exportedAt": "2024-11-03T...",
  "version": "1.0"
}
```

### Markdown Format
```markdown
# Conversation Title

**Created:** 11/3/2024, 3:00:00 PM
**Updated:** 11/3/2024, 3:15:00 PM
**Model:** qwen-7b
**Messages:** 10

---

## 🧑 User
*11/3/2024, 3:00:00 PM*

[message content]

---

## 🤖 Assistant
*11/3/2024, 3:00:05 PM*

[message content]

---
```

## Features
✅ Export conversations as JSON (full data with metadata)
✅ Export conversations as Markdown (human-readable format)
✅ Import conversations from JSON files
✅ Validation on import (checks structure, required fields, message format)
✅ Native file dialogs for save/open
✅ Error handling throughout
✅ Automatic filename generation (based on conversation title)

## Testing Checklist
- [ ] Export a conversation as JSON
- [ ] Open the JSON file and verify structure
- [ ] Import the JSON file and verify it loads correctly
- [ ] Export a conversation as Markdown
- [ ] Open the Markdown file and verify formatting
- [ ] Test import with invalid JSON (should fail gracefully)
- [ ] Test export/import with conversations containing special characters
- [ ] Test canceling file dialogs (should not throw errors)

## Future Enhancements
- [ ] PDF export format
- [ ] Batch export (export all conversations)
- [ ] Export with conversation tags/filters
- [ ] Import from other chat formats (ChatGPT, etc.)
