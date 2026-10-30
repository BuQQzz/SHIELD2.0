"use client";

import {
  useState,
  useRef,
  KeyboardEvent,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ListPlus, Send, Square, X } from "lucide-react";
import { useGenerationStore } from "@/store/generationStore";
import { motion } from "framer-motion";
import { PermissionModeSelector } from "./PermissionModeSelector";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { TeamToggle } from "./TeamToggle";
import { ComposerModelPicker } from "./ComposerModelPicker";
import type { TeamAvailability } from "@/agents/teamFit";
import { type ModelOption } from "@/config/models";
import { ContextRing } from "./ContextRing";

interface ChatInputProps {
  onSend: (message: string) => void;
  /** Hold a message for its own turn after this one (Ctrl+Enter while working) */
  onQueue?: (message: string) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  /** A Code session: show its project folder (chats have no file tools) */
  showFolder?: boolean;
  /** Whether the model in use can lead an agent team (see TeamToggle) */
  teamAvailability?: TeamAvailability;
  modelId?: string;
  modelName?: string;
  /** Every model (installed and hosted), for the picker in the composer */
  models?: ModelOption[];
  onSelectModel?: (model: ModelOption) => void;
  /** True while a model is loading (the picker is held shut then) */
  isModelLoading?: boolean;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
}

export interface ChatInputRef {
  focus: () => void;
  /** Put text back in the box, before what is there (unsent steer) */
  restore: (text: string) => void;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      onQueue,
      isGenerating = false,
      onStop,
      disabled = false,
      showFolder,
      teamAvailability,
      modelId,
      modelName,
      models,
      onSelectModel,
      isModelLoading,
      onOpenLibrary,
      onOpenSettings,
    },
    ref
  ) {
    const [input, setInput] = useState("");
    const queue = useGenerationStore((state) => state.queue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      restore: (text: string) =>
        setInput((current) => (current ? `${text}\n\n${current}` : text)),
    }));

    // Auto-focus on mount and when not generating
    useEffect(() => {
      if (!isGenerating && !disabled && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isGenerating, disabled]);

    const handleQueue = () => {
      if (!input.trim() || disabled || !onQueue) return;
      onQueue(input.trim());
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    };

    /** A queued message back in the box, to change or send now */
    const editQueued = (index: number) => {
      const text = useGenerationStore.getState().queue[index];
      if (text === undefined) return;
      useGenerationStore.getState().removeQueued(index);
      setInput((current) => (current ? `${text}\n\n${current}` : text));
      textareaRef.current?.focus();
    };

    const handleSubmit = () => {
      console.log(
        "[ChatInput] handleSubmit called, input:",
        input.substring(0, 50)
      );
      console.log(
        "[ChatInput] isGenerating:",
        isGenerating,
        "disabled:",
        disabled
      );

      // While a turn runs, a message steers it (handlers/steer.ts)
      if (input.trim() && !disabled) {
        onSend(input.trim());
        setInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          // Re-focus after sending
          setTimeout(() => textareaRef.current?.focus(), 0);
        }
      } else {
        console.warn(
          "[ChatInput] Cannot submit - input:",
          input.length,
          "isGenerating:",
          isGenerating,
          "disabled:",
          disabled
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // While it works: Enter adds to this task, Ctrl+Enter waits for after
        if (isGenerating && (e.ctrlKey || e.metaKey) && onQueue) handleQueue();
        else handleSubmit();
      }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      // Auto-resize textarea
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;
    };

    return (
      <div className="bg-background p-4">
        <div className="mx-auto max-w-3xl">
          {queue.length > 0 && (
            <div
              className="mb-1.5 flex flex-col gap-1"
              aria-label="Queued messages"
            >
              {queue.map((text, index) => (
                <div
                  key={`${index}-${text}`}
                  className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1 text-xs"
                >
                  <ListPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={() => editQueued(index)}
                    title="Back into the box, to change it or send it now"
                  >
                    <span className="text-muted-foreground">Queued: </span>
                    {text}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      useGenerationStore.getState().removeQueued(index)
                    }
                    aria-label="Remove from the queue"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative flex items-end gap-2 rounded-xl bg-muted/50 p-2 shadow-sm ring-1 ring-black/5 transition-shadow focus-within:shadow-md dark:bg-muted/30 dark:ring-white/5">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={
                isGenerating
                  ? "Enter: add to this task · Ctrl+Enter: queue for after"
                  : "Type your message... (Shift+Enter for new line)"
              }
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              disabled={disabled}
            />

            {isGenerating && input.trim() && onQueue && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleQueue}
                disabled={disabled}
                className="shrink-0 rounded-md p-2 transition-colors"
                aria-label="Queue for after"
                title="Queue for after (Ctrl+Enter): sent as its own message when this one finishes"
              >
                <ListPlus className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" />
              </motion.button>
            )}
            {isGenerating && input.trim() && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSubmit}
                disabled={disabled}
                className="shrink-0 rounded-md p-2 transition-colors"
                aria-label="Send while it works"
                title="Send while it works: it reads this after its next step"
              >
                <Send className="h-5 w-5 text-primary transition-colors" />
              </motion.button>
            )}
            {isGenerating ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onStop}
                className="shrink-0 rounded-md p-2 transition-colors"
              >
                <Square className="h-5 w-5 text-destructive transition-colors" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.92 }}
                whileHover={{ scale: 1.08 }}
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
                className="shrink-0 rounded-md p-2 transition-colors disabled:cursor-not-allowed"
              >
                <Send
                  className={`h-5 w-5 transition-colors ${
                    !input.trim() || disabled
                      ? "text-muted-foreground/40"
                      : "text-primary"
                  }`}
                />
              </motion.button>
            )}
          </div>

          {/* Permission mode and folder sit under the composer: visible while
              typing, out of the way of the send action. */}
          <div className="mt-1 flex min-w-0 items-center gap-1 px-1">
            <PermissionModeSelector />
            {showFolder && <WorkspaceSelector />}
            {showFolder && (
              <TeamToggle
                availability={teamAvailability}
                modelId={modelId}
                modelName={modelName}
              />
            )}
            {models && onSelectModel && onOpenLibrary && (
              <ComposerModelPicker
                models={models}
                currentModelId={modelId}
                isLoading={isModelLoading}
                onSelect={onSelectModel}
                onOpenLibrary={onOpenLibrary}
                onOpenSettings={onOpenSettings}
              />
            )}
            <ContextRing />
          </div>
        </div>
      </div>
    );
  }
);
