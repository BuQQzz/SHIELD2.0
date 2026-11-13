import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, FolderTree } from "lucide-react";
import { MCPSettings } from "@/components/settings/MCPSettings";
import { ConnectorsSection } from "@/components/plugins/ConnectorsSection";
import { useSettingsStore } from "@/store/settingsStore";
import type { ModelOption } from "@/config/models";

interface PluginsPageProps {
  currentModel?: ModelOption | null;
}

/**
 * Plugins are MCP servers: each one gives the model a set of tools. The
 * filesystem server is built in; online services and the user's own servers
 * are connectors (ConnectorsSection).
 */
export function PluginsPage({ currentModel }: PluginsPageProps) {
  const { settings } = useSettingsStore();
  // The file tools' list is long; folded, the services below stay in view
  const [showFileTools, setShowFileTools] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 pb-16 pt-10">
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tools the model can use: files on this PC, and online services you
            connect. Every action still goes through your permission mode.
          </p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
          className="mt-8 overflow-hidden rounded-2xl bg-background shadow-card"
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal-soft">
              <FolderTree className="h-4 w-4 text-signal" />
            </div>
            <div className="flex-1">
              <h2 className="font-medium">Filesystem</h2>
              <p className="text-xs text-muted-foreground">
                Built in · read, write, move and delete files in your workspace
                folder
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFileTools((v) => !v)}
              aria-expanded={showFileTools}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Choose tools
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showFileTools ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {showFileTools && (
            <div className="px-5 py-5">
              <MCPSettings
                settings={settings.mcp}
                currentModel={currentModel}
              />
            </div>
          )}
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="mt-10"
        >
          <ConnectorsSection contextSize={currentModel?.contextSize} />
        </motion.div>
      </div>
    </div>
  );
}
