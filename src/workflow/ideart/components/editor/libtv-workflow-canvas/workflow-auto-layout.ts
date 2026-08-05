export type WorkflowAutoLayoutNode = {
    id: string
    kind: string
    x: number
    y: number
    width: number
    height: number
    parentId?: string
    data?: { groupNodeIds?: string[] }
}

export type WorkflowAutoLayoutEdge = { source: string; target: string }
export type WorkflowAutoLayoutPatch = {
    id: string
    position: { x: number; y: number; width?: number; height?: number }
}

type LayoutItem = WorkflowAutoLayoutNode & { width: number; height: number }
type LayoutPosition = { x: number; y: number }

const GROUP_PADDING = 44
const COMPONENT_GAP = 220

function safeSize(value: unknown, fallback: number) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : fallback
}

function snap(value: number) {
    return Math.round(value / 4) * 4
}

function stableOrder(a: LayoutItem, b: LayoutItem) {
    return Number(a.y || 0) - Number(b.y || 0)
        || Number(a.x || 0) - Number(b.x || 0)
        || a.id.localeCompare(b.id)
}

function getBounds(items: LayoutItem[], positions: Map<string, LayoutPosition>) {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    items.forEach((item) => {
        const position = positions.get(item.id) || { x: 0, y: 0 }
        minX = Math.min(minX, position.x)
        minY = Math.min(minY, position.y)
        maxX = Math.max(maxX, position.x + item.width)
        maxY = Math.max(maxY, position.y + item.height)
    })
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 0, height: 0 }
    return { minX, minY, width: maxX - minX, height: maxY - minY }
}

function layoutGrid(items: LayoutItem[], columnGap: number, rowGap: number) {
    const positions = new Map<string, LayoutPosition>()
    const ordered = [...items].sort(stableOrder)
    if (ordered.length === 0) return positions
    const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length * 1.35)))
    const rows = Math.ceil(ordered.length / columns)
    const widths = Array.from({ length: columns }, () => 0)
    const heights = Array.from({ length: rows }, () => 0)
    ordered.forEach((item, index) => {
        widths[index % columns] = Math.max(widths[index % columns], item.width)
        heights[Math.floor(index / columns)] = Math.max(heights[Math.floor(index / columns)], item.height)
    })
    const xs = widths.map((_width, index) => widths.slice(0, index).reduce((sum, width) => sum + width + columnGap, 0))
    const ys = heights.map((_height, index) => heights.slice(0, index).reduce((sum, height) => sum + height + rowGap, 0))
    ordered.forEach((item, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        positions.set(item.id, {
            x: xs[column] + (widths[column] - item.width) / 2,
            y: ys[row] + (heights[row] - item.height) / 2,
        })
    })
    return positions
}

function layoutComponent(items: LayoutItem[], edges: WorkflowAutoLayoutEdge[], columnGap: number, rowGap: number) {
    const itemById = new Map(items.map((item) => [item.id, item]))
    const outgoing = new Map(items.map((item) => [item.id, [] as string[]]))
    const incoming = new Map(items.map((item) => [item.id, [] as string[]]))
    edges.forEach((edge) => {
        if (!itemById.has(edge.source) || !itemById.has(edge.target) || edge.source === edge.target) return
        outgoing.get(edge.source)?.push(edge.target)
        incoming.get(edge.target)?.push(edge.source)
    })

    // Longest-path ranking makes the main workflow read naturally left-to-right.
    const indegree = new Map(items.map((item) => [item.id, incoming.get(item.id)?.length || 0]))
    const rank = new Map(items.map((item) => [item.id, 0]))
    const queue = [...items].sort(stableOrder).filter((item) => indegree.get(item.id) === 0).map((item) => item.id)
    const visited = new Set<string>()
    while (queue.length > 0) {
        const source = queue.shift()!
        visited.add(source)
        ;(outgoing.get(source) || []).forEach((target) => {
            rank.set(target, Math.max(rank.get(target) || 0, (rank.get(source) || 0) + 1))
            indegree.set(target, (indegree.get(target) || 0) - 1)
            if (indegree.get(target) === 0) queue.push(target)
        })
    }
    // Cycles cannot be topologically ranked. Keep their current horizontal order
    // instead of allowing repeated relaxation to stretch the canvas indefinitely.
    const cyclic = items.filter((item) => !visited.has(item.id)).sort((a, b) => a.x - b.x || stableOrder(a, b))
    cyclic.forEach((item, index) => rank.set(item.id, Math.max(rank.get(item.id) || 0, index)))

    const maxRank = Math.max(0, ...rank.values())
    const ranks = Array.from({ length: maxRank + 1 }, () => [] as LayoutItem[])
    items.forEach((item) => ranks[rank.get(item.id) || 0].push(item))
    ranks.forEach((column) => column.sort(stableOrder))
    // Reorder each column around the average position of its neighbors to reduce crossings.
    for (let sweep = 0; sweep < 4; sweep += 1) {
        const forward = sweep % 2 === 0
        const indexes = forward
            ? Array.from({ length: maxRank }, (_value, index) => index + 1)
            : Array.from({ length: maxRank }, (_value, index) => maxRank - index - 1)
        indexes.forEach((columnIndex) => {
            const neighborColumn = ranks[forward ? columnIndex - 1 : columnIndex + 1]
            const neighborIndex = new Map(neighborColumn.map((item, index) => [item.id, index]))
            const score = (item: LayoutItem) => {
                const values = (forward ? incoming.get(item.id) : outgoing.get(item.id) || [])
                    ?.map((id) => neighborIndex.get(id))
                    .filter((value): value is number => value !== undefined) || []
                return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY
            }
            ranks[columnIndex].sort((a, b) => score(a) - score(b) || stableOrder(a, b))
        })
    }

    const widths = ranks.map((column) => Math.max(0, ...column.map((item) => item.width)))
    const heights = ranks.map((column) => column.reduce((sum, item) => sum + item.height, 0) + Math.max(0, column.length - 1) * rowGap)
    const maxHeight = Math.max(0, ...heights)
    const positions = new Map<string, LayoutPosition>()
    let x = 0
    ranks.forEach((column, columnIndex) => {
        let y = (maxHeight - heights[columnIndex]) / 2
        column.forEach((item) => {
            positions.set(item.id, { x: x + (widths[columnIndex] - item.width) / 2, y })
            y += item.height + rowGap
        })
        x += widths[columnIndex] + columnGap
    })
    return positions
}

function layoutGraph(items: LayoutItem[], edges: WorkflowAutoLayoutEdge[], columnGap: number, rowGap: number) {
    if (items.length <= 1) return new Map(items.map((item) => [item.id, { x: 0, y: 0 }]))
    const ids = new Set(items.map((item) => item.id))
    const validEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    if (validEdges.length === 0) return layoutGrid(items, columnGap, rowGap)

    const neighbors = new Map(items.map((item) => [item.id, new Set<string>()]))
    validEdges.forEach((edge) => {
        neighbors.get(edge.source)?.add(edge.target)
        neighbors.get(edge.target)?.add(edge.source)
    })
    const itemById = new Map(items.map((item) => [item.id, item]))
    const unseen = new Set(ids)
    const components: LayoutItem[][] = []
    while (unseen.size > 0) {
        const first = unseen.values().next().value as string
        const component: LayoutItem[] = []
        const queue = [first]
        unseen.delete(first)
        while (queue.length > 0) {
            const id = queue.shift()!
            component.push(itemById.get(id)!)
            ;(neighbors.get(id) || []).forEach((neighbor) => {
                if (!unseen.delete(neighbor)) return
                queue.push(neighbor)
            })
        }
        components.push(component)
    }
    components.sort((a, b) => b.length - a.length || stableOrder(a[0], b[0]))

    const positions = new Map<string, LayoutPosition>()
    let yOffset = 0
    components.forEach((component) => {
        const componentIds = new Set(component.map((item) => item.id))
        const componentEdges = validEdges.filter((edge) => componentIds.has(edge.source) && componentIds.has(edge.target))
        const local = component.length === 1
            ? new Map([[component[0].id, { x: 0, y: 0 }]])
            : layoutComponent(component, componentEdges, columnGap, rowGap)
        const bounds = getBounds(component, local)
        component.forEach((item) => {
            const position = local.get(item.id)!
            positions.set(item.id, { x: position.x - bounds.minX, y: position.y - bounds.minY + yOffset })
        })
        yOffset += bounds.height + COMPONENT_GAP
    })
    return positions
}

export function buildWorkflowAutoLayoutPatches({ nodes, edges }: {
    nodes: WorkflowAutoLayoutNode[]
    edges: WorkflowAutoLayoutEdge[]
}): WorkflowAutoLayoutPatch[] {
    if (nodes.length === 0) return []
    const normalized = nodes.map((node) => ({
        ...node,
        width: safeSize(node.width, node.kind === "group" ? 520 : 320),
        height: safeSize(node.height, node.kind === "group" ? 360 : 220),
    }))
    const nodeById = new Map(normalized.map((node) => [node.id, node]))
    const groups = normalized.filter((node) => node.kind === "group")
    const groupIds = new Set(groups.map((node) => node.id))
    const memberOwner = new Map<string, string>()
    normalized.forEach((node) => {
        if (node.kind !== "group" && node.parentId && groupIds.has(node.parentId)) memberOwner.set(node.id, node.parentId)
    })
    groups.forEach((group) => {
        ;(group.data?.groupNodeIds || []).forEach((id) => {
            if (nodeById.get(id)?.kind !== "group" && !memberOwner.has(id)) memberOwner.set(id, group.id)
        })
    })

    const innerPositions = new Map<string, Map<string, LayoutPosition>>()
    const groupFrames = new Map<string, { width: number; height: number }>()
    groups.forEach((group) => {
        const members = normalized.filter((node) => memberOwner.get(node.id) === group.id)
        if (members.length === 0) {
            groupFrames.set(group.id, { width: group.width, height: group.height })
            return
        }
        const memberIds = new Set(members.map((node) => node.id))
        const positions = layoutGraph(members, edges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target)), 96, 56)
        const bounds = getBounds(members, positions)
        const padded = new Map<string, LayoutPosition>()
        members.forEach((member) => {
            const position = positions.get(member.id)!
            padded.set(member.id, { x: position.x - bounds.minX + GROUP_PADDING, y: position.y - bounds.minY + GROUP_PADDING })
        })
        innerPositions.set(group.id, padded)
        groupFrames.set(group.id, {
            width: Math.max(group.width, bounds.width + GROUP_PADDING * 2),
            height: Math.max(group.height, bounds.height + GROUP_PADDING * 2),
        })
    })

    const entities = normalized
        .filter((node) => node.kind === "group" || !memberOwner.has(node.id))
        .map((node) => ({ ...node, ...(groupFrames.get(node.id) || {}) }))
    const entityIds = new Set(entities.map((entity) => entity.id))
    const entityFor = (id: string) => memberOwner.get(id) || (entityIds.has(id) ? id : "")
    const entityEdgeKeys = new Set<string>()
    const entityEdges = edges.flatMap((edge) => {
        const source = entityFor(edge.source)
        const target = entityFor(edge.target)
        const key = `${source}->${target}`
        if (!source || !target || source === target || entityEdgeKeys.has(key)) return []
        entityEdgeKeys.add(key)
        return [{ source, target }]
    })
    const positions = layoutGraph(entities, entityEdges, 190, 88)
    const bounds = getBounds(entities, positions)
    const originX = Math.min(...entities.map((entity) => Number(entity.x || 0)))
    const originY = Math.min(...entities.map((entity) => Number(entity.y || 0)))
    const absolute = new Map<string, LayoutPosition>()
    entities.forEach((entity) => {
        const position = positions.get(entity.id) || { x: 0, y: 0 }
        absolute.set(entity.id, { x: snap(position.x - bounds.minX + originX), y: snap(position.y - bounds.minY + originY) })
    })

    const patches: WorkflowAutoLayoutPatch[] = []
    normalized.forEach((node) => {
        if (node.kind === "group") return
        const owner = memberOwner.get(node.id)
        if (!owner) {
            const position = absolute.get(node.id)
            if (position) patches.push({ id: node.id, position })
            return
        }
        const groupPosition = absolute.get(owner)
        const inner = innerPositions.get(owner)?.get(node.id)
        if (!groupPosition || !inner) return
        patches.push({
            id: node.id,
            position: node.parentId === owner
                ? { x: snap(inner.x), y: snap(inner.y) }
                : { x: snap(groupPosition.x + inner.x), y: snap(groupPosition.y + inner.y) },
        })
    })
    groups.forEach((group) => {
        const position = absolute.get(group.id)
        const frame = groupFrames.get(group.id)
        if (position && frame) patches.push({ id: group.id, position: { ...position, width: snap(frame.width), height: snap(frame.height) } })
    })
    return patches
}
