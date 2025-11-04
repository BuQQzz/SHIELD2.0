import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMCP } from "@/hooks/useMCP";
import { Wrench, Server, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

interface ToolsExplorerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export function ToolsExplorer({ open, onOpenChange }: ToolsExplorerProps) {
  const { listTools, isReady } = useMCP();
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState("filesystem");

  useEffect(() => {
    if (open && isReady) {
      loadTools();
    }
  }, [open, isReady, selectedServer]);

  const loadTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTools(selectedServer);
      if (result.success && result.tools) {
        setTools(result.tools as MCPTool[]);
      } else {
        setError(result.error || "Failed to load tools");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            MCP Tools Explorer
          </DialogTitle>
          <DialogDescription>
            Browse available tools from connected MCP servers
          </DialogDescription>
        </DialogHeader>

        {/* Server Selection */}
        <div className="flex items-center gap-2 py-3 border-b">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Server:</span>
          <div className="flex gap-2">
            <Button
              variant={selectedServer === "filesystem" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedServer("filesystem")}
            >
              filesystem
            </Button>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={loadTools}
            disabled={loading || !isReady}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Status Message */}
        {!isReady && (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              MCP service not initialized. Please enable and initialize MCP in settings.
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-950 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {/* Tools List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading tools...</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No tools available</p>
            </div>
          ) : (
            tools.map((tool, idx) => (
              <div
                key={idx}
                className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="font-medium font-mono text-sm">{tool.name}</div>
                    {tool.description && (
                      <p className="text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                    {tool.inputSchema && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Parameters:
                        </div>
                        <div className="text-xs bg-muted p-2 rounded font-mono max-h-40 overflow-auto">
                          <pre>
                            {JSON.stringify(tool.inputSchema, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t">
          <div className="text-sm text-muted-foreground">
            {tools.length} {tools.length === 1 ? "tool" : "tools"} available
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
