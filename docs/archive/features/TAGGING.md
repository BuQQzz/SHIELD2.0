# Conversation Tagging System

## Overview

The conversation tagging system allows users to organize their conversations with custom tags for better categorization and visual identification.

## Features

### Tag Management

- **Add Tags**: Create custom tags via the ChatHeader dropdown menu
- **Remove Tags**: Delete tags individually with a single click
- **Visual Display**: Tags appear as colored badges in the conversation list
- **Persistence**: Tags are saved with conversation data automatically
- **Validation**: Prevents duplicate tags and trims whitespace

### User Interface

#### Tag Component (`Tag.tsx`)

- **Two Variants**:
  - `default`: Standard size (px-2.5 py-1 text-sm)
  - `compact`: Space-efficient for sidebar (px-2 py-0.5 text-xs)
- **Features**:
  - Optional remove button with X icon
  - Framer Motion fade/scale animations
  - Primary color background with 10% opacity
  - Click propagation stopped on remove to prevent conversation selection
  - Accessible with aria-labels

#### Tag Management UI

Located in ChatHeader dropdown menu (three-dot icon):

1. Click the three-dot menu in chat header
2. Select "Manage Tags" to open sub-menu
3. View existing tags with remove buttons
4. Click "Add Tag" to show input field
5. Type tag name and press Enter to add
6. Press Escape to cancel input

### Implementation Details

#### Data Structure

```typescript
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  tags?: string[]; // Optional array of tag strings
  createdAt: string;
  updatedAt: string;
  modelId?: string;
}
```

#### Storage

- Tags stored as `string[]` in conversation metadata
- Persisted to JSON files in Electron userData directory
- Included in conversation exports (JSON and Markdown)
- Restored when importing conversations

#### Tag Display

- **ConversationList**: Shows tags below conversation preview
- **Compact variant**: Used for space efficiency in sidebar
- **Conditional rendering**: Only displays if tags exist
- **Animation**: Fade in/out when tags are added/removed

### Keyboard Shortcuts

- **Enter**: Submit new tag when input is focused
- **Escape**: Cancel tag input and close input field

### Future Enhancements

- Tag-based filtering in conversation search
- Tag color customization
- Tag suggestions based on conversation content
- Bulk tag operations (add to multiple conversations)
- Tag analytics (most used tags, conversations per tag)

## Technical Architecture

### Components

- **Tag.tsx** (34 lines): Reusable tag display component
- **ChatHeader.tsx**: Tag management UI and handlers
- **ConversationList.tsx**: Tag display integration

### Handlers

```typescript
// Add tag with validation
const handleAddTag = async (tag: string) => {
  if (!currentConversation || !tag.trim()) return;
  const currentTags = currentConversation.tags || [];
  if (currentTags.includes(tag.trim())) return; // Prevent duplicates
  updateConversation({ tags: [...currentTags, tag.trim()] });
  await saveCurrentConversation();
  setNewTagInput("");
  setShowTagInput(false);
};

// Remove tag
const handleRemoveTag = async (tag: string) => {
  if (!currentConversation) return;
  const currentTags = currentConversation.tags || [];
  updateConversation({ tags: currentTags.filter((t) => t !== tag) });
  await saveCurrentConversation();
};
```

### State Management

- Uses Zustand conversation store
- `updateConversation`: Updates current conversation
- `saveCurrentConversation`: Persists to storage and refreshes list

## Testing Checklist

- [ ] Add tag to conversation
- [ ] Remove tag from conversation
- [ ] Prevent duplicate tags
- [ ] Tags persist after app restart
- [ ] Tags display in conversation list
- [ ] Tags included in export/import
- [ ] Tag input validation (trim whitespace)
- [ ] UI responsiveness and animations
- [ ] Multiple tags per conversation
- [ ] Tag removal doesn't trigger conversation selection

## Best Practices

- Keep tag names short and descriptive (1-3 words)
- Use consistent naming conventions (e.g., lowercase, kebab-case)
- Limit tags per conversation to maintain readability (recommended: 3-5 tags)
- Use tags for categorization, not full descriptions

## Privacy & Security

- All tag data stored locally on user's machine
- No external API calls or cloud sync
- Tags included in conversation exports for data portability
- User has complete control over tag data
