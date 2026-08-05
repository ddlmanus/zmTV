"use client"

import { useCallback, useEffect, useState } from "react"
import { loadWorkflowModels } from "@/workflow/ideart/lib/wavespeed/workflow-runtime"

export interface DynamicModel {
  id: string
  runtimeId?: string
  modelId?: string
  name: string
  isDefault?: boolean
  isPro?: boolean
  category: string
  provider?: string
  providerKey?: string
  providerType?: "official" | "relay" | "custom"
  providerLabel?: string
  icon?: string
  description?: string
  badge?: string
  speed?: string
  cost?: number
  imageCost?: number | null
  videoCost?: number | null
  threeDCost?: number | null
  billing?: {
    isFree?: boolean
    defaultResolution?: string
    defaultQuality?: string
    resolutionRates?: Record<string, number | string>
    qualityResolutionRates?: Record<string, Record<string, number | string> | unknown>
  }
  parameters?: {
    aspectRatios?: { id: string; label: string; config?: any }[]
    resolutions?: { id: string; label: string; config?: any; badge?: string }[]
    durations?: { id: string; label: string; config?: any }[]
    counts?: { id: string; label: string; config?: any }[]
    qualities?: { id: string; label: string; config?: any }[]
    modes?: { id: string; label: string; config?: any }[]
    methods?: { id: string; label: string; config?: any }[]
    modelFamily?: "kling" | "vidu" | "veo" | "hailuo" | "doubao" | "jimeng" | "generic"
    extraParameters?: Array<{
      type: string
      label: string
      control?: "select" | "boolean" | "text" | "number"
      placeholder?: string
      defaultValue?: string | number | boolean
      config?: any
      options?: { id: string; label: string; badge?: string; config?: any }[]
    }>
    supportsFirstFrame?: boolean
    supportsEndFrame?: boolean
    supportsMotionControl?: boolean
    supportsAudio?: boolean
    supportsCameraControl?: boolean
    supportsStyles?: boolean
    supportsExtend?: boolean
    supportsReferenceImages?: boolean
    supportsVideoEdit?: boolean
    supportsAssetLibrary?: boolean
    supportsVoiceLibrary?: boolean
    supportsSound?: boolean
    defaultSound?: boolean
    supportsReferenceAudio?: boolean
    supportsWebSearch?: boolean
    defaultWebSearch?: boolean
    supportsPromptMentions?: boolean
    supportsReferenceVideo?: boolean
    supportsVideoInput?: boolean
    supportsAssetUrls?: boolean
    supportsSubjectReference?: boolean
    isViduQ3Family?: boolean
    multiShot?: boolean
    maxReferenceImages?: number
  }
}

interface UseModelsResult {
  models: DynamicModel[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

type ModelsCacheEntry = {
  models: DynamicModel[]
  expiresAt: number
}

const MODELS_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000
const MODELS_CACHE_KEY = "current-api-service"
const modelsCacheByKey = new Map<string, ModelsCacheEntry>()
const inFlightModelsByKey = new Map<string, Promise<DynamicModel[]>>()
let lastSuccessfulModelsSnapshot: DynamicModel[] | null = null

function getCachedModels(cacheKey: string): DynamicModel[] | null {
  const cached = modelsCacheByKey.get(cacheKey)
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached.models
}

function getLastSuccessfulCachedModels(): DynamicModel[] | null {
  return lastSuccessfulModelsSnapshot
}

function getBestCachedModels(cacheKey: string): DynamicModel[] | null {
  return getCachedModels(cacheKey) || getLastSuccessfulCachedModels()
}

async function requestModels(cacheKey: string, force = false): Promise<DynamicModel[]> {
  const now = Date.now()
  if (!force) {
    const cached = modelsCacheByKey.get(cacheKey)
    if (cached && cached.expiresAt > now) return cached.models
  }

  const inFlight = inFlightModelsByKey.get(cacheKey)
  if (inFlight) return inFlight

  const promise = loadWorkflowModels(force).then((models) => {
    modelsCacheByKey.set(cacheKey, {
      models,
      expiresAt: Date.now() + MODELS_CLIENT_CACHE_TTL_MS,
    })
    if (models.length > 0) lastSuccessfulModelsSnapshot = models
    return models
  })
  inFlightModelsByKey.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    inFlightModelsByKey.delete(cacheKey)
  }
}

export function preloadModels(_session?: unknown, options?: { force?: boolean }): Promise<DynamicModel[]> {
  const cached = !options?.force ? getCachedModels(MODELS_CACHE_KEY) : null
  if (cached) return Promise.resolve(cached)
  return requestModels(MODELS_CACHE_KEY, Boolean(options?.force))
}

export function useModels(): UseModelsResult {
  const [models, setModels] = useState<DynamicModel[]>(() => getBestCachedModels(MODELS_CACHE_KEY) || [])
  const [isLoading, setIsLoading] = useState(() => !getCachedModels(MODELS_CACHE_KEY))
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async (force = false) => {
    const cached = force ? null : getCachedModels(MODELS_CACHE_KEY)
    if (cached) {
      setModels(cached)
      setError(null)
      setIsLoading(false)
      return
    }

    const fallbackCached = getLastSuccessfulCachedModels()
    if (fallbackCached && !force) {
      setModels(fallbackCached)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    setError(null)
    try {
      const nextModels = await requestModels(MODELS_CACHE_KEY, force)
      setModels(nextModels.length > 0 ? nextModels : getLastSuccessfulCachedModels() || nextModels)
    } catch (err: any) {
      console.error("[useModels] Error:", err)
      setError(err?.message || "Failed to fetch models")
      setModels(getLastSuccessfulCachedModels() || [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchModels(false)
  }, [fetchModels])

  useEffect(() => {
    if (typeof window === "undefined") return
    const refreshFromServer = () => {
      void fetchModels(false)
    }
    window.addEventListener("focus", refreshFromServer)
    return () => {
      window.removeEventListener("focus", refreshFromServer)
    }
  }, [fetchModels])

  const refetch = useCallback(() => {
    void fetchModels(true)
  }, [fetchModels])

  return { models, isLoading, error, refetch }
}
