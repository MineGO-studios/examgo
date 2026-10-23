import { defineStrings, plural } from '../lib/localize'

export const CONTROLS_STRINGS = defineStrings({
  en: {
    fewer: (label: string) => `Fewer: ${label}`,
    more: (label: string) => `More: ${label}`,
    none: 'None selected',
    selected: (n: number) => `${n} selected`,
  },
  ar: {
    fewer: (label: string) => `إنقاص: ${label}`,
    more: (label: string) => `زيادة: ${label}`,
    none: 'لم يُختر شيء',
    selected: (n: number) => plural('ar', n, { two: 'اثنان مختاران', few: '{n} مختارة', other: '{n} مختارًا' }),
  },
})
