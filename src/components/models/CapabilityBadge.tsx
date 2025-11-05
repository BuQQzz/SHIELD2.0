/**
 * Capability Badge Component
 *
 * Visual indicator for model capabilities
 * Shows icons and colors for different features
 */

import { Zap, Code, FileText, Globe, Brain, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type CapabilityType =
  | "toolCalling"
  | "codeGeneration"
  | "longContext"
  | "multilingual"
  | "complexReasoning"
  | "structuredOutput";

interface CapabilityBadgeProps {
  type: CapabilityType;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const CAPABILITY_CONFIG: Record<
  CapabilityType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  }
> = {
  toolCalling: {
    label: "Tool Calling",
    icon: Zap,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-950",
  },
  codeGeneration: {
    label: "Code Gen",
    icon: Code,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-950",
  },
  longContext: {
    label: "Long Context",
    icon: FileText,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-950",
  },
  multilingual: {
    label: "Multilingual",
    icon: Globe,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-950",
  },
  complexReasoning: {
    label: "Reasoning",
    icon: Brain,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-100 dark:bg-indigo-950",
  },
  structuredOutput: {
    label: "Structured",
    icon: Layers,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-950",
  },
};

const SIZE_CONFIG = {
  sm: {
    badge: "px-1.5 py-0.5 text-xs gap-1",
    icon: "h-3 w-3",
  },
  md: {
    badge: "px-2 py-1 text-sm gap-1.5",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    badge: "px-2.5 py-1.5 text-base gap-2",
    icon: "h-4 w-4",
  },
};

export function CapabilityBadge({
  type,
  size = "sm",
  showLabel = true,
  className,
}: CapabilityBadgeProps) {
  const config = CAPABILITY_CONFIG[type];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        sizeConfig.badge,
        config.color,
        config.bgColor,
        className
      )}
      title={config.label}
    >
      <Icon className={sizeConfig.icon} />
      {showLabel && <span>{config.label}</span>}
    </div>
  );
}

/**
 * Badge Group - Display multiple capability badges
 */
interface CapabilityBadgeGroupProps {
  capabilities: {
    toolCalling?: boolean;
    codeGeneration?: boolean;
    longContext?: boolean;
    multilingual?: "excellent" | "good" | "basic";
    complexReasoning?: boolean;
    structuredOutput?: boolean;
    [key: string]: boolean | string | undefined;
  };
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
  maxDisplay?: number;
  className?: string;
}

export function CapabilityBadgeGroup({
  capabilities,
  size = "sm",
  showLabels = false,
  maxDisplay,
  className,
}: CapabilityBadgeGroupProps) {
  const activeBadges: CapabilityType[] = [];

  // Determine which badges to show based on capabilities
  if (capabilities.toolCalling) activeBadges.push("toolCalling");
  if (capabilities.codeGeneration) activeBadges.push("codeGeneration");
  if (capabilities.longContext) activeBadges.push("longContext");
  if (
    capabilities.multilingual === "excellent" ||
    capabilities.multilingual === "good"
  ) {
    activeBadges.push("multilingual");
  }
  if (capabilities.complexReasoning) activeBadges.push("complexReasoning");
  if (capabilities.structuredOutput) activeBadges.push("structuredOutput");

  const displayBadges = maxDisplay
    ? activeBadges.slice(0, maxDisplay)
    : activeBadges;
  const remaining = maxDisplay ? activeBadges.length - maxDisplay : 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {displayBadges.map((badge) => (
        <CapabilityBadge
          key={badge}
          type={badge}
          size={size}
          showLabel={showLabels}
        />
      ))}
      {remaining > 0 && (
        <span className="text-xs text-muted-foreground">+{remaining}</span>
      )}
    </div>
  );
}
