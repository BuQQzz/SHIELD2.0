import type { ReactNode } from "react";

interface FeatureItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5 text-primary">{icon}</div>
      <div>
        <h4 className="text-sm font-medium mb-1">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

interface KeyboardShortcutProps {
  keys: string[];
  description: string;
}

export function KeyboardShortcut({ keys, description }: KeyboardShortcutProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, index) => (
          <kbd
            key={index}
            className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border rounded"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

interface PrivacyCheckItemProps {
  label: string;
}

export function PrivacyCheckItem({ label }: PrivacyCheckItemProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-green-500">✓</span>
      <span>{label}</span>
    </div>
  );
}

interface ShortcutItemProps {
  shortcut: string;
  description: string;
}

export function ShortcutItem({ shortcut, description }: ShortcutItemProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{description}</span>
      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
        {shortcut}
      </kbd>
    </div>
  );
}

interface SettingExplanationProps {
  title: string;
  description: string;
}

export function SettingExplanation({
  title,
  description,
}: SettingExplanationProps) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
