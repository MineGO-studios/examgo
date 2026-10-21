import type { PresetBank, PresetBrowserGroup, PresetBrowserQuestion } from './presetBankRepository'

export interface PresetBankView { value: string; label: string; bankId: string; unit?: number }

/** Unit banks share the published source and canonical question identities. */
export function presetBankViews(banks: readonly PresetBank[]): PresetBankView[] {
  return banks.flatMap(bank => [
    { value: 'preset:' + bank.id, label: bank.name + ' (Preset)', bankId: bank.id },
    ...[1, 2, 3, 4].map(unit => ({
      value: 'preset:' + bank.id + ':unit:' + unit,
      label: (banks.length === 1 ? '' : bank.name + ' · ') + 'Unit ' + unit + ' (Preset)',
      bankId: bank.id, unit,
    })),
  ])
}

export function presetUnitContent(questions: PresetBrowserQuestion[], groups: PresetBrowserGroup[], unit?: number) {
  if (unit === undefined) return { questions, groups }
  const scopedQuestions = questions.filter(question => question.unit === unit)
  const ids = new Set(scopedQuestions.map(question => question.id))
  // Keep full linked context in Passages, even when an exercise spans units.
  return { questions: scopedQuestions, groups: groups.filter(group => group.questionIds.some(id => ids.has(id))) }
}
