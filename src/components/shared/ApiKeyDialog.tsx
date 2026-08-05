import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiKeyStore } from "@/stores/apiKeyStore";

/**
 * API key gate used only when an operation is about to call a paid model.
 * Browsing the app and loading the model catalog never opens this dialog.
 */
export function ApiKeyDialog() {
  const { t } = useTranslation();
  const { apiKey, isPromptOpen, isValidating, setApiKey, resolveApiKeyPrompt } =
    useApiKeyStore();
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isPromptOpen) {
      setInputKey(apiKey || "");
      setShowKey(false);
      setError("");
    }
  }, [apiKey, isPromptOpen]);

  const handleSave = async () => {
    const value = inputKey.trim();
    if (!value || isValidating) return;

    setError("");
    const valid = await setApiKey(value);
    if (!valid) {
      setError(
        useApiKeyStore.getState().validationError ||
          t("settings.apiKey.invalidDesc"),
      );
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isValidating) resolveApiKeyPrompt(false);
  };

  return (
    <Dialog open={isPromptOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("apiKeyRequired.title")}
          </DialogTitle>
          <DialogDescription>
            {t("apiKeyRequired.defaultDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="run-api-key">{t("settings.apiKey.label")}</Label>
          <div className="relative">
            <Input
              id="run-api-key"
              type={showKey ? "text" : "password"}
              value={inputKey}
              onChange={(event) => {
                setInputKey(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSave();
              }}
              placeholder={t("settings.apiKey.placeholder")}
              className="pr-10"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowKey((value) => !value)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => resolveApiKeyPrompt(false)}
            disabled={isValidating}
          >
            {t("common.cancel", "取消")}
          </Button>
          <Button
            className="gradient-bg hover:opacity-90"
            onClick={() => void handleSave()}
            disabled={isValidating || !inputKey.trim()}
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("settings.apiKey.validating")}
              </>
            ) : (
              t("settings.apiKey.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
