# Built-in Help & About Page

## Overview
The Help page provides comprehensive, self-contained documentation for all features within the app itself, eliminating the need for users to search online or leave the application - perfect for SHIELD 2.0's privacy-first, offline-first approach.

## Features

### Accessibility
- **Location**: Settings dialog → Help tab (4th tab after Model, System, Privacy)
- **Keyboard Shortcut**: Ctrl+, (opens settings) → click Help tab
- **Always Available**: No internet connection required

### Content Sections

#### 1. About SHIELD 2.0
- App description and core philosophy
- Privacy-first, offline AI chatbot explanation
- llama.cpp local inference overview
- Zero external server communication guarantee

#### 2. Core Features Guide
Comprehensive explanations of:
- **Conversation Management**: Multiple conversations, auto-save, context restoration
- **Model Selection**: Choose between models, switch mid-conversation
- **Conversation Tags**: Organize with custom tags, add/remove functionality
- **Export & Import**: JSON and Markdown formats, data portability
- **Dark Mode**: Light/dark/system themes, persistent selection
- **Local Storage**: Complete local data storage, no cloud sync

#### 3. Keyboard Shortcuts Reference
Quick reference for power users:
- `Ctrl + N`: New conversation
- `Ctrl + K`: Focus message input
- `Ctrl + ,`: Open settings
- `Escape`: Close settings / Stop generation

Each shortcut displayed with:
- Description on left
- Keyboard key visual on right (styled `<kbd>` element)

#### 4. Understanding Model Settings
Detailed explanations for all model parameters:

**Temperature**
- What it controls: Response creativity
- Low values (0.1-0.5): Focused, deterministic
- High values (0.8-1.5): Creative, varied
- Use cases for different settings

**Max Tokens**
- Controls response length
- Memory and performance impact
- Trade-offs between length and speed

**Top P (Nucleus Sampling)**
- Token selection probability
- Focus vs. variety balance
- Recommended ranges

**Top K**
- Next token consideration limit
- Predictability control
- Practical applications

**Repeat Penalty**
- Reduces text repetition
- Word/phrase repetition prevention
- Optimal settings

#### 5. Privacy & Data
Explicit privacy guarantees:
- ✓ Local AI processing (llama.cpp)
- ✓ No internet required for inference
- ✓ Local conversation storage
- ✓ Zero telemetry/tracking/data collection
- ✓ No external API calls or cloud services
- ✓ Complete user control over data

#### 6. Getting Started Guide
Step-by-step for new users:
1. Select AI model from dropdown
2. Wait for model loading
3. Type message in input field
4. Send with Enter or send button
5. Use three-dot menu for actions
6. Create new conversations with Ctrl+N or + button

#### 7. Version Information
- App name: SHIELD 2.0
- Version: 0.1.0 (Experimental)
- "Built with ❤️ for privacy-conscious users"

## Implementation Details

### Component Structure
**HelpSettings.tsx** (208 lines)
- Modular component architecture
- Reusable sub-components for consistency
- Clean, maintainable code under 300-line limit

### Sub-Components

#### FeatureItem
Displays individual feature explanations:
```typescript
interface FeatureItemProps {
  icon: React.ReactNode;  // Lucide icon
  title: string;          // Feature name
  description: string;    // Detailed explanation
}
```

#### ShortcutItem
Displays keyboard shortcuts:
```typescript
interface ShortcutItemProps {
  shortcut: string;    // e.g., "Ctrl + N"
  description: string; // e.g., "New conversation"
}
```

#### SettingExplanation
Explains model settings:
```typescript
interface SettingExplanationProps {
  title: string;       // Setting name
  description: string; // How it works and when to use
}
```

### Icons Used
- Shield (privacy, about)
- Sparkles (features, getting started)
- MessageSquare (conversation management)
- Cpu (model selection)
- Tag (tagging system)
- FileJson (export/import)
- Moon (dark mode)
- HardDrive (local storage)
- Keyboard (shortcuts)
- Book (model settings)

### Design Principles
- **Self-Contained**: No external links or dependencies
- **Offline-First**: Entirely functional without internet
- **User-Friendly**: Clear, jargon-free language
- **Comprehensive**: Covers all features and settings
- **Scannable**: Organized sections with icons and headings
- **Accessible**: Proper semantic HTML and ARIA labels

### Integration
- Added to SettingsDialog.tsx as 4th tab
- Tab grid updated from 3 columns to 4
- Consistent styling with other settings tabs
- Same spacing and layout patterns

## User Benefits

### For New Users
- Learn all features without leaving app
- Understand what each setting does
- Quick start guide gets them productive immediately
- No need to search documentation online

### For Privacy-Conscious Users
- Confirms privacy guarantees in writing
- No need to visit external websites
- Self-contained documentation respects privacy
- Offline accessibility maintains privacy

### For Power Users
- Quick reference for keyboard shortcuts
- Deep dive into model parameter effects
- Understanding of advanced features
- Optimization tips for best performance

## Maintenance Guidelines

### When to Update
- New features added: Document in "Core Features" section
- New keyboard shortcuts: Add to shortcuts reference
- New settings: Explain in "Understanding Model Settings"
- Privacy changes: Update "Privacy & Data" section
- Version changes: Update version information

### Best Practices
- Keep language simple and clear
- Use concrete examples where helpful
- Maintain consistent formatting
- Test all information for accuracy
- Update documentation in same commit as feature

## Testing Checklist
- [ ] Help tab accessible from settings
- [ ] All sections render correctly
- [ ] Icons display properly
- [ ] Keyboard shortcuts are accurate
- [ ] Model settings explanations are clear
- [ ] Privacy information is complete
- [ ] Getting started guide is sequential
- [ ] Version information is current
- [ ] No broken links (shouldn't have any!)
- [ ] Responsive layout on different window sizes
- [ ] Proper spacing and typography
- [ ] Matches app's design system

## Future Enhancements
- Search functionality within help page
- Collapsible sections for long content
- Interactive demos or examples
- Troubleshooting section with common issues
- FAQ section based on user questions
- Video tutorials or GIF demonstrations
- Context-sensitive help (show relevant section based on where user is in app)
- Keyboard shortcut customization documentation
