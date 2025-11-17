---
applyTo: "**/*.tsx"
excludeAgent: ["copilot-coding-agent"]
---

# React + TypeScript Standards

Guidelines for React component development in SHIELD 2.0.

## Purpose & Scope

This file defines React-specific conventions for code reviews. Applies to all `.tsx` files (components, pages, UI).

---

## Component Structure

- Use functional components with hooks (no class components)
- Keep components under 300 lines - extract subcomponents when needed
- One component per file (except small helper components)
- Export component as named export at end of file
- Use `React.FC` or explicit return types

## Naming Conventions

- Component files: `PascalCase.tsx` (e.g., `ChatMessage.tsx`)
- Component names match filenames
- Hook files: `useCamelCase.ts` (e.g., `useLlama.ts`)
- Props interfaces: `ComponentNameProps`
- Event handlers: `handleEventName` (e.g., `handleClick`, `handleSubmit`)

## Props & Types

- Always define props interface
- Use destructuring in function signature
- Provide default values where appropriate
- Mark optional props with `?`
- Avoid spreading unknown props (`{...props}` - be explicit)

## Hooks

- Call hooks at top level (before any returns/conditions)
- Custom hooks must start with `use` prefix
- Extract complex logic into custom hooks
- Use `useCallback` for functions passed as props
- Use `useMemo` for expensive computations
- Always specify dependency arrays correctly

## State Management

- Use `useState` for local component state
- Use `useContext` for shared state (avoid prop drilling)
- Zustand for global app state (see `stores/`)
- Keep state as close to usage as possible
- Avoid unnecessary re-renders

## Styling

- Use Tailwind CSS utility classes
- Use `cn()` helper from `@/lib/utils` for conditional classes
- Follow shadcn/ui patterns for component styling
- Use CSS variables for theme values
- Minimize inline styles (use only for dynamic values)

## UI Components

- Prefer shadcn/ui components over custom implementations
- Use Lucide React icons exclusively
- Follow minimalist design principles (Phase 1-4 guidelines)
- Ensure accessibility (ARIA labels, keyboard navigation)
- Use Framer Motion for animations:
  - `whileHover={{ scale: 1.02-1.1 }}` for buttons
  - `whileTap={{ scale: 0.95-0.98 }}` for pressed effect
  - `transition-colors` for CSS transitions (not `transition-all`)

## Event Handlers

- Prefix with `handle` (e.g., `handleClick`)
- Define inline for simple operations
- Extract to named function for complex logic
- Use `useCallback` when passing to child components
- Prevent default behavior explicitly when needed

## Performance

- Use `React.memo()` for expensive components
- Implement `useMemo`/`useCallback` to prevent unnecessary re-renders
- Lazy load components with `React.lazy()` and `Suspense`
- Avoid anonymous functions in JSX when possible
- Profile with React DevTools

---

## Example: Good Component

```tsx
import { useState, useCallback, memo } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(() => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  }, [input, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex gap-2 p-4 border-t">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "flex-1 rounded-md px-3 py-2",
          "bg-background border transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleSubmit}
        disabled={!input.trim() || disabled}
        className="rounded-md bg-primary p-2 text-primary-foreground"
      >
        <Send className="h-5 w-5" />
      </motion.button>
    </div>
  );
});
```

---

## Testing

- Test component rendering with different props
- Test user interactions (clicks, input changes)
- Test conditional rendering
- Test accessibility attributes
- Mock external dependencies (hooks, contexts)

## Accessibility

- Use semantic HTML (`<button>`, `<input>`, etc.)
- Include ARIA labels for icon-only buttons
- Support keyboard navigation (Tab, Enter, Escape)
- Maintain proper focus management
- Test with screen readers

## Common Patterns

### Conditional Rendering
```tsx
// ✅ GOOD
{isLoading && <LoadingSpinner />}
{error ? <ErrorMessage error={error} /> : <Content />}

// ❌ BAD (causes unnecessary re-renders)
{isLoading === true && <LoadingSpinner />}
```

### Event Handlers
```tsx
// ✅ GOOD
const handleClick = useCallback(() => {
  doSomething();
}, [doSomething]);

// ❌ BAD (recreates function every render)
onClick={() => doSomething()}
```

### Styling
```tsx
// ✅ GOOD
className={cn("base-styles", isActive && "active-styles")}

// ❌ BAD
className={`base-styles ${isActive ? 'active-styles' : ''}`}
```
