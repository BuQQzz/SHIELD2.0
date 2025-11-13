import { useState } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Code,
  Sparkles,
  Cpu,
  GraduationCap,
  Lightbulb,
  FileEdit,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAT_TEMPLATES, type ChatTemplate } from "@/config/chatTemplates";

const iconMap = {
  MessageSquare,
  Code,
  Sparkles,
  Cpu,
  GraduationCap,
  Lightbulb,
  FileEdit,
  Search,
};

interface TemplateSelectorProps {
  onSelect: (template: ChatTemplate) => void;
  onClose: () => void;
}

export function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ChatTemplate | null>(
    null
  );

  const handleSelectTemplate = (template: ChatTemplate) => {
    setSelectedTemplate(template);
  };

  const handleConfirm = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate);
      onClose();
    }
  };

  const getIcon = (iconName: string) => {
    const Icon = iconMap[iconName as keyof typeof iconMap] || MessageSquare;
    return Icon;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative bg-background rounded-lg shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-2xl font-semibold">Choose a Template</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Start with a pre-configured AI assistant for your task
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Templates Grid */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-180px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHAT_TEMPLATES.map((template) => {
              const Icon = getIcon(template.icon);
              const isSelected = selectedTemplate?.id === template.id;

              return (
                <motion.button
                  key={template.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectTemplate(template)}
                  className={`
                    relative p-4 rounded-lg border-2 text-left transition-colors
                    ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 bg-card"
                    }
                  `}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`
                      p-2 rounded-lg transition-colors
                      ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }
                    `}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">
                        {template.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {template.description}
                      </p>
                      {template.starterPrompts && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Example prompts:
                          </p>
                          {template.starterPrompts
                            .slice(0, 2)
                            .map((prompt, i) => (
                              <p
                                key={i}
                                className="text-xs text-muted-foreground italic"
                              >
                                • {prompt}
                              </p>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground">
            {selectedTemplate ? (
              <span>
                Selected: <strong>{selectedTemplate.name}</strong>
              </span>
            ) : (
              <span>Select a template to continue</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedTemplate}>
              Start Chat
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
