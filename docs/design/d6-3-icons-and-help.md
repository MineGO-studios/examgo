# Icons and contextual help (D6.3)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 21 October 2026. Tracker: [MIN-254](https://linear.app/minego/issue/MIN-254).

## Dependencies and licensing

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| `@radix-ui/react-icons` | 1.3.2 | MIT | Individual SVG icons, tree-shaken per import |
| `@radix-ui/react-tooltip` | 1.4.1 | MIT | Accessible tooltip primitive: focus and hover, Escape, hoverable content |

No component framework was adopted. Only these two primitives were added, and every other control stays on the existing plain-CSS components.

## Icon vocabulary

There is one icon per repeated meaning, defined in `src/components/icons.tsx` and used through `<Icon name="…" />`.

| Meaning | Name | Radix icon |
| --- | --- | --- |
| Add | `add` | PlusIcon |
| Fewer / remove one | `remove` | MinusIcon |
| Edit | `edit` | Pencil1Icon |
| Delete | `delete` | TrashIcon |
| Close | `close` | Cross2Icon |
| Search | `search` | MagnifyingGlassIcon |
| Download | `download` | DownloadIcon |
| Import | `import` | UploadIcon |
| Reload | `reload` | ReloadIcon |
| Replace | `replace` | UpdateIcon |
| Lock / unlock | `lock` / `unlock` | LockClosedIcon / LockOpen1Icon |
| Done | `done` | CheckIcon |
| Warning | `warning` | ExclamationTriangleIcon |
| Help | `help` | QuestionMarkCircledIcon |
| Expand | `expand` | ChevronDownIcon |
| Desk view / list view | `desk` / `list` | ViewGridIcon / ListBulletIcon |

## Rules

1. **Icons are decoration.** The control that holds an icon provides the accessible name: either visible text, or an `aria-label` for an icon-only button. `Icon` renders with `aria-hidden` and `focusable="false"`.
2. **Visible text stays** for primary or ambiguous actions, errors, required instructions, reasons a choice is unavailable, and anything safety-critical. An icon may sit beside that text; it never replaces it.
3. **The 15px artwork is not the target.** Every control stays at least 44 × 44px, including the help button.
4. **Help tips are for secondary detail only.** Use `HelpTip` for explanations a teacher can skip, for example which date a timeline dot uses. Never use it for instructions needed to finish a task.
5. **Help tips work for every input:**
   - they open on hover or keyboard focus;
   - they stay open while the pointer is over the tip;
   - Escape closes them;
   - on touch screens a tap toggles the tip and a tap elsewhere closes it.

   Radix tooltips ignore touch by design, so `HelpTip` handles the tap itself.
6. **Direction:** the icons in the current vocabulary have no direction, so none are mirrored. A future directional icon, such as back or next, must mirror in right-to-left.
7. **Language:** the help button's name is "More about …" in English and "المزيد عن …" in Arabic.

## Delivered in the application

- **Replaced the hand-drawn SVGs:**
  - stepper −/+ buttons;
  - the dropdown chevron;
  - the My papers New paper, search, desk and list icons;
  - the Question banks Add question icon.
- **Added help tips:**
  - beside "Your papers over time", explaining which date each dot uses and what a numbered dot is;
  - beside "Filed", replacing the always-visible note about simple question papers.
- **One tooltip provider** in `main.tsx`.

Still open:

- applying icons to the review and download actions (lock, replace, download) in the builders, which is planned with D8;
- an icon review of the reviewer tools.

## Accessibility evidence (21 October 2026)

All checks use synthetic data at the Playwright browser layer:

- **Keyboard:** focusing the help button opens the tip, and the tooltip role exposes the text. Escape closes it.
- **Pointer:** hovering opens the tip, and it stays open while hovered.
- **Touch:** at 390px on a touch device, a tap opens the tip, a second tap closes it, and a tap elsewhere closes it.
- **Hit target:** the help button measures at least 44 × 44px.
- **axe WCAG A/AA:** passes with the tip open.
- **Unit tests:** the help button has its accessible name; glyphs are hidden from assistive technology; the tip content is absent until opened.
- **Screenshots:** English at 1280 in light mode, and Arabic at 390 in dark mode, both with the tip open.

This is not screen-reader testing with real assistive technology, and not teacher usability evidence.
