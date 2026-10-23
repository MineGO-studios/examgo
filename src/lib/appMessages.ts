import type { Language } from './i18n'
import { questionTypeLabel } from './questionTypeLabels'

/*
 * Application-owned messages are written in English inside repositories and domain code,
 * and tests rely on that text. They are translated here, at the display boundary, so the
 * domain stays unchanged (MIN-56). An unlisted message is shown in English rather than
 * guessed; screens fill this catalog as they are translated.
 */

type Translation = string | ((match: RegExpMatchArray) => string)

/** Exact English text, or a pattern whose groups carry the variable parts. */
const ARABIC: ReadonlyArray<readonly [string | RegExp, Translation]> = [
  ['Nothing was changed.', 'لم يتغيّر شيء.'],
  // New paper setup validation (validateExamSettings)
  ['School name is required.', 'اسم المدرسة مطلوب.'],
  [/^School name cannot exceed (\d+) characters\.$/, (m) => `لا يمكن أن يتجاوز اسم المدرسة ${m[1]} حرفًا.`],
  ['Test title is required.', 'عنوان الاختبار مطلوب.'],
  [/^Test title cannot exceed (\d+) characters\.$/, (m) => `لا يمكن أن يتجاوز عنوان الاختبار ${m[1]} حرفًا.`],
  [/^Teacher name cannot exceed (\d+) characters\.$/, (m) => `لا يمكن أن يتجاوز اسم المعلم ${m[1]} حرفًا.`],
  ['This prototype currently supports Grade 6 only.', 'تدعم هذه النسخة الصف السادس فقط حاليًا.'],
  ['This prototype currently supports Unit 1 only.', 'تدعم هذه النسخة الوحدة 1 فقط حاليًا.'],
  [/^Marks must be a whole number between (\d+) and (\d+)\.$/, (m) => `يجب أن تكون الدرجات عددًا صحيحًا بين ${m[1]} و${m[2]}.`],
  [/^Paper seed must be a whole number between (\d+) and (\d+)\.$/, (m) => `يجب أن يكون رقم الاختيار عددًا صحيحًا بين ${m[1]} و${m[2]}.`],
  ['No approved questions are available for this test.', 'لا توجد أسئلة معتمدة متاحة لهذا الاختبار.'],
  [/^Question quantity must be between (\d+) and (\d+)\.$/, (m) => `يجب أن يكون عدد الأسئلة بين ${m[1]} و${m[2]}.`],
  [/^This selection is estimated at (\d+) question pages\. Papers fit on (\d+) pages, so choose fewer questions\.$/,
    (m) => `يُقدَّر هذا الاختيار بـ${m[1]} صفحات أسئلة. تتسع الورقة لصفحتين، فاختر أسئلة أقل.`],
  // Review and generation
  ['The selected question is no longer in the preview.', 'لم يعد السؤال المختار في المعاينة.'],
  ['Unlock this question before removing it.', 'ألغِ قفل هذا السؤال قبل إزالته.'],
  ['An exam must contain at least one question.', 'يجب أن يحتوي الامتحان على سؤال واحد على الأقل.'],
  ['Unlock this question before replacing it.', 'ألغِ قفل هذا السؤال قبل استبداله.'],
  ['That question can no longer replace this one. Preview again.', 'لم يعد بإمكان ذلك السؤال أن يحل محل هذا السؤال. عاين مرة أخرى.'],
  [/^Only (\d+) eligible ([a-z-]+) questions are available, but (\d+) were requested\.$/, (m) => `يتوفر ${m[1]} فقط من أسئلة «${questionTypeLabel(m[2], 'ar')}» المناسبة، لكن طُلب ${m[3]}.`],
  ['The exam total cannot exceed 1000 marks.', 'لا يمكن أن يتجاوز مجموع الامتحان 1000 درجة.'],
  ['The question total must be a whole number from 1 to 1000.', 'يجب أن يكون مجموع السؤال عددًا صحيحًا من 1 إلى 1000.'],
  ['Equal marks need a whole, positive mark for every point. Change the total or use a custom split.', 'يحتاج التوزيع المتساوي إلى درجة صحيحة موجبة لكل فقرة. غيّر المجموع أو وزّع الدرجات بنفسك.'],
  ['Point marks must be positive whole numbers that add up to the question total.', 'يجب أن تكون درجات الفقرات أعدادًا صحيحة موجبة مجموعها يساوي مجموع السؤال.'],
  ['Equal marks need a whole, positive mark for every attempted point. Change the total.', 'يحتاج التوزيع المتساوي إلى درجة صحيحة موجبة لكل فقرة يُجاب عنها. غيّر المجموع.'],
  ['Optional points must carry equal whole marks so every permitted attempt has the question total.', 'يجب أن تحمل الفقرات الاختيارية درجات صحيحة متساوية ليحقق كل اختيار مسموح مجموع السؤال.'],
  ['Assign a mark to every point and no unrelated point.', 'أعطِ درجة لكل فقرة، ولا تعطِ فقرة غير مرتبطة.'],
  ['Preview questions before assigning marks.', 'عاين الأسئلة قبل تحديد الدرجات.'],
  ['Preview the questions first.', 'عاين الأسئلة أولًا.'],
  ['Apply the pending question marks before saving.', 'طبّق درجات الأسئلة المعلّقة قبل الحفظ.'],
  ['Save the current reviewed draft before finalizing.', 'احفظ المسودة الحالية بعد مراجعتها قبل الإنهاء.'],
  ['Selected preset is missing. Reload and review again.', 'السؤال الجاهز المختار غير موجود. أعد التحميل وراجع مرة أخرى.'],
  // Fallbacks shown with a support reference
  ['Unable to load approved questions. Please try again.', 'تعذّر تحميل الأسئلة المعتمدة. حاول مرة أخرى.'],
  ['Unknown generation error.', 'خطأ غير معروف في الإنشاء.'],
  ['Unable to remove question.', 'تعذّرت إزالة السؤال.'],
  ['Unable to replace question.', 'تعذّر استبدال السؤال.'],
  ['Unable to save the exam draft.', 'تعذّر حفظ مسودة الامتحان.'],
  ['invalid marks', 'درجات غير صالحة'],
  ['Review the whole-mark split.', 'راجع توزيع الدرجات الصحيحة.'],
  ['Preset request failed. Reload and review again.', 'تعذّر طلب الورقة الجاهزة. أعد التحميل وراجع مرة أخرى.'],
  ['Group preset request failed. Reopen before retrying.', 'تعذّر طلب التمرين الجاهز. أعد فتحه قبل المحاولة.'],
  ['Download failed. Retry this document.', 'تعذّر التنزيل. أعد محاولة هذا المستند.'],
  ['Download failed. Retry this captured document.', 'تعذّر التنزيل. أعد محاولة هذا المستند المحفوظ.'],
  ['The browser did not accept the download request. Retry this file from the same prepared paper.', 'لم يقبل المتصفح طلب التنزيل. أعد محاولة هذا الملف من الورقة الجاهزة نفسها.'],
  ['Unable to load question banks.', 'تعذّر تحميل بنوك الأسئلة.'],
  ['Unable to load questions. Reopen the bank and try again.', 'تعذّر تحميل الأسئلة. أعد فتح البنك وحاول مرة أخرى.'],
  ['The operation could not be confirmed. Reopen saved work before continuing.', 'تعذّر تأكيد العملية. أعد فتح العمل المحفوظ قبل المتابعة.'],
]

const REFERENCE = /\s*Reference: (EG-[0-9a-f-]+)$/i

function translateOne(message: string): string | undefined {
  for (const [source, target] of ARABIC) {
    if (typeof source === 'string') {
      if (source === message) return typeof target === 'string' ? target : undefined
      continue
    }
    const match = message.match(source)
    if (match && match[0] === message) return typeof target === 'string' ? target : target(match)
  }
  return undefined
}

/** A message built from known sentences; never a half-translated mix. */
function translateSentences(message: string): string | undefined {
  const sentences = message.match(/[^.!?]+[.!?]+/g)
  if (!sentences || sentences.join('').length !== message.length) return undefined
  const parts = sentences.map((sentence) => translateOne(sentence.trim()))
  return parts.every((part) => part !== undefined) ? parts.join(' ') : undefined
}

/** The Arabic for an application message, keeping any support reference code unchanged. */
export function localizeAppMessage(language: Language, message: string): string {
  if (language === 'en') return message
  const reference = message.match(REFERENCE)
  const body = reference ? message.slice(0, reference.index).trim() : message
  const translated = translateOne(body) ?? translateSentences(body) ?? body
  return reference ? `${translated} ${referenceLabel(language)} ${reference[1]}` : translated
}

export function referenceLabel(language: Language): string {
  return language === 'ar' ? 'الرمز المرجعي:' : 'Reference:'
}
