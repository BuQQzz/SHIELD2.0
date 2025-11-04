import type { KeyboardShortcut } from "../hooks/useKeyboardShortcuts";

export function createAppShortcuts(
  isGenerating: boolean,
  settingsOpen: boolean,
  handleNewChat: () => void,
  handleStopGenerating: () => void,
  inputFocus: () => void,
  setSettingsOpen: (open: boolean) => void
): KeyboardShortcut[] {
  return [
    {
      key: "n",
      ctrl: true,
      description: "New conversation",
      callback: () => {
        if (!isGenerating) {
          handleNewChat();
        }
      },
    },
    {
      key: "k",
      ctrl: true,
      description: "Focus input",
      callback: inputFocus,
    },
    {
      key: ",",
      ctrl: true,
      description: "Open settings",
      callback: () => {
        setSettingsOpen(true);
      },
    },
    {
      key: "Escape",
      description: "Close settings/stop generation",
      callback: () => {
        if (settingsOpen) {
          setSettingsOpen(false);
        } else if (isGenerating) {
          handleStopGenerating();
        }
      },
    },
  ];
}
