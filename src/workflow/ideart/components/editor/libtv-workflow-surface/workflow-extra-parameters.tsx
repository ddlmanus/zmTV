"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover"

export type WorkflowExtraParameterOption = {
  id?: string
  label?: string
  isDefault?: boolean
  config?: Record<string, any>
}

export type WorkflowExtraParameterValue = string | number | boolean

export type WorkflowExtraParameterDefinition = {
  type: string
  label: string
  control?: "select" | "boolean" | "text" | "number"
  placeholder?: string
  defaultValue?: WorkflowExtraParameterValue
  config?: Record<string, any>
  options?: WorkflowExtraParameterOption[]
}

export type WorkflowExtraParameterContext = {
  modelId?: string
  prompt?: string
  referenceImageCount?: number
  managedValues?: Record<string, WorkflowExtraParameterValue>
}

const MIDJOURNEY_ADVANCED_PARAMETERS = new Set([
  "seed",
  "negative_prompt",
  "weird",
  "tile",
  "raw",
  "draft",
  "hd",
  "iw",
  "cref",
  "cw",
  "sref",
  "sw",
  "dref",
  "dw",
  "stop",
  "repeat",
  "extra",
])

const MIDJOURNEY_VERSION_RULES: Record<string, string[]> = {
  raw: ["5.1", "5.2", "6", "6.1", "7", "8.1", "8.2"],
  draft: ["7", "8.1", "8.2"],
  hd: ["8.1", "8.2"],
  stop: ["5", "5.1", "5.2", "6", "6.1"],
  cref: ["6", "6.1"],
  cw: ["6", "6.1"],
}

const MIDJOURNEY_PARAMETER_DEPENDENCIES: Record<string, string> = {
  cw: "cref",
  sw: "sref",
  dw: "dref",
}

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function hasOwnValue(values: Record<string, WorkflowExtraParameterValue> | undefined, key: string) {
  return Boolean(values && Object.prototype.hasOwnProperty.call(values, key))
}

function normalizeMidjourneyVersion(value: unknown) {
  return normalizeKey(value).replace(/^v/, "")
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value
  const normalized = normalizeKey(value)
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return undefined
}

function promptParameterValue(prompt: string, names: string[]) {
  const pattern = new RegExp(`(?:^|\\s)--(?:${names.join("|")})(?:\\s+|=)([^\\s]+)`, "gi")
  let value = ""
  for (const match of prompt.matchAll(pattern)) value = String(match[1] || "").replace(/^["']|["']$/g, "")
  return value.startsWith("--") ? "" : value
}

function promptHasParameter(prompt: string, name: string) {
  return new RegExp(`(?:^|\\s)--${name}(?=\\s|=|$)`, "i").test(prompt)
}

function isMidjourneyParameterContext(context?: WorkflowExtraParameterContext) {
  const identity = normalizeKey(context?.modelId)
  return identity.includes("midjourney") || /(^|[\s_-])niji([\s_-]|$)/i.test(identity)
}

function resolveEffectiveMidjourneyVersion(
  values: Record<string, WorkflowExtraParameterValue> | undefined,
  context?: WorkflowExtraParameterContext,
) {
  if (hasOwnValue(context?.managedValues, "version")) {
    return normalizeMidjourneyVersion(context?.managedValues?.version)
  }
  const selected = normalizeMidjourneyVersion(values?.version)
  if (selected) return selected
  const prompt = String(context?.prompt || "")
  return normalizeMidjourneyVersion(
    promptParameterValue(prompt, ["v", "version"])
      || promptParameterValue(prompt, ["niji"]),
  )
}

function resolveEffectiveMidjourneyNiji(
  values: Record<string, WorkflowExtraParameterValue> | undefined,
  context?: WorkflowExtraParameterContext,
) {
  if (hasOwnValue(context?.managedValues, "niji")) return booleanValue(context?.managedValues?.niji) === true
  const selected = booleanValue(values?.niji)
  if (selected !== undefined) return selected
  return promptHasParameter(String(context?.prompt || ""), "niji")
}

function contextualizeDefinition(
  definition: WorkflowExtraParameterDefinition,
  values: Record<string, WorkflowExtraParameterValue> | undefined,
  context?: WorkflowExtraParameterContext,
) {
  if (!isMidjourneyParameterContext(context) || definition.type !== "version") return definition
  const niji = resolveEffectiveMidjourneyNiji(values, context)
  const options = (definition.options || []).filter((option) => {
    const version = normalizeMidjourneyVersion(option.id)
    if (niji) return version === "7" || version === "6"
    return version !== "6"
  })
  return { ...definition, options }
}

function getDefinitionVersions(definition: WorkflowExtraParameterDefinition, isMidjourney: boolean) {
  const configured = Array.isArray(definition.config?.versions)
    ? definition.config.versions.map((value: unknown) => normalizeMidjourneyVersion(value)).filter(Boolean)
    : []
  if (configured.length > 0) return configured
  return isMidjourney ? (MIDJOURNEY_VERSION_RULES[definition.type] || []) : []
}

function definitionIsVisible(
  definition: WorkflowExtraParameterDefinition,
  values: Record<string, WorkflowExtraParameterValue> | undefined,
  context?: WorkflowExtraParameterContext,
) {
  const isMidjourney = isMidjourneyParameterContext(context)
  const managed = context?.managedValues
  const hideWhenManaged = definition.config?.hideWhenManaged === true
    || (isMidjourney && (definition.type === "version" || definition.type === "niji"))
  if (hideWhenManaged && hasOwnValue(managed, definition.type)) return false

  const versions = getDefinitionVersions(definition, isMidjourney)
  if (versions.length > 0) {
    const version = resolveEffectiveMidjourneyVersion(values, context)
    if (!version || !versions.includes(version)) return false
  }

  const requiresReferenceImages = definition.config?.requiresReferenceImages === true
    || (isMidjourney && definition.type === "iw")
  if (requiresReferenceImages) {
    const promptHasImage = /(?:^|\s)(?:https?:\/\/\S+|data:image\/)/i.test(String(context?.prompt || ""))
    if (Number(context?.referenceImageCount || 0) <= 0 && !promptHasImage) return false
  }

  const configuredDependency = normalizeKey(definition.config?.requiresParameter)
  const dependency = configuredDependency || (isMidjourney ? MIDJOURNEY_PARAMETER_DEPENDENCIES[definition.type] : "")
  if (dependency) {
    const dependencyValue = values?.[dependency] ?? managed?.[dependency]
    if (!String(dependencyValue ?? "").trim() && !promptHasParameter(String(context?.prompt || ""), dependency)) return false
  }
  return true
}

function definitionIsAdvanced(definition: WorkflowExtraParameterDefinition, context?: WorkflowExtraParameterContext) {
  const section = normalizeKey(definition.config?.section || definition.config?.group)
  if (section) return section === "advanced" || section === "reference" || section === "secondary"
  return isMidjourneyParameterContext(context) && MIDJOURNEY_ADVANCED_PARAMETERS.has(definition.type)
}

function supportsMethod(config: Record<string, any> | undefined, method: string) {
  const methods = Array.isArray(config?.methods) && config.methods.length > 0
    ? config.methods
    : config?.modes
  if (!Array.isArray(methods) || methods.length === 0 || !method) return true
  const normalizedMethod = normalizeKey(method)
  return methods.some((candidate) => normalizeKey(candidate) === normalizedMethod)
}

function normalizeControl(value: unknown): WorkflowExtraParameterDefinition["control"] {
  const control = normalizeKey(value)
  if (["boolean", "switch", "toggle", "checkbox"].includes(control)) return "boolean"
  if (["number", "numeric", "range", "slider"].includes(control)) return "number"
  if (["text", "input", "textarea"].includes(control)) return "text"
  return "select"
}

function resolveCompositeValue(value: unknown, parameter: string) {
  if (typeof value !== "string") return value
  const text = value.trim()
  if (!text.startsWith("{") || !text.endsWith("}")) return value
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidate = (parsed as Record<string, unknown>)[parameter]
      if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") return candidate
    }
  } catch {
    // Invalid JSON remains a regular string option.
  }
  return value
}

function normalizeOptionForParameter(option: WorkflowExtraParameterOption, parameter: string) {
  const resolved = resolveCompositeValue(option?.id, parameter)
  return { ...option, id: String(resolved ?? option?.id ?? "") }
}

function optionParameterKey(option: WorkflowExtraParameterOption) {
  const parameter = option?.config?.parameter
  return normalizeKey(parameter)
}

function optionLabel(option: WorkflowExtraParameterOption, fallback: string) {
  return String(option?.label || option?.id || fallback).trim() || fallback
}

/**
 * The API can return several payload controls under one `payload` parameter.
 * Split those option groups by their declared `config.parameter` so every
 * provider control is visible and can be persisted independently.
 */
export function normalizeWorkflowExtraParameterDefinitions(
  definitions: WorkflowExtraParameterDefinition[] | undefined,
  method = "",
) {
  const normalized: WorkflowExtraParameterDefinition[] = []
  for (const raw of definitions || []) {
    if (!supportsMethod(raw?.config, method)) continue
    const rawType = normalizeKey(raw?.type)
    const requestField = normalizeKey(raw?.config?.requestField || raw?.config?.request_field)
    const type = rawType === "payload" ? rawType : (requestField || rawType)
    if (!type || raw?.config?.hidden === true || raw?.config?.apiOnly === true) continue
    const options = Array.isArray(raw.options)
      ? raw.options.filter((option) => Boolean(option) && supportsMethod(option?.config, method))
      : []
    if (Array.isArray(raw.options) && raw.options.length > 0 && options.length === 0 && normalizeControl(raw.control) === "select") continue
    const grouped = new Map<string, WorkflowExtraParameterOption[]>()
    for (const option of options) {
      const key = optionParameterKey(option)
      if (!key) continue
      const current = grouped.get(key) || []
      current.push(option)
      grouped.set(key, current)
    }
    const splitGroups = grouped.size > 1 || (grouped.size === 1 && grouped.has(rawType) === false && rawType === "payload")
    if (splitGroups) {
      for (const [parameter, parameterOptions] of grouped) {
        const normalizedOptions = parameterOptions.map((option) => normalizeOptionForParameter(option, parameter))
        const first = normalizedOptions[0]
        const defaultOption = parameterOptions.find((item) => item.isDefault || item.config?.isDefault)
        const resolvedDefault = resolveCompositeValue(raw.defaultValue, parameter)
        normalized.push({
          ...raw,
          type: parameter,
          label: String(first?.config?.label || raw.label || parameter).trim() || parameter,
          control: normalizeControl(first?.config?.control || raw.control),
          defaultValue: (resolvedDefault ?? resolveCompositeValue(defaultOption?.id, parameter) ?? first?.id ?? "") as WorkflowExtraParameterValue,
          options: normalizedOptions,
        })
      }
      continue
    }
    const defaultOption = options.find((item) => item.isDefault || item.config?.isDefault)
    normalized.push({
      ...raw,
      type,
      label: String(raw.label || type).trim() || type,
      control: normalizeControl(raw.control),
      defaultValue: (raw.defaultValue ?? defaultOption?.id ?? "") as WorkflowExtraParameterValue,
      options,
    })
  }
  return normalized
}

function defaultValueFor(definition: WorkflowExtraParameterDefinition) {
  if (definition.defaultValue !== undefined && definition.defaultValue !== "") return definition.defaultValue
  const defaultOption = (definition.options || []).find((option) => option.isDefault || option.config?.isDefault)
  return String(defaultOption?.id || definition.options?.[0]?.id || "").trim()
}

/**
 * Resolve the initial values for a model's visible parameter definitions.
 * Keeping this in one place is important for model switches: a value from the
 * previous model must not leak into a control when it is no longer one of the
 * new model's options.
 */
export function getWorkflowExtraParameterDefaults(
  definitions: WorkflowExtraParameterDefinition[] | undefined,
): Record<string, WorkflowExtraParameterValue> {
  const result: Record<string, WorkflowExtraParameterValue> = {}
  for (const definition of normalizeWorkflowExtraParameterDefinitions(definitions)) {
    const fallback = defaultValueFor(definition)
    if (fallback === "" || fallback === undefined) continue
    if (definition.control === "boolean") {
      result[definition.type] = fallback === true || String(fallback).toLowerCase() === "true"
    } else if (definition.control === "number") {
      const number = Number(fallback)
      result[definition.type] = Number.isFinite(number) ? number : String(fallback)
    } else {
      result[definition.type] = fallback
    }
  }
  return result
}

/**
 * Keep only values that are valid for the supplied definitions and fill in
 * defaults for newly introduced controls. Select values are checked against
 * the model's option ids, while free-form text/number/boolean values remain
 * user-editable and are carried across a render.
 */
export function resolveWorkflowExtraParameterValues(
  definitions: WorkflowExtraParameterDefinition[] | undefined,
  values?: Record<string, WorkflowExtraParameterValue>,
  options?: { fillDefaults?: boolean },
): Record<string, WorkflowExtraParameterValue> {
  const normalizedDefinitions = normalizeWorkflowExtraParameterDefinitions(definitions)
  const defaults = options?.fillDefaults === false ? {} : getWorkflowExtraParameterDefaults(normalizedDefinitions)
  const result: Record<string, WorkflowExtraParameterValue> = {}
  for (const definition of normalizedDefinitions) {
    const current = values?.[definition.type]
    if (current === undefined) {
      if (defaults[definition.type] !== undefined) result[definition.type] = defaults[definition.type]
      continue
    }
    if (definition.control === "select") {
      const options = definition.options || []
      if (options.length > 0 && !options.some((option) => String(option.id || "") === String(current))) {
        if (defaults[definition.type] !== undefined) result[definition.type] = defaults[definition.type]
      } else {
        result[definition.type] = current
      }
    } else if (definition.control === "boolean") {
      result[definition.type] = current === true || String(current).toLowerCase() === "true"
    } else if (definition.control === "number") {
      const number = Number(current)
      result[definition.type] = Number.isFinite(number) ? number : (defaults[definition.type] ?? current)
    } else {
      result[definition.type] = current
    }
  }
  return result
}

/** Flatten composite JSON option values into provider request fields. */
export function flattenWorkflowExtraParameterValues(
  values?: Record<string, WorkflowExtraParameterValue>,
): Record<string, WorkflowExtraParameterValue> {
  const result: Record<string, WorkflowExtraParameterValue> = {}
  const blocked = new Set(["__proto__", "prototype", "constructor"])
  const assign = (keyValue: unknown, value: unknown) => {
    const key = String(keyValue || "").trim()
    if (!key || blocked.has(key.toLowerCase())) return
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return
    result[key] = value
  }
  Object.entries(values || {}).slice(0, 64).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim().startsWith("{") && value.trim().endsWith("}")) {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const entries = Object.entries(parsed).slice(0, 64)
          entries.forEach(([nestedKey, nestedValue]) => assign(nestedKey, nestedValue))
          if (entries.length > 0) return
        }
      } catch {
        // Keep invalid JSON as a regular string option.
      }
    }
    assign(key, value)
  })
  return result
}

function valueLabel(definition: WorkflowExtraParameterDefinition, value: WorkflowExtraParameterValue) {
  if (definition.control === "boolean") return value === true || String(value).toLowerCase() === "true" ? "开启" : "关闭"
  const option = (definition.options || []).find((item) => String(item.id || "") === String(value))
  return option ? optionLabel(option, String(value)) : String(value || "")
}

function ExtraSelect({
  definition,
  value,
  onChange,
  disabled = false,
}: {
  definition: WorkflowExtraParameterDefinition
  value: WorkflowExtraParameterValue
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const options = (definition.options || []).filter((option) => (
    String(option.id ?? "").trim() || String(option.label || "").trim()
  ))
  const selectedLabel = valueLabel(definition, value) || "请选择"
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || containerRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  const focusOption = (index: number) => {
    const boundedIndex = Math.max(0, Math.min(options.length - 1, index))
    optionRefs.current[boundedIndex]?.focus()
  }
  const focusSelectedOption = () => {
    const selectedIndex = options.findIndex((option) => String(option.id || "") === String(value))
    focusOption(selectedIndex >= 0 ? selectedIndex : 0)
  }
  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border-muted bg-bg-surface-secondary px-2.5 text-left text-[12px] text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onKeyDown={(event) => {
          if (disabled) return
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            closeMenu(true)
            return
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              window.requestAnimationFrame(() => focusOption(event.key === "ArrowUp" ? options.length - 1 : 0))
            } else {
              focusSelectedOption()
            }
          }
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (disabled) return
          setOpen((current) => !current)
        }}
      >
        <span className="min-w-0 truncate" title={selectedLabel}>{selectedLabel}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <WorkflowAnchoredPopover
          anchorRef={triggerRef}
          popoverRef={popupRef}
          side="bottom"
          align="end"
          gap={6}
          margin={12}
          heightLimit={200}
          id={listboxId}
          role="listbox"
          ariaLabel={definition.label}
          className="min-w-[120px] max-w-[min(280px,calc(100vw-24px))] rounded-xl border border-border-muted bg-[var(--workflow-node-popover-background,var(--Surface-secondary-background))] p-1.5 text-xs text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const optionValue = String(option.id || "")
            const selected = optionValue === String(value)
            const optionIndex = options.findIndex((item) => String(item.id || "") === optionValue)
            return (
              <button
                key={`${definition.type}:${optionValue}`}
                type="button"
                ref={(element) => {
                  optionRefs.current[optionIndex] = element
                }}
                role="option"
                aria-selected={selected}
                id={`${listboxId}-${optionIndex}`}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-canvas-controls-hover"
                onKeyDown={(event) => {
                  event.stopPropagation()
                  const currentIndex = optionRefs.current.indexOf(event.currentTarget)
                  if (event.key === "Escape") {
                    event.preventDefault()
                    closeMenu(true)
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault()
                    focusOption(Math.min(options.length - 1, currentIndex + 1))
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault()
                    focusOption(Math.max(0, currentIndex - 1))
                  } else if (event.key === "Home") {
                    event.preventDefault()
                    focusOption(0)
                  } else if (event.key === "End") {
                    event.preventDefault()
                    focusOption(options.length - 1)
                  } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    if (!disabled) {
                      onChange(optionValue)
                      closeMenu(true)
                    }
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  if (disabled) return
                  onChange(optionValue)
                  closeMenu()
                }}
              >
                <span className="min-w-0 truncate" title={optionLabel(option, optionValue)}>{optionLabel(option, optionValue)}</span>
                {selected ? <Check className="size-3.5 shrink-0 text-fg-default" /> : null}
              </button>
            )
          })}
        </WorkflowAnchoredPopover>
      ) : null}
    </div>
  )
}

export function WorkflowExtraParametersPanel({
  definitions,
  values,
  onChange,
  disabled = false,
  context,
}: {
  definitions: WorkflowExtraParameterDefinition[] | undefined
  values?: Record<string, WorkflowExtraParameterValue>
  onChange: (patch: Record<string, WorkflowExtraParameterValue>) => void
  disabled?: boolean
  context?: WorkflowExtraParameterContext
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const normalizedDefinitions = useMemo(() => normalizeWorkflowExtraParameterDefinitions(definitions), [definitions])
  const visibleDefinitions = normalizedDefinitions.filter((definition) => definitionIsVisible(definition, values, context))
  const primaryDefinitions = visibleDefinitions.filter((definition) => !definitionIsAdvanced(definition, context))
  const advancedDefinitions = visibleDefinitions.filter((definition) => definitionIsAdvanced(definition, context))
  if (visibleDefinitions.length === 0) return null
  const emitChange = (definition: WorkflowExtraParameterDefinition, nextValue: WorkflowExtraParameterValue) => {
    const patch: Record<string, WorkflowExtraParameterValue> = { [definition.type]: nextValue }
    if (isMidjourneyParameterContext(context) && definition.type === "niji") {
      const enabled = booleanValue(nextValue) === true
      const version = resolveEffectiveMidjourneyVersion(values, context)
      if (enabled && version !== "6" && version !== "7") patch.version = "7"
      if (!enabled && version === "6") patch.version = "7"
    }
    onChange(patch)
  }
  const renderDefinition = (definition: WorkflowExtraParameterDefinition) => {
    const contextualDefinition = contextualizeDefinition(definition, values, context)
    const managedValue = hasOwnValue(context?.managedValues, definition.type)
      ? context?.managedValues?.[definition.type]
      : undefined
    const rawValue = managedValue ?? values?.[definition.type]
    const value = rawValue === undefined ? defaultValueFor(definition) : rawValue
    const control = definition.control === "boolean" ? "boolean" : definition.control === "number" ? "number" : definition.control === "text" ? "text" : "select"
    const textRows = Math.max(2, Math.min(12, Number(definition.config?.rows || 4)))
    const multiline = control === "text" && (definition.config?.multiline === true || normalizeKey(definition.config?.control) === "textarea" || Number(definition.config?.rows) > 1)
    return (
      <div key={definition.type} className={`flex min-w-0 gap-2 ${multiline ? "flex-col items-stretch sm:col-span-2" : "items-center"}`}>
        <span className={`${multiline ? "max-w-full" : "max-w-[42%]"} shrink-0 truncate text-[12px] text-fg-muted`} title={definition.label}>{definition.label}</span>
        {control === "boolean" ? (
          <button
            type="button"
            role="switch"
            aria-checked={value === true || String(value).toLowerCase() === "true"}
            disabled={disabled}
            className={`ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${value === true || String(value).toLowerCase() === "true" ? "bg-[var(--btn-invert-bg)]" : "bg-canvas-controls-active"}`}
            onClick={(event) => {
              event.stopPropagation()
              emitChange(definition, !(value === true || String(value).toLowerCase() === "true"))
            }}
          >
            <span className={`block size-4 rounded-full shadow transition-transform ${value === true || String(value).toLowerCase() === "true" ? "translate-x-4 bg-[var(--btn-invert-text)]" : "translate-x-0.5 bg-fg-muted"}`} />
          </button>
        ) : multiline ? (
          <textarea
            value={String(value ?? "")}
            placeholder={definition.placeholder || "请输入"}
            disabled={disabled}
            rows={textRows}
            maxLength={Number(definition.config?.maxLength) || undefined}
            className="min-h-20 w-full resize-y rounded-lg border border-border-muted bg-bg-surface-secondary px-2.5 py-2 font-mono text-[11px] leading-5 text-fg-default outline-none transition-colors placeholder:font-sans placeholder:text-fg-subtle focus:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-45"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => emitChange(definition, event.target.value)}
          />
        ) : control === "text" ? (
          <input
            type="text"
            value={String(value ?? "")}
            placeholder={definition.placeholder || "请输入"}
            disabled={disabled}
            maxLength={Number(definition.config?.maxLength) || undefined}
            className="ml-auto h-8 min-w-0 flex-1 rounded-lg border border-border-muted bg-bg-surface-secondary px-2.5 text-[12px] text-fg-default outline-none transition-colors placeholder:text-fg-subtle focus:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-45"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => emitChange(definition, event.target.value)}
          />
        ) : control === "number" ? (
          <input
            type="number"
            value={String(value ?? "")}
            min={definition.config?.min}
            max={definition.config?.max}
            step={definition.config?.step}
            placeholder={definition.placeholder || "请输入"}
            disabled={disabled}
            className="ml-auto h-8 min-w-0 flex-1 rounded-lg border border-border-muted bg-bg-surface-secondary px-2.5 text-[12px] text-fg-default outline-none transition-colors placeholder:text-fg-subtle focus:border-border-emphasis disabled:cursor-not-allowed disabled:opacity-45"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => emitChange(definition, event.target.value === "" ? "" : Number(event.target.value))}
          />
        ) : (
          <ExtraSelect definition={contextualDefinition} value={value} disabled={disabled} onChange={(next) => emitChange(definition, next)} />
        )}
      </div>
    )
  }
  return (
    <div className="mt-3 border-t border-border-muted pt-3" data-testid="workflow-extra-parameters">
      {primaryDefinitions.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {primaryDefinitions.map(renderDefinition)}
        </div>
      ) : null}
      {advancedDefinitions.length > 0 ? (
        <div className={primaryDefinitions.length > 0 ? "mt-2 border-t border-border-muted pt-2" : ""}>
          <button
            type="button"
            className="flex h-8 w-full items-center justify-between text-[12px] text-fg-muted transition-colors hover:text-fg-default"
            aria-expanded={advancedOpen}
            onClick={(event) => {
              event.stopPropagation()
              setAdvancedOpen((current) => !current)
            }}
          >
            <span>高级参数</span>
            <span className="flex items-center gap-1.5 text-fg-subtle">
              {advancedDefinitions.length}
              <ChevronDown className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {advancedOpen ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {advancedDefinitions.map(renderDefinition)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
