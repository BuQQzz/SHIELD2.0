---
name: shield-react-components
description: React component patterns and shadcn/ui usage for SHIELD 2.0. Use this when creating or modifying React components.
---

# SHIELD 2.0 React Component Guidelines

## Component Structure

```typescript
"use client";

import { useState, useEffect } from "react";
import { SomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSomeStore } from "@/stores/some-store";

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [state, setState] = useState(false);
  const { data, fetchData } = useSomeStore();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onAction}>
        <SomeIcon className="h-4 w-4 mr-2" />
        {title}
      </Button>
    </div>
  );
}
```

## shadcn/ui Components

Available components in `src/components/ui/`:

- button, dialog, dropdown-menu
- input, label, textarea
- tabs, switch, slider
- tooltip, sonner (toasts)

### Using shadcn/ui

```typescript
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>;
```

## Toast Notifications

```typescript
import { toast } from "sonner";

// Success
toast.success("Operation completed!");

// Error
toast.error("Something went wrong");

// Warning with options
toast.warning("Low memory warning", {
  duration: 8000,
  id: "memory-warning", // Prevents duplicates
});
```

## Icons (Lucide React)

```typescript
import { Settings, Plus, Trash2, Menu, X, Loader2 } from "lucide-react";

// Usage
<Settings className="h-5 w-5" />
<Loader2 className="h-4 w-4 animate-spin" />
```

## State Management (Zustand)

```typescript
// stores/my-store.ts
import { create } from "zustand";

interface MyStore {
  data: string[];
  addItem: (item: string) => void;
}

export const useMyStore = create<MyStore>((set) => ({
  data: [],
  addItem: (item) => set((state) => ({ data: [...state.data, item] })),
}));

// Component usage
const { data, addItem } = useMyStore();
```

## Styling Patterns

### Tailwind Classes

```typescript
// Responsive
<div className="hidden md:flex">

// Dark mode
<span className="text-gray-900 dark:text-gray-100">

// Hover/Focus states
<button className="hover:bg-accent focus:ring-2">

// Animations
<div className="transition-all duration-300 ease-in-out">
```

### Framer Motion

```typescript
import { motion, AnimatePresence } from "framer-motion";

<AnimatePresence mode="wait">
  {isVisible && (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      Content
    </motion.div>
  )}
</AnimatePresence>;
```

## Hooks Pattern

```typescript
// hooks/useMyFeature.ts
export function useMyFeature() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doAction = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await window.electronAPI.my.action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, doAction };
}
```

## File Organization

```
src/components/
├── ui/              # shadcn/ui primitives
├── chat/            # Chat-related components
├── settings/        # Settings components
├── models/          # Model management
├── dialogs/         # Dialog components
└── lazy/            # Lazy-loaded components
```
