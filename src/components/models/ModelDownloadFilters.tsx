/**
 * Model Download Filters Component
 *
 * Filter and search controls for the model download dialog
 * Includes category filter dropdown and search input
 */

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type FilterType = "all" | "tool-calling" | "coding" | "efficient" | "installed";

interface ModelDownloadFiltersProps {
  filter: FilterType;
  searchQuery: string;
  totalModels: number;
  installedCount: number;
  toolCallingCount: number;
  onFilterChange: (filter: FilterType) => void;
  onSearchChange: (query: string) => void;
}

export function ModelDownloadFilters({
  filter,
  searchQuery,
  totalModels,
  installedCount,
  toolCallingCount,
  onFilterChange,
  onSearchChange,
}: ModelDownloadFiltersProps) {
  return (
    <div className="flex-shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Download Models</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalModels} models available • {installedCount} installed •{" "}
            {toolCallingCount} with tool calling
          </p>
        </div>

        {/* Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              {filter === "all" && "All Models"}
              {filter === "tool-calling" && "Tool Calling"}
              {filter === "coding" && "Code Generation"}
              {filter === "efficient" && "Efficient (<5GB)"}
              {filter === "installed" && "Installed"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onFilterChange("all")}>
              All Models ({totalModels})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange("tool-calling")}>
              ⚡ Tool Calling ({toolCallingCount})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange("coding")}>
              💻 Code Generation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onFilterChange("efficient")}>
              🚀 Efficient (&lt;5GB)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onFilterChange("installed")}>
              ✅ Installed ({installedCount})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search Bar */}
      <div className="mt-4">
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            "w-full px-3 py-2 rounded-md border bg-background",
            "text-sm placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        />
      </div>
    </div>
  );
}
