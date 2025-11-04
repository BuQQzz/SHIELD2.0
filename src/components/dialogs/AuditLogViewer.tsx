import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMCP } from "@/hooks/useMCP";
import type { AuditLogEntry } from "@/types/electron";
import {
  Database,
  CheckCircle2,
  XCircle,
  Download,
  Trash2,
  Search,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuditLogViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditLogViewer({ open, onOpenChange }: AuditLogViewerProps) {
  const { audit } = useMCP();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{
    totalCalls: number;
    approvedCalls: number;
    deniedCalls: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      loadLogs();
      loadStats();
    }
  }, [open]);

  useEffect(() => {
    applyFilters();
  }, [logs, searchQuery, filterApproved]);

  const loadLogs = async () => {
    const entries = await audit.query({ limit: 100 });
    setLogs(entries);
  };

  const loadStats = async () => {
    const result = await audit.stats();
    if (result.success && result.stats) {
      setStats(result.stats);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    if (searchQuery) {
      filtered = filtered.filter(
        (log) =>
          log.serverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.toolName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterApproved !== null) {
      filtered = filtered.filter((log) => log.approved === filterApproved);
    }

    setFilteredLogs(filtered);
  };

  const handleExport = async () => {
    const result = await audit.export("");
    if (result.success) {
      alert("Audit logs exported successfully!");
    } else {
      alert(`Failed to export logs: ${result.error}`);
    }
  };

  const handleClear = async () => {
    if (
      confirm(
        "Are you sure you want to clear all audit logs? This action cannot be undone."
      )
    ) {
      const result = await audit.clear();
      if (result.success) {
        setLogs([]);
        loadStats();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            MCP Audit Logs
          </DialogTitle>
          <DialogDescription>
            View and manage all MCP operation history
          </DialogDescription>
        </DialogHeader>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 py-3 border-b">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalCalls}</div>
              <div className="text-sm text-muted-foreground">Total Calls</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.approvedCalls}
              </div>
              <div className="text-sm text-muted-foreground">Approved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {stats.deniedCalls}
              </div>
              <div className="text-sm text-muted-foreground">Denied</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-3 py-3 border-b">
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by server or tool name..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Button
              variant={filterApproved === true ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilterApproved(filterApproved === true ? null : true)
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Approved
            </Button>
            <Button
              variant={filterApproved === false ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilterApproved(filterApproved === false ? null : false)
              }
            >
              <XCircle className="h-4 w-4 mr-1" />
              Denied
            </Button>
          </div>
        </div>

        {/* Log Entries */}
        <div className="flex-1 overflow-y-auto space-y-2 py-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No audit logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="border rounded-lg p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {log.approved ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium">
                        {log.serverName} / {log.toolName}
                      </span>
                    </div>
                    {log.arguments && (
                      <div className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded max-w-full overflow-x-auto">
                        {JSON.stringify(log.arguments, null, 2)}
                      </div>
                    )}
                    {log.error && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        Error: {log.error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(log.timestamp), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-3 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {filteredLogs.length} of {logs.length} logs
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
