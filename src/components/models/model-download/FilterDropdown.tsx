/**
 * Filter Dropdown - Model category filtering
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
import type { FilterType } from "./types";

interface FilterDropdownProps {
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  totalModels: number;
  installedCount: number;
  toolCallingCount: number;
}

export function FilterDropdown({
  filter,
  setFilter,
  totalModels,
  installedCount,
  toolCallingCount,
}: FilterDropdownProps) {
  const getFilterLabel = () => {
    switch (filter) {
      case "all":
        return "All Models";
      case "tool-calling":
        return "Tool Calling";
      case "coding":
        return "Code Generation";
      case "efficient":
        return "Efficient (<5GB)";
      case "installed":
        return "Installed";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          {getFilterLabel()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setFilter("all")}>
          All Models ({totalModels})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFilter("tool-calling")}>
          ⚡ Tool Calling ({toolCallingCount})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFilter("coding")}>
          💻 Code Generation
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setFilter("efficient")}>
          🚀 Efficient (&lt;5GB)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setFilter("installed")}>
          ✅ Installed ({installedCount})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
