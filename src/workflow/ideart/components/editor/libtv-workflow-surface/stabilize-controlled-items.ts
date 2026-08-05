export type ControlledItem = { id: string }

/**
 * Preserves both item and array identity when a controlled canvas payload is
 * semantically unchanged. React Flow's StoreUpdater treats a new array as a
 * store write, so this guard prevents render/store feedback loops.
 */
export function stabilizeControlledItems<T extends ControlledItem>(
  currentItems: T[],
  nextItems: T[],
  areEqual: (currentItem: T, nextItem: T) => boolean,
) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  let changed = currentItems.length !== nextItems.length
  const stableItems = nextItems.map((nextItem, index) => {
    const currentItem = currentById.get(nextItem.id)
    if (currentItems[index]?.id !== nextItem.id) changed = true
    if (currentItem && areEqual(currentItem, nextItem)) return currentItem
    changed = true
    return nextItem
  })
  return changed ? stableItems : currentItems
}
