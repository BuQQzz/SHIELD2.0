import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ExternalLink, Check } from "lucide-react";
import { useState, useEffect } from "react";

interface HuggingFaceTokenInputProps {
  token?: string;
  onSave: (token: string | undefined) => void;
}

export function HuggingFaceTokenInput({
  token,
  onSave,
}: HuggingFaceTokenInputProps) {
  const [inputValue, setInputValue] = useState(token || "");
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync token to download service when prop changes
  useEffect(() => {
    const syncToken = async () => {
      try {
        await window.electronAPI.modelDownload.setHfToken(token || undefined);
      } catch (error) {
        console.error("Failed to sync HF token:", error);
      }
    };
    syncToken();
  }, [token]);

  const handleSave = () => {
    const tokenToSave = inputValue.trim() || undefined;
    onSave(tokenToSave);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setInputValue("");
    onSave(undefined);
  };

  const openTokenPage = () => {
    window.electronAPI.system.openExternal(
      "https://huggingface.co/settings/tokens"
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label htmlFor="hf-token">HuggingFace Token</Label>
        <Button
          variant="link"
          size="sm"
          onClick={openTokenPage}
          className="h-auto p-0 text-xs"
        >
          Get token <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="hf-token"
            type={showToken ? "text" : "password"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          >
            {showToken ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={inputValue === (token || "")}
          className="shrink-0"
        >
          {saved ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
        {token && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="shrink-0"
          >
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Required for downloading gated models like Meta Llama. Your token is
        stored locally and never sent anywhere except to HuggingFace.
      </p>
    </div>
  );
}
