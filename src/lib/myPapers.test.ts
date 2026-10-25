import { describe, expect, it } from 'vitest'
import { layoutDateLabels, localDay, matchesPaper, smallestGap, sortPapers, spreadPositions, timelineMarks, timelineScale, type PaperItem } from './myPapers'

const paper = (over: Partial<PaperItem>): PaperItem => ({ key: 'simple:1', kind: 'simple', title: 'First Monthly Test', state: 'draft', date: '2026-10-19T09:40:00Z', ...over })

describe('My papers model', () => {
  it('sorts newest first with a stable tie-break', () => {
    const items = [paper({ key: 'b', date: '2026-10-12T00:00:00Z' }), paper({ key: 'c', date: '2026-10-19T00:00:00Z' }), paper({ key: 'a', date: '2026-10-12T00:00:00Z' })]
    expect(sortPapers(items).map(item => item.key)).toEqual(['c', 'a', 'b'])
  })

  it('filters by scope and by title, bank or type label', () => {
    const draft = paper({ source: 'Grade 6 bank' })
    const final = paper({ key: 'iraqi:1', state: 'final', title: 'Second Monthly Test' })
    expect(matchesPaper(draft, 'final', '')).toBe(false)
    expect(matchesPaper(final, 'final', '')).toBe(true)
    expect(matchesPaper(draft, 'all', 'grade 6')).toBe(true)
    expect(matchesPaper(final, 'all', 'iraqi', ['Iraqi exercises and writing'])).toBe(true)
    expect(matchesPaper(final, 'all', 'vocabulary')).toBe(false)
  })

  it('counts whole local days', () => {
    expect(localDay(new Date(2026, 9, 19, 23, 59)) - localDay(new Date(2026, 9, 19, 0, 1))).toBe(0)
    expect(localDay(new Date(2026, 9, 20, 0, 1)) - localDay(new Date(2026, 9, 19, 23, 59))).toBe(1)
  })
})

describe('term timeline', () => {
  it('runs from a day before the first paper to two days after today', () => {
    const scale = timelineScale([102, 108, 119], 119)
    expect(scale.start).toBe(101)
    expect(scale.end).toBe(121)
    expect(scale.at(101)).toBe(0)
    expect(scale.at(121)).toBe(1)
  })

  it('spreads crowded dots apart and keeps them inside the width', () => {
    const spread = spreadPositions([10, 300, 305, 306], 320, 18)
    expect(spread[0]).toBe(10)
    expect(smallestGap(spread, 32)).toBeGreaterThanOrEqual(18 - 1e-9)
    expect(Math.max(...spread)).toBeLessThanOrEqual(320)
  })

  it('shares the width when every dot cannot keep the full gap', () => {
    const spread = spreadPositions([0, 0, 0, 0, 0], 40, 18)
    expect(smallestGap(spread, 99)).toBeCloseTo(10)
  })

  it('puts colliding date labels on a second row and hides the rest', () => {
    const x = layoutDateLabels([
      { key: 'a', text: '18 Oct', center: 100, width: 40 },
      { key: 'b', text: 'Today', center: 118, width: 36 },
      { key: 'd', text: '2 Oct', center: 10, width: 36 },
    ], 400)
    // Close labels sit side by side on one row, without overlap, and stay inside the axis.
    expect(x.get('d')).toBe(18)
    const a = x.get('a') as number, b = x.get('b') as number
    expect(b - a).toBeGreaterThanOrEqual(20 + 18 + 8)
    expect(Math.abs((a + b) / 2 - 109)).toBeLessThan(25)
  })

  it('keeps labels inside the axis and hides the most crowded when the row is full', () => {
    const x = layoutDateLabels([
      { key: 'a', text: '18 Oct', center: 70, width: 40 },
      { key: 'b', text: '19 Oct', center: 75, width: 40 },
      { key: 'c', text: 'Today', center: 80, width: 36 },
    ], 100, 8, label => label.text === 'Today')
    expect(x.get('c')).toBe(82)
    expect([x.get('a'), x.get('b')].filter(v => v === null)).toHaveLength(1)
    const shown = [x.get('a'), x.get('b')].find(v => v !== null) as number
    expect(shown + 20).toBeLessThanOrEqual(82 - 18 - 8)
  })

  it('shows a repeated date once', () => {
    const rows = layoutDateLabels([
      { key: 'a', text: '12 Oct', center: 50, width: 40 },
      { key: 'b', text: '12 Oct', center: 200, width: 40 },
    ], 400)
    expect(rows.get('a')).toBe(50)
    expect(rows.get('b')).toBeNull()
  })
})

describe('timeline marks', () => {
  const at = (key: string, day: number) => paper({ key, date: new Date(2026, 9, day, 12).toISOString() })
  const today = localDay(new Date(2026, 9, 19, 12))

  it('keeps up to two papers on a day as their own dots, spaced apart', () => {
    const marks = timelineMarks([at('a', 18), at('b', 18), at('c', 2)], today, 600)
    expect(marks.map(mark => mark.items.length)).toEqual([1, 1, 1])
    expect(smallestGap(marks.map(mark => mark.x), 99)).toBeGreaterThanOrEqual(22 - 1e-9)
  })

  it('groups a day with more than two papers into one cluster', () => {
    const marks = timelineMarks([at('a', 14), at('b', 14), at('c', 14), at('d', 2)], today, 600)
    expect(marks).toHaveLength(2)
    expect(marks[1].key).toBe('cluster:a')
    expect(marks[1].items.map(item => item.key)).toEqual(['a', 'b', 'c'])
  })

  it('merges the closest neighbours when the axis is too narrow', () => {
    const items = Array.from({ length: 20 }, (_, i) => at(`p${i}`, i + 1))
    const marks = timelineMarks(items, today, 200)
    expect((marks.length - 1) * 22).toBeLessThanOrEqual(200)
    expect(marks.flatMap(mark => mark.items)).toHaveLength(20)
    expect(marks.some(mark => mark.firstDay !== mark.lastDay)).toBe(true)
  })
})
