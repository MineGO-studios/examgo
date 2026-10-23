import { expect, test } from '@playwright/test'
import { syntheticBackend } from './support/syntheticBackend.ts'
import { checkAccessibility } from './support/accessibility.ts'
import { englishLeft, overflowing } from './support/arabic.ts'

/*
 * Right-to-left sweep (MIN-273): every teacher and reviewer screen in Arabic at 320, 390 and 1280px,
 * light and dark. Each screen must keep the page within its width, leave no English interface text
 * (header included) and pass axe. Screenshots land in output/rtl-audit for review.
 */
const owner = '10000000-0000-4000-8000-000000000001'
const bankId = '20000000-0000-4000-8000-000000000001'
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const draft = (n: number, title: string, updatedDaysAgo: number) => ({
  id: `a0000000-0000-4000-8000-00000000000${n}`, owner_id: owner, bank_id: bankId, bank_ids: null, exam_title: title, grade: 6, unit: 1,
  question_count: 4, marks_per_question: 5, school_name: 'Synthetic school', selection_seed: n, status: 'draft',
  created_at: daysAgo(updatedDaysAgo + 1), updated_at: daysAgo(updatedDaysAgo),
})

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 1280]) {
    test(`every screen reads right to left in Arabic at ${width}px, ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const state = await syntheticBackend(page)
      state.curationReviewer = true
      state.tables.exam_drafts.push(draft(1, 'First Monthly Test', 0), draft(2, 'Mid-year Exam', 3))
      const audit = async (name: string) => {
        await page.screenshot({ path: `output/rtl-audit/${scheme}-${width}-${name}.png`, fullPage: true })
        expect.soft(await overflowing(page), `${name}: overflow`).toEqual([])
        expect.soft(await englishLeft(page, 'body'), `${name}: English left`).toEqual([])
        await checkAccessibility(page)
      }
      const nav = (label: string) => page.getByRole('navigation', { name: 'مساحة عمل المعلم' }).getByRole('button', { name: label, exact: true })

      // Sign-in, in Arabic before an account is open.
      await page.goto('/')
      await page.getByRole('button', { name: 'العربية' }).click()
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await audit('sign-in')
      await page.getByRole('textbox', { name: 'البريد الإلكتروني', exact: true }).fill('teacher@example.invalid')
      await page.getByLabel('كلمة المرور', { exact: false }).fill('Synthetic-password-123')
      await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).last().click()

      // New paper: setup, review and the preset paper page.
      await expect(page.getByRole('heading', { name: 'ورقة جديدة', exact: true })).toBeVisible()
      await audit('new-paper')
      if (width === 1280) {
        // Keyboard focus follows the Arabic reading order: along the header row from right to left.
        await page.locator('body').focus()
        const row: number[] = []
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press('Tab')
          const box = await page.evaluate(() => { const b = document.activeElement?.closest('header') ? document.activeElement.getBoundingClientRect() : null; return b && { x: b.left + b.width / 2 } })
          if (box) row.push(box.x)
        }
        expect(row.length).toBeGreaterThan(3)
        expect(row).toEqual([...row].sort((a, b) => b - a))
      }
      await page.getByRole('button', { name: 'معاينة الأسئلة', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'مراجعة الورقة', exact: true })).toBeVisible()
      await audit('review')
      await page.getByRole('button', { name: 'البدء بنوع آخر', exact: true }).click()
      await page.getByRole('button', { name: 'استخدام ورقة امتحان جاهزة من MineGO', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'استخدام ورقة امتحان جاهزة من MineGO', exact: true })).toBeVisible()
      await audit('presets')

      // Question banks: list, question form, import and passages.
      await nav('بنوك الأسئلة').click()
      await expect(page.getByRole('heading', { name: 'الأسئلة', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'إضافة سؤال', exact: true }).first()).toBeVisible()
      await audit('banks')
      await page.getByRole('button', { name: 'إضافة سؤال', exact: true }).first().click()
      await expect(page.getByRole('heading', { name: 'إضافة سؤال', exact: true })).toBeVisible()
      await audit('question-form')
      await page.getByRole('button', { name: 'العودة إلى الأسئلة', exact: true }).click()
      const sections = width < 640 ? null : page.getByRole('group', { name: 'أقسام بنك الأسئلة' })
      if (sections) await sections.getByRole('button', { name: 'استيراد ملف', exact: true }).click()
      else await page.getByRole('combobox', { name: 'قسم بنك الأسئلة' }).selectOption('import')
      await expect(page.getByRole('heading', { name: 'استيراد ملف', exact: true })).toBeVisible()
      await audit('import')
      if (sections) await sections.getByRole('button', { name: 'القطع', exact: true }).click()
      else await page.getByRole('combobox', { name: 'قسم بنك الأسئلة' }).selectOption('groups')
      await expect(page.getByRole('heading', { name: 'القطع والتمارين المرتبطة', exact: true })).toBeVisible()
      await audit('passages')

      // My papers: desk, list and draft recovery.
      await nav('أوراقي').click()
      await expect(page.getByRole('heading', { name: 'أوراقي', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'متابعة Mid-year Exam', exact: true })).toBeVisible()
      await audit('my-papers-desk')
      await page.getByRole('group', { name: 'طريقة العرض' }).getByRole('button', { name: 'القائمة' }).click()
      await audit('my-papers-list')
      await page.getByRole('button', { name: 'متابعة First Monthly Test', exact: true }).click()
      await expect(page.getByText('تحتاج مراجعة', { exact: true })).toBeVisible()
      await audit('recovery')
      await page.getByRole('button', { name: 'العودة إلى أوراقي', exact: true }).click()
      await page.getByRole('group', { name: 'طريقة العرض' }).getByRole('button', { name: 'المكتب' }).click()

      // Settings and the reviewer tools.
      await page.getByRole('button', { name: 'الإعدادات', exact: true }).click()
      await expect(page.getByRole('button', { name: 'فتح أدوات المراجعة', exact: true })).toBeVisible()
      await audit('settings')
      await page.getByRole('button', { name: 'فتح أدوات المراجعة', exact: true }).click()
      await page.getByRole('combobox', { name: 'البنك', exact: true }).selectOption({ label: 'Browser synthetic bank' })
      await page.getByText('موثوقية الأسئلة الجاهزة ومصدرها ومراجعتها').click()
      await expect(page.getByText('المراجع المخوَّل: Synthetic reviewer')).toBeVisible()
      await audit('reviewer')
      expect(state.unhandled).toEqual([])
    })
  }
}

