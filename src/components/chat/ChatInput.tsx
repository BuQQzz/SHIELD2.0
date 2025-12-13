"use client";

import {
  useState,
  useRef,
  KeyboardEvent,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Send, Square, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { useSettingsStore } from "@/store/settingsStore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatInputProps {
  onSend: (message: string, useWebSearch?: boolean) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  disabled?: boolean;
}

export interface ChatInputRef {
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  function ChatInput(
    { onSend, isGenerating = false, onStop, disabled = false },
    ref
  ) {
    const [input, setInput] = useState("");
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { settings } = useSettingsStore();

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }));

    // Auto-focus on mount and when not generating
    useEffect(() => {
      if (!isGenerating && !disabled && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isGenerating, disabled]);

    const handleSubmit = () => {
      console.log("[ChatInput] handleSubmit called, input:", input.substring(0, 50));
      console.log("[ChatInput] isGenerating:", isGenerating, "disabled:", disabled);

      if (input.trim() && !isGenerating && !disabled) {
        console.log("[ChatInput] Calling onSend with message and webSearch:", webSearchEnabled);
        onSend(input.trim(), webSearchEnabled);
        setInput("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          // Re-focus after sending
          setTimeout(() => textareaRef.current?.focus(), 0);
        }
      } else {
        console.warn("[ChatInput] Cannot submit - input:", input.length, "isGenerating:", isGenerating, "disabled:", disabled);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
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
          <div className="relative flex items-end gap-2 rounded-lg border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
            {/* Web Search Toggle - only show if enabled in settings */}
            {settings.webSearch.enabled && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                      className={`shrink-0 rounded-md p-2 transition-colors ${webSearchEnabled
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                        }`}
                      type="button"
                    >
                      <Globe
                        className={`h-5 w-5 ${webSearchEnabled ? "" : "text-muted-foreground"}`}
                      />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {webSearchEnabled
                        ? "Web search enabled"
                        : "Enable web search"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              disabled={isGenerating || disabled}
            />

            {isGenerating ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onStop}
                className="shrink-0 rounded-md p-2 transition-colors hover:bg-accent"
              >
                <Square className="h-5 w-5" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
                onClick={handleSubmit}
                disabled={!input.trim() || disabled}
                className="shrink-0 rounded-md bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    );
  }
);
