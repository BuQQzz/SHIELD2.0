import { formatDistanceToNow } from "date-fns";
import type { ConversationMetadata } from "@/types/electron";
import { MessageSquare, Trash2, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, memo } from "react";
import { Tag } from "./Tag";

interface ConversationListProps {
  conversations: ConversationMetadata[];
  currentConversationId?: string | null;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}

export const ConversationList = memo(function ConversationList({
  conversations,
  currentConversationId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setDeletingId(conversationId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    onDelete(conversationId);
    setDeletingId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(null);
  };

  if (conversations.length === 0) {
    return (
      <div className="rounded-lg p-3 text-sm text-muted-foreground text-center">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No conversations yet</p>
        <p className="text-xs mt-1">
          Start chatting to save your first conversation
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => (
        <motion.div
          key={conversation.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`group relative rounded-lg p-2 transition-colors cursor-pointer ${
            currentConversationId === conversation.id
              ? "bg-accent"
              : "hover:bg-accent/50"
          }`}
          onClick={() => onSelect(conversation.id)}
        >
          <AnimatePresence mode="wait">
            {deletingId === conversation.id ? (
              <motion.div
                key="delete-confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm text-muted-foreground">
                  Delete this chat?
                </span>
                <div className="flex gap-1">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => handleConfirmDelete(e, conversation.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <Check className="h-3 w-3 inline mr-1" />
                    Delete
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCancelDelete}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  >
                    <X className="h-3 w-3 inline mr-1" />
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="conversation-info"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-start justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">
                    {conversation.title}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conversation.preview}
                  </p>
                  {conversation.tags && conversation.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {conversation.tags.map((tag) => (
                        <Tag key={tag} label={tag} variant="compact" />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-muted-foreground">
                      {conversation.messageCount} msg
                    </span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => handleDeleteClick(e, conversation.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                  title="Delete conversation"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
});
