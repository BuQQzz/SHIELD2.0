import type { ChatTemplate } from "../config/chatTemplates";
import { useSettingsStore } from "../store/settingsStore";
import type { Message } from "../hooks/useLlama";

export function createTemplateHandler(
  createNewConversation: () => void,
  setSystemPrompt: ((prompt: string) => Promise<void>) | undefined,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  clearHistory: () => Promise<void>,
  inputRef: React.RefObject<{ focus: () => void } | null>
) {
  return async (template: ChatTemplate) => {
    createNewConversation();

    const { settings, updateSettings } = useSettingsStore.getState();
    updateSettings({
      system: {
        ...settings.system,
        systemPrompt: template.systemPrompt,
      },
      model: {
        ...settings.model,
        ...template.settings,
      },
    });

    if (setSystemPrompt) {
      await setSystemPrompt(template.systemPrompt);
    }

    setMessages([]);
    clearHistory();
    inputRef.current?.focus();
  };
}
