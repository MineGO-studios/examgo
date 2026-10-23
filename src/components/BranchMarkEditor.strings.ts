import { defineStrings } from '../lib/localize'

export const BRANCH_MARK_STRINGS = defineStrings({
  en: {
    legend: (label: string) => `Marks for ${label}`,
    total: 'Question total',
    points: (shown: number, answered: number) => `${shown} displayed points; answer ${answered}.`,
    optional: 'Optional points must have equal whole marks.',
    addUp: 'Point marks must add up to the question total.',
    split: 'Split marks',
    equal: 'Divide equally',
    custom: 'Assign each point',
    point: (n: number) => `Point ${n}:`,
    apply: 'Apply question marks',
    cancel: 'Cancel mark changes',
  },
  ar: {
    legend: (label: string) => `درجات ${label}`,
    total: 'مجموع درجات السؤال',
    points: (shown: number, answered: number) => `${shown} فقرات معروضة؛ يُجاب عن ${answered}.`,
    optional: 'يجب أن تحمل الفقرات الاختيارية درجات صحيحة متساوية.',
    addUp: 'يجب أن يساوي مجموع درجات الفقرات مجموع السؤال.',
    split: 'توزيع الدرجات',
    equal: 'بالتساوي',
    custom: 'لكل فقرة على حدة',
    point: (n: number) => `الفقرة ${n}:`,
    apply: 'تطبيق درجات السؤال',
    cancel: 'إلغاء تغييرات الدرجات',
  },
})
