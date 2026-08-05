export interface StoryboardFileMetadataLike {
  storyboardRole?: string | null
  storyboardShotNo?: number | null
  storyboardExport?: boolean
  amazonSlotType?: string | null
  amazonSlotIndex?: number | null
}

export interface GeneratedFileOrderItem {
  fileType?: string | null
  createdAt?: string | Date | null
  metadata?: StoryboardFileMetadataLike | null
}

function getTimeValue(value: string | Date | null | undefined): number {
  if (!value) return 0
  const ts = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function getStoryboardRank(item: GeneratedFileOrderItem): number {
  const role = String(item.metadata?.storyboardRole || '').trim().toLowerCase()
  if (role === 'character_reference') return 0
  if (role === 'storyboard_frame') return 1
  if (item.metadata?.storyboardExport || String(item.fileType || '').trim().toLowerCase() === 'html') return 3
  if (String(item.fileType || '').trim().toLowerCase() === 'image') return 2
  if (String(item.fileType || '').trim().toLowerCase() === 'video') return 4
  if (String(item.fileType || '').trim().toLowerCase() === '3d') return 5
  return 6
}

function getStoryboardShotNo(item: GeneratedFileOrderItem): number {
  const raw = Number(item.metadata?.storyboardShotNo)
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY
  return Math.floor(raw)
}

function getAmazonSlotRank(item: GeneratedFileOrderItem): number {
  const slotType = String(item.metadata?.amazonSlotType || '').trim().toLowerCase()
  if (!slotType) return Number.POSITIVE_INFINITY
  if (slotType === 'main') return 0
  if (slotType === 'angle') return 1
  if (slotType === 'detail') return 2
  if (slotType === 'lifestyle') return 3
  if (slotType === 'infographic') return 4
  if (slotType === 'size') return 5
  if (slotType === 'package') return 6
  if (slotType === 'a_plus') return 7
  return 8
}

function getAmazonSlotIndex(item: GeneratedFileOrderItem): number {
  const raw = Number(item.metadata?.amazonSlotIndex)
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY
  return Math.floor(raw)
}

export function sortGeneratedFilesForDisplay<T extends GeneratedFileOrderItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = getStoryboardRank(a) - getStoryboardRank(b)
    if (rankDiff !== 0) return rankDiff

    const shotDiff = getStoryboardShotNo(a) - getStoryboardShotNo(b)
    if (shotDiff !== 0) return shotDiff

     const amazonRankDiff = getAmazonSlotRank(a) - getAmazonSlotRank(b)
     if (amazonRankDiff !== 0) return amazonRankDiff

     const amazonIndexDiff = getAmazonSlotIndex(a) - getAmazonSlotIndex(b)
     if (amazonIndexDiff !== 0) return amazonIndexDiff

    return getTimeValue(b.createdAt) - getTimeValue(a.createdAt)
  })
}
