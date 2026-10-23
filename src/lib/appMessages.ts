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
  // Question form validation, banks, passages and import
  ['A valid question bank is required.', 'يلزم بنك أسئلة صالح.'],
  ['Unit must be a whole number between 1 and 8.', 'يجب أن تكون الوحدة عددًا صحيحًا بين 1 و8.'],
  ['Lesson must contain between 1 and 40 characters.', 'يجب أن يحتوي الدرس على 1 إلى 40 حرفًا.'],
  ['Select a supported question type.', 'اختر نوع سؤال مدعومًا.'],
  ['Select a valid difficulty.', 'اختر مستوى صعوبة صالحًا.'],
  ['Question text must contain between 1 and 2000 characters.', 'يجب أن يحتوي نص السؤال على 1 إلى 2000 حرف.'],
  ['Provide between 2 and 6 answer options.', 'أدخل من 2 إلى 6 خيارات إجابة.'],
  ['Every option requires a label of 1–10 characters and answer text.', 'يحتاج كل خيار إلى رمز من 1 إلى 10 أحرف ونص إجابة.'],
  ['Answer option labels must be unique.', 'يجب ألا تتكرر رموز خيارات الإجابة.'],
  ['The correct answer must match one of the option labels.', 'يجب أن تطابق الإجابة الصحيحة أحد رموز الخيارات.'],
  ['Select True/False or Yes/No labels.', 'اختر صح/خطأ أو نعم/لا.'],
  ['Select the correct binary answer.', 'اختر الإجابة الصحيحة.'],
  ['Enter the correct answer before saving.', 'أدخل الإجابة الصحيحة قبل الحفظ.'],
  ['List each other accepted answer once, without repeating the correct answer.', 'اذكر كل إجابة مقبولة أخرى مرة واحدة، دون تكرار الإجابة الصحيحة.'],
  ['Answer lines must be a whole number between 1 and 20.', 'يجب أن تكون أسطر الإجابة عددًا صحيحًا بين 1 و20.'],
  ['Question status must be valid.', 'يجب أن تكون حالة السؤال صالحة.'],
  ['A prompt is required.', 'نص السؤال مطلوب.'],
  ['A lesson is required.', 'الدرس مطلوب.'],
  ['A correct option is required.', 'الخيار الصحيح مطلوب.'],
  ['Option labels must be unique.', 'يجب ألا تتكرر رموز الخيارات.'],
  ['Must identify one of the supplied options.', 'يجب أن يشير إلى أحد الخيارات المعطاة.'],
  ['Must contain between 2 and 6 options.', 'يجب أن يحتوي على 2 إلى 6 خيارات.'],
  ['A canonical reference answer is required.', 'الإجابة المرجعية مطلوبة.'],
  ['Approved variants must contain non-empty text.', 'يجب ألا تكون الإجابات المقبولة الأخرى فارغة.'],
  ['Variants must be unique and distinct from the canonical answer.', 'يجب ألا تتكرر الإجابات المقبولة الأخرى وأن تختلف عن الإجابة المرجعية.'],
  ['Completion text is required.', 'نص الإكمال مطلوب.'],
  ['A non-empty word bank is required.', 'يلزم بنك كلمات غير فارغ.'],
  ['At least one blank id is required.', 'يلزم فراغ واحد على الأقل.'],
  ['Every completion answer must come from the word bank.', 'يجب أن تأتي كل إجابة إكمال من بنك الكلمات.'],
  ['Every unique blank requires one answer and no unknown blank may be present.', 'يحتاج كل فراغ إلى إجابة واحدة، ولا يُسمح بفراغ غير معروف.'],
  ['Every word-bank entry must be used by this completion.', 'يجب استخدام كل كلمة في بنك الكلمات في هذا الإكمال.'],
  ['A word-bank entry cannot be reused unless reuse is enabled.', 'لا يمكن تكرار كلمة من بنك الكلمات إلا إذا سُمح بالتكرار.'],
  ['At least three words are required.', 'يلزم ثلاث كلمات على الأقل.'],
  ['Must identify a supplied word.', 'يجب أن يشير إلى إحدى الكلمات المعطاة.'],
  ['Exactly two words are required.', 'تلزم كلمتان بالضبط.'],
  ['At least one relationship is required.', 'تلزم علاقة واحدة على الأقل.'],
  ['A rewrite instruction is required.', 'تعليمات إعادة الكتابة مطلوبة.'],
  ['At least one rewrite is required.', 'تلزم جملة واحدة بعد إعادة الكتابة على الأقل.'],
  ['List A and List B must contain the same number of items.', 'يجب أن تحتوي القائمتان أ وب على العدد نفسه من العناصر.'],
  ['Matching requires one unique pair for every List A and List B item.', 'تحتاج المطابقة إلى زوج فريد لكل عنصر في القائمتين أ وب.'],
  ['Must contain between 2 and 20 matching items.', 'يجب أن يحتوي على 2 إلى 20 عنصر مطابقة.'],
  ['At least two pairs are required.', 'يلزم زوجان على الأقل.'],
  ['Provide an approved model or rubric, or explicitly mark the item manual-only.', 'أدخل نموذج إجابة أو معيار تصحيح معتمدًا، أو حدّد أن التصحيح يدوي فقط.'],
  ['An approved model answer cannot be blank.', 'لا يمكن أن يكون نموذج الإجابة المعتمد فارغًا.'],
  ['An approved rubric must contain at least one criterion.', 'يجب أن يحتوي معيار التصحيح المعتمد على بند واحد على الأقل.'],
  ['Must not be below the minimum.', 'يجب ألا يقل عن الحد الأدنى.'],
  ['Something went wrong. Please try again.', 'حدث خطأ. حاول مرة أخرى.'],
  ['Import preview failed.', 'تعذّرت معاينة الاستيراد.'],
  ['Choose a file first.', 'اختر ملفًا أولًا.'],
  ['Select Mid-Year Prototype as the Papers source bank.', 'اختر Mid-Year Prototype بنكًا مصدرًا لفهرس الأوراق.'],
  ['No column choices are saved for this source name. Choose each column below first.', 'لا توجد اختيارات أعمدة محفوظة لاسم المصدر هذا. اختر كل عمود أدناه أولًا.'],
  ['Unable to load passage groups.', 'تعذّر تحميل مجموعات القطع.'],
  ['Passage save could not be confirmed.', 'تعذّر تأكيد حفظ القطعة.'],
  ['Unable to remove the complete group.', 'تعذّرت إزالة المجموعة كاملة.'],
  ['Open the source bank to edit this passage group.', 'افتح البنك المصدر لتعديل مجموعة القطعة هذه.'],
  ['A selected question changed or disappeared. Reopen the passage and review its children.', 'تغيّر سؤال مختار أو اختفى. أعد فتح القطعة وراجع أسئلتها.'],
  ['A selected question changed. Review its current answer before saving.', 'تغيّر سؤال مختار. راجع إجابته الحالية قبل الحفظ.'],
  ['The historical passage marks no longer fit these children. Create a new markless passage group.', 'لم تعد درجات القطعة السابقة تناسب هذه الأسئلة. أنشئ مجموعة قطعة جديدة بلا درجات.'],
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
