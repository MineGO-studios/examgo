/**
 * One view of every saved paper for My papers: the desk, the list and the term timeline.
 * Pure helpers only; loading lives in the component so each source keeps its own repository.
 */

export type PaperKind = 'simple' | 'iraqi' | 'candidate' | 'blueprint' | 'generated'
export type PaperState = 'draft' | 'final'
export type PaperScope = 'all' | PaperState

export interface PaperItem {
  /** Unique across kinds, e.g. `simple:<id>`. */
  key: string
  kind: PaperKind
  title: string
  state: PaperState
  /** ISO timestamp: last edit for drafts, finalization for finalized papers. */
  date: string
  version?: number
  marks?: number
  questions?: number
  grade?: number
  unit?: number
  /** Question bank name, when the source reports it. */
  source?: string
}

const DAY = 86_400_000

/** Whole local calendar days since the epoch, so papers from the same day share a dot position. */
export function localDay(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(value) : value
  return Math.round(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / DAY)
}

/** Newest first; ties keep a stable order by key. */
export function sortPapers(items: PaperItem[]): PaperItem[] {
  return [...items].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.key.localeCompare(b.key))
}

export function matchesPaper(item: PaperItem, scope: PaperScope, query: string, labels: string[] = []): boolean {
  if (scope !== 'all' && item.state !== scope) return false
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return [item.title, item.source ?? '', ...labels].some(text => text.toLocaleLowerCase().includes(needle))
}

/**
 * The timeline runs from one day before the earliest paper to two days after today
 * (or after the latest paper, if a clock is behind). Returns 0–1 positions per day.
 */
export function timelineScale(days: number[], today: number): { start: number; end: number; at: (day: number) => number } {
  const start = (days.length ? Math.min(...days, today) : today) - 1
  const end = Math.max(today, ...days) + 2
  const span = Math.max(end - start, 1)
  return { start, end, at: day => (day - start) / span }
}

/**
 * Pushes dots apart so neighbours sit at least `gap` px apart inside `width`.
 * Input must be sorted ascending; when the dots cannot all fit, the gap shrinks to share the width.
 */
export function spreadPositions(positions: number[], width: number, gap: number): number[] {
  if (positions.length < 2) return positions.map(x => Math.min(Math.max(x, 0), width))
  const step = Math.min(gap, width / (positions.length - 1))
  const out = [...positions]
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + step)
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? width : out[i + 1] - step)
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + step)
  return out
}

/** Smallest distance between neighbouring dots, used to size their tap areas. */
export function smallestGap(positions: number[], fallback: number): number {
  let gap = fallback
  for (let i = 1; i < positions.length; i++) gap = Math.min(gap, positions[i] - positions[i - 1])
  return gap
}

export interface DateLabel {
  key: string
  text: string
  center: number
  width: number
}

/**
 * Places date labels under their dots on up to `rows` rows; a label that would collide on every row,
 * or repeats a date already shown, is hidden (its dot's tooltip still carries the date).
 */
export function layoutDateLabels(labels: DateLabel[], rows = 2, margin = 8): Map<string, number | null> {
  const ends = Array.from({ length: rows }, () => -Infinity)
  const shown = new Set<string>()
  const placed = new Map<string, number | null>()
  for (const label of [...labels].sort((a, b) => a.center - b.center)) {
    if (shown.has(label.text)) { placed.set(label.key, null); continue }
    const row = ends.findIndex(end => label.center - label.width / 2 >= end + margin)
    if (row < 0) { placed.set(label.key, null); continue }
    ends[row] = label.center + label.width / 2
    shown.add(label.text)
    placed.set(label.key, row)
  }
  return placed
}

export interface TimelineMark {
  /** Stable for a given grouping: the first paper's key, prefixed for clusters. */
  key: string
  items: PaperItem[]
  /** Pixel position along the axis after spacing. */
  x: number
  firstDay: number
  lastDay: number
}

/**
 * Turns papers into timeline marks for an axis `width` px wide.
 * A day with more than `maxPerDay` papers becomes one cluster; marks keep at least `gap` px between them,
 * and when the axis is too narrow for that, the closest neighbours merge into clusters until they fit.
 */
export function timelineMarks(items: PaperItem[], today: number, width: number, gap = 22, maxPerDay = 2): TimelineMark[] {
  if (width <= 0 || items.length === 0) return []
  const scale = timelineScale(items.map(item => localDay(item.date)), today)
  const byDay = new Map<number, PaperItem[]>()
  for (const item of [...items].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.key.localeCompare(b.key))) {
    const day = localDay(item.date)
    byDay.set(day, [...(byDay.get(day) ?? []), item])
  }
  type Group = { items: PaperItem[]; firstDay: number; lastDay: number; anchor: number }
  let groups: Group[] = []
  for (const [day, list] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const anchor = scale.at(day) * width
    if (list.length > maxPerDay) groups.push({ items: list, firstDay: day, lastDay: day, anchor })
    else for (const item of list) groups.push({ items: [item], firstDay: day, lastDay: day, anchor })
  }
  // Merge the closest neighbours while the marks cannot keep the gap inside the width.
  while (groups.length > 1 && (groups.length - 1) * gap > width) {
    let best = 0
    for (let i = 1; i < groups.length - 1; i++) {
      if (groups[i + 1].anchor - groups[i].anchor < groups[best + 1].anchor - groups[best].anchor) best = i
    }
    const [a, b] = [groups[best], groups[best + 1]]
    const merged = { items: [...a.items, ...b.items], firstDay: Math.min(a.firstDay, b.firstDay), lastDay: Math.max(a.lastDay, b.lastDay),
      anchor: (a.anchor * a.items.length + b.anchor * b.items.length) / (a.items.length + b.items.length) }
    groups = [...groups.slice(0, best), merged, ...groups.slice(best + 2)]
  }
  const xs = spreadPositions(groups.map(group => group.anchor), width, gap)
  return groups.map((group, index) => ({
    key: group.items.length > 1 ? `cluster:${group.items[0].key}` : group.items[0].key,
    items: group.items, x: xs[index], firstDay: group.firstDay, lastDay: group.lastDay,
  }))
}

/** Mono label widths are predictable: about 0.6em per character at the 11px label size. */
export function estimateLabelWidth(text: string): number {
  return Math.ceil(text.length * 6.7) + 2
}
