"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type CodexModelOption = {
  id: string;
  name?: string;
  owned_by?: string;
};

export type CodexModelsResponse = {
  models?: CodexModelOption[];
  configured_model?: string;
  provider?: string;
  warning?: string;
};

type CodexModelPickerProps = {
  value: string;
  models: CodexModelOption[];
  loading?: boolean;
  warning?: string;
  disabled?: boolean;
  onChange: (model: string) => void;
  onRefresh?: () => void;
};

function normalizeModelOption(value: unknown): CodexModelOption | null {
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id || item.model || item.name || "").trim();
  if (!id) return null;
  const name = String(item.name || "").trim();
  const ownedBy = String(item.owned_by || item.ownedBy || "").trim();
  return {
    id,
    ...(name && name !== id ? { name } : {}),
    ...(ownedBy ? { owned_by: ownedBy } : {}),
  };
}

export function normalizeCodexModelOptions(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return source.reduce<CodexModelOption[]>((result, item) => {
    const option = normalizeModelOption(item);
    if (!option || seen.has(option.id)) return result;
    seen.add(option.id);
    result.push(option);
    return result;
  }, []);
}

function modelSearchText(option: CodexModelOption) {
  return [option.id, option.name || "", option.owned_by || ""]
    .join(" ")
    .toLowerCase();
}

function modelButtonLabel(value: string) {
  return value.trim() || "选择模型";
}

export function CodexModelPicker({
  value,
  models,
  loading = false,
  warning = "",
  disabled = false,
  onChange,
  onRefresh,
}: CodexModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return models;
    return models.filter((option) =>
      modelSearchText(option).includes(normalizedQuery),
    );
  }, [models, query]);

  return (
    <div ref={rootRef} className="zaomeng-codex-model-picker">
      <button
        type="button"
        title={value ? "当前模型：" + value : "选择模型"}
        aria-label={value ? "当前模型：" + value : "选择模型"}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={"zaomeng-codex-model-trigger " + (open ? "active" : "")}
      >
        {loading && !value ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <SlidersHorizontal
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={1.8}
          />
        )}
        <span className="zaomeng-codex-model-trigger-label">
          {modelButtonLabel(value)}
        </span>
        <ChevronDown
          className="h-3 w-3 shrink-0 opacity-70"
          strokeWidth={1.8}
        />
      </button>

      {open ? (
        <div
          className="zaomeng-codex-model-popover"
          role="dialog"
          aria-label="选择模型"
        >
          <div className="zaomeng-codex-model-popover-header">
            <div className="min-w-0">
              <strong>模型</strong>
            </div>
            {onRefresh ? (
              <button
                type="button"
                title="刷新模型列表"
                aria-label="刷新模型列表"
                disabled={loading}
                onClick={onRefresh}
                className="zaomeng-codex-model-refresh"
              >
                <RefreshCw
                  className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")}
                />
              </button>
            ) : null}
          </div>
          <label className="zaomeng-codex-model-search">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模型"
              aria-label="搜索模型"
            />
          </label>
          {warning ? (
            <p className="zaomeng-codex-model-warning">{warning}</p>
          ) : null}
          <div
            className="zaomeng-codex-model-list"
            role="listbox"
            aria-label="模型列表"
          >
            {loading && !models.length ? (
              <div className="zaomeng-codex-model-empty">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在读取模型列表</span>
              </div>
            ) : filteredModels.length ? (
              filteredModels.map((option) => {
                const selected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={option.id}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                    className={
                      "zaomeng-codex-model-option " +
                      (selected ? "selected" : "")
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="zaomeng-codex-model-option-name">
                        {option.name || option.id}
                      </span>
                      {option.name && option.name !== option.id ? (
                        <span className="zaomeng-codex-model-option-id">
                          {option.id}
                        </span>
                      ) : option.owned_by ? (
                        <span className="zaomeng-codex-model-option-id">
                          {option.owned_by}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0" strokeWidth={2} />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="zaomeng-codex-model-empty">
                <span>
                  {query ? "没有匹配的模型" : "当前服务未返回可用模型"}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
