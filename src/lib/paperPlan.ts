/**
 * Paper plan data (D8.7): one group per question type, sized by its marks, listing the questions it comes from.
 * Groups keep the order in which each type first appears on the paper.
 */
export interface PlanPart {
  /** Where on the paper, such as "Q3" or "Q1 B". */
  label: string
  /** Index of the paper question this part belongs to. */
  question: number
  type: string
  items: number
  marks: number
}

export interface PlanGroup {
  type: string
  marks: number
  items: number
  parts: PlanPart[]
}

export function paperPlanGroups(parts: readonly PlanPart[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>()
  for (const part of parts) {
    const group = groups.get(part.type) ?? { type: part.type, marks: 0, items: 0, parts: [] }
    group.marks += part.marks
    group.items += part.items
    group.parts.push(part)
    groups.set(part.type, group)
  }
  return [...groups.values()]
}

/** Share of the paper's marks, rounded to a whole percent; zero when the paper has no marks yet. */
export function planShare(marks: number, total: number): number {
  return total > 0 ? Math.round((marks / total) * 100) : 0
}
