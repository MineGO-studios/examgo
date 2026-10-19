import { useCallback, useEffect, useRef, useState } from 'react'

export type ListLoadState = 'loading' | 'failed' | 'empty' | 'listed'
export type ReportListLoadState = (state: ListLoadState) => void

export function listLoadState(loaded: boolean, failed: boolean, count: number): ListLoadState {
  return failed ? 'failed' : !loaded ? 'loading' : count > 0 ? 'listed' : 'empty'
}

/** A list inside a My papers section reports its state; the section owns the announcement. */
export function useReportListLoadState(report: ReportListLoadState | undefined, state: ListLoadState): void {
  useEffect(() => { report?.(state) }, [report, state])
}

/**
 * Collects the load states of a My papers section's lists so the section announces
 * failures once, offers one retry, and shows one empty state when every list is empty.
 */
export function useSectionListLoads(expectedLists: number) {
  const [states, setStates] = useState<ReadonlyMap<string, ListLoadState>>(new Map())
  const [attempt, setAttempt] = useState(0)
  const reporters = useRef(new Map<string, ReportListLoadState>())
  const reporter = useCallback((list: string) => {
    let report = reporters.current.get(list)
    if (!report) {
      report = (state: ListLoadState) => setStates(previous => {
        if (previous.get(list) === state) return previous
        return new Map(previous).set(list, state)
      })
      reporters.current.set(list, report)
    }
    return report
  }, [])
  const retry = (): void => { setStates(new Map()); setAttempt(value => value + 1) }
  const values = [...states.values()]
  return {
    failed: values.includes('failed'),
    empty: states.size === expectedLists && values.every(state => state === 'empty'),
    attempt,
    reporter,
    retry,
  }
}
