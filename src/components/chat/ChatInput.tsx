"use client";

import {
  useState,
  useRef,
  KeyboardEvent,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { ArrowUp, ListPlus, Send, Square, X } from "lucide-react";
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
  isModelLoaded?: boolean;
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
      isModelLoaded,
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
      <div className="bg-background px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          {queue.length > 0 && (
            <div
              className="mb-1.5 flex flex-col gap-1"
              aria-label="Queued messages"
            >
              {queue.map((text, index) => (
                <div
                  key={`${index}-${text}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-soft px-2.5 py-1 text-xs"
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
          {/* A tray holding the composer card: the card has the message, the
              model and send; the tray under it the mode, folder and team.
              Depth from the card's shadow, no borders */}
          <div className="rounded-[20px] bg-soft p-1">
            <div className="rounded-2xl bg-panel px-3 pb-2 pt-2.5 shadow-card transition-shadow duration-200 focus-within:shadow-pop">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={
                  isGenerating
                    ? "Add to this task, or Ctrl+Enter to queue it"
                    : "Ask anything"
                }
                rows={1}
                className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-1 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground/80"
                disabled={disabled}
              />
              <div className="mt-1 flex min-w-0 items-center gap-1">
                {models && onSelectModel && onOpenLibrary && (
                  <ComposerModelPicker
                    models={models}
                    currentModelId={modelId}
                    isLoading={isModelLoading}
                    isModelLoaded={isModelLoaded}
                    onSelect={onSelectModel}
                    onOpenLibrary={onOpenLibrary}
                    onOpenSettings={onOpenSettings}
                  />
                )}
                <span className="flex-1" />
                <ContextRing />
                {isGenerating && input.trim() && onQueue && (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleQueue}
                    disabled={disabled}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    aria-label="Queue for after"
                    title="Queue for after (Ctrl+Enter): sent as its own message when this one finishes"
                  >
                    <ListPlus className="h-4 w-4" />
                  </motion.button>
                )}
                {isGenerating && input.trim() && (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleSubmit}
                    disabled={disabled}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 text-signal hover:bg-signal-soft"
                    aria-label="Send while it works"
                    title="Send while it works: it reads this after its next step"
                  >
                    <Send className="h-4 w-4" />
                  </motion.button>
                )}
                {isGenerating ? (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={onStop}
                    aria-label="Stop"
                    title="Stop"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 bg-foreground text-background hover:bg-foreground/85"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleSubmit}
                    disabled={!input.trim() || disabled}
                    aria-label="Send"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed ${
                      !input.trim() || disabled
                        ? "bg-foreground/10 text-muted-foreground"
                        : "bg-foreground text-background hover:bg-foreground/85"
                    }`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* Permission mode, folder and team: in the tray, visible while
                typing, out of the way of the send action */}
            <div className="flex min-w-0 items-center gap-1 px-1.5 pb-0.5 pt-1">
              <PermissionModeSelector />
              {showFolder && <WorkspaceSelector />}
              {showFolder && (
                <TeamToggle
                  availability={teamAvailability}
                  modelId={modelId}
                  modelName={modelName}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
