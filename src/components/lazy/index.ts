// Lazy loaded components for code splitting and performance optimization
import { lazy } from "react";

// Settings dialog - only loaded when user opens settings
export const LazySettingsDialog = lazy(
  () =>
    import("../settings/SettingsDialog").then((module) => ({
      default: module.SettingsDialog,
    }))
);

// Template selector - only loaded when user clicks new from template
export const LazyTemplateSelector = lazy(
  () =>
    import("../chat/TemplateSelector").then((module) => ({
      default: module.TemplateSelector,
    }))
);

// Code block with syntax highlighting - only loaded when needed
export const LazyCodeBlock = lazy(
  () =>
    import("../chat/CodeBlock").then((module) => ({
      default: module.CodeBlock,
    }))
);

// Markdown renderer - only loaded when messages are displayed
export const LazyMessageContent = lazy(
  () =>
    import("../chat/MessageContent").then((module) => ({
      default: module.MessageContent,
    }))
);
