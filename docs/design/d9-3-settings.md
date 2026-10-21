# Settings structure and preferences (D9.3)

ExamGO by MineGO Studio · documentation checkpoint `1.0.0-alpha.1` · 21 October 2026. Tracker: [MIN-253](https://linear.app/minego/issue/MIN-253). Technical counterpart: [MIN-261](https://linear.app/minego/issue/MIN-261).

## 1. What exists today

| Preference | Where it lives | Scope | Effect |
| --- | --- | --- | --- |
| Interface language | Browser storage `examgo.language` | This device, for everyone using it; also applies before sign-in | Switches between English and Arabic, and sets the reading direction |
| My papers view (desk or list) | Browser storage `examgo.papers.view` | This device | The default view on My papers |
| Import column mapping | Browser storage, one entry per import source | This device | Re-applies confirmed CSV column choices |
| Appearance (light or dark) | The device's own setting | This device | ExamGO follows it; there is no in-app override |
| School name, test title, teacher footer name | Typed into each paper | One paper | Not remembered between papers |

Nothing is stored per account today. A shared device keeps its language and view for every teacher who uses it. That is acceptable only because both preferences are clearly labelled "on this device", and both are needed before sign-in or for layout only. No personal or paper data is kept in device preferences.

## 2. Structure

**Account** becomes **Settings** (Arabic: الإعدادات). The page has one section per scope, so a teacher can see where each choice applies.

1. **Account:** who is signed in, Sign out, and Sign out of all devices (with its explanation).
2. **Language and appearance, on this device:** the interface language, chosen the same way as the header switch. One line says the appearance follows the device's light or dark setting.
3. **My papers, on this device:** the default view, Desk or List.
4. **Paper defaults, saved to your account:** school name, teacher footer name and saved exam names (D9.4). **Not shown until MIN-261 provides account storage.** A setting must have a real effect, so this section is designed but not yet displayed.
5. **For MineGO reviewers:** the existing entry to the reviewer tools.

## 3. Precedence

When account defaults exist, a value in a new paper resolves in this order (highest first):

1. what the teacher types into this paper (a per-paper override, never written back silently);
2. the teacher's account default (MIN-261);
3. the product's empty or placeholder value.

Device preferences (language and view) never fill paper content.

## 4. Save, reset and error states

- **Device preferences** apply at once, with no Save button. A short "Saved on this device" status confirms the change and is announced politely. If browser storage is blocked, the choice still applies to the open page, and the status says "Applied for now; this browser won't remember it".
- **Account defaults (future)** use an explicit Save. Changes stay pending until saved, and Cancel returns to the last saved values. Saving shows "Saving…", then "Saved", or "Couldn't save. Nothing was changed. Try again", with Retry and the typed values kept. A **Reset to empty** action asks for inline confirmation; there are no browser dialogs.
- **Sign-out and account changes:** account defaults are loaded per signed-in owner and dropped from memory on sign-out or account change, so they never carry over between teachers. Device preferences stay, by design.

## 5. Delivered in the application (21 October 2026)

- **Settings page:** the navigation shows **Settings**. The page has the Account, "Language and appearance on this device", "My papers on this device" and reviewer sections. Each device choice confirms "Saved on this device".
- **Shared storage:** the language and view controls reuse the existing device storage, so the header switch and the My papers toggle stay in sync with the Settings page.
- **Not built:** the paper-defaults section (MIN-261 and D9.4).
