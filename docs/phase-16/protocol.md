# Private teacher alpha protocol v1

ExamGO by MineGO Studio · MIN-20 · 19 October 2026 (Asia/Baghdad).

This protocol is prepared before recruitment and observation. It is not a report of teacher behavior. The owner requested materials first and teachers later. Preserve the canonical Linear checklist, Engineering References I/II, and the archive's C7 participation clarification. Phase 17 remains outside authorization.

## Questions the alpha must answer

- Can actual Iraqi Grade 6 English teachers find and edit questions, review a supported CSV import, and create two different papers with matching editable answer keys?
- Do teachers notice missing context, answer mistakes, marks, pagination limits and recovery actions without being coached on internal terms?
- How does the work compare with their recent paper/source collection, preparation, answer checking and final Word editing?
- What prevents trustworthy reuse? Separate observed behavior from stated intentions, suggestions and facilitator interpretation.

## Cohort and preparation boundary

Recruit three actual Grade 6 English teachers when the owner is ready. The checklist allows inviting one to three initially; its success gate still requires at least three teachers. Use pseudonyms T01–T03. Keep contact details, invitations, credentials, account-to-pseudonym mapping and consent evidence in owner-controlled storage, not Git, Linear attachments or shared brain notes. Do not collect student records or completed student answers. Age is unnecessary; ask only voluntarily if a specific decision requires it and record that purpose separately.

Before recruitment, assign an owner, observer and support contact. Identify the exact nonproduction preview and build, supported browser/device, Word version and language/direction. Verify each teacher's separate invited account has ordinary teacher privileges and an alpha-only private bank. Never share administrator credentials or give publisher/reviewer privileges to make a task pass. Confirm no personal or student content appears in practice files, recordings or diagnostic messages.

Prepare a reviewed bank and two feasible paper briefs for each teacher using owned/licensed or approved content. Record bank/review version, source rights, eligible supply, intended types, context/groups, displayed and attempted counts, marks and answer authority. Check that the exact hosted flow exposes the required format and supports its counts. Keep bank setup timing separate from composition timing. Do not imply that the two-row synthetic CSV supplies enough content for either paper.

Available source-level paths in the current publish checkout: Simple question paper, Approved preset papers and Source-specific exercises. Arbitrary blueprint composition and Complete paper candidate are development-only. Available content and authenticated alpha-account behavior have not been established by preparing this protocol. Do not promise either task is ready until the readiness record has passed.

## Two different observed workflows per teacher

Before the first attempt, freeze two briefs grounded in the teacher's actual work. Each brief states question structures, scope/units, counts, attempt rules, marks, required context and intended final paper. A different title, seed or order alone is not a different structure.

| Workflow | Intended task | Completion evidence |
| --- | --- | --- |
| A — short classroom assessment | Find and edit a suitable question, use or create a private bank, then prepare a short paper from a supported simple-question structure. | Teacher reviews answers/marks, saves and reopens the paper where supported, exports both files and confirms their usability in Word. |
| B — a different classroom paper | Review/import a supported CSV in a separate preparation segment, then produce a genuinely different supported structure: for example the fixed Unit 1 Q3/A–Q5 exercises-and-writing excerpt or a complete approved preset exercise with an attempt rule, if it actually meets the teacher's brief. Freeze the actual brief and available content before starting. | Teacher reviews full context, displayed/attempt counts and marks, saves/reopens where supported, checks both outputs and confirms their usability in Word. |

The examples guide preparation; they do not substitute for real teacher requirements. If neither hosted flow/content can meet B, record a readiness gap and stop that launch. Do not duplicate A under another title, count an observer demonstration or synthetic test as B, or invent missing source context/answers. If the same task order is used for all teachers, record learning/order bias; do not claim a controlled experiment.

Use the [paper brief worksheet](paper-brief-template.md) to freeze exact structures and supply. The source-specific flow is an excerpt, not a complete Q1–Q5 paper; it does not supply passage or matching sections. Do not count it as satisfying a full-paper brief. The simple preset path and complete preset exercise also have specific format/Unit 1 limits; consult the worksheet's source-backed availability matrix. Matching/passage content existing elsewhere in the code or bank does not establish availability in these hosted flows.

## Measurement rules fixed before attempts

1. A workflow attempt starts when the observer finishes reading the frozen paper brief, the account/bank is ready, and the teacher begins the first composition action. Record date, local time and offset (`+03:00`), exact artifact/build and brief ID. An explicit start event creates an attempt record even if it later fails or is abandoned.
2. End when the teacher has reviewed both downloaded documents in Word and explicitly accepts the matching pair for the brief, or when the attempt is abandoned, blocked or stopped. Record total elapsed time and any pauses separately; do not silently subtract waiting or errors. If Word review happens later, record browser completion and Word review separately; end-to-end completion stays pending until that review.
3. Record account onboarding, bank setup, import preparation and current-method baseline time separately. No five-minute target applies to Phase 16. Do not borrow Phase 18's median-time or 30-day reuse thresholds.
4. Count an attempt as independently successful only when the pair satisfies the frozen brief, structural review passes, human Word acceptance is recorded, and no task-specific developer/facilitator guidance or takeover was needed after the start. Pre-session sign-in/privacy instructions and neutral prompts such as “What are you thinking?” are standard orientation. Any hint about where to click, field meaning, answer choice, repair or retry after the start is an intervention. Record source, time, reason, action and duration; conservative classification avoids inflating success.
5. Record completion with intervention separately. Such a completed workflow may satisfy that teacher's participation requirement, but it does not enter the independent-success numerator. Record abandonment, block, failure and missing/inconclusive evidence separately; do not silently discard them.
6. Denominator: every started eligible workflow attempt in this protocol, including failed, abandoned, blocked and started-but-unresolved attempts. Numerator: independent successful attempts with the required evidence. Ratio = numerator / denominator; compare without rounding up. With no attempts, report missing. Report scheduled-but-not-started workflows separately as missing participation, not attempts. Record a privacy withdrawal and its effect on evaluability; do not erase a failure solely to improve results.
7. A repair/retry within the same workflow remains the same attempt, with recovery/interventions recorded. A separately started retest receives a new attempt ID linked to the original. Retests never replace failed originals or remove them from the aggregate. Also report first-attempt and retest results separately. A new build is a new evidence stratum; never combine incompatible output versions without explaining the limit.
8. Participation: at least three eligible teachers each complete two distinct observed workflows. Count distinct people and briefs, not logins, downloads or retests. A participation exception needs an explicit owner decision with reasons and does not turn unmet evidence into a successful gate.
9. Overall success: participation evidence is complete; at least 80% of attempted workflows finish independently with acceptable matching documents; no known alpha P0/P1 security, data-loss, wrong-answer or invalid-paper defect remains. All three conditions must hold. Six attempts require five independent successes, while each of the three teachers must still complete two workflows. Missing or inconclusive evidence leaves its condition unchecked.

## Acceptable matching pair

Use the real teacher workflow and actual production document-generation path for the exact session build; “production path” does not mean a Production deployment. Identify bank/draft/finalized snapshot/version where available. Record immutable snapshot identity only if that flow actually creates one. Do not relabel a mutable simple draft as a finalized structured snapshot.

Check requested scope, question and revision identity, numbering, complete linked context, options/matching columns, correct answers, displayed/attempted counts, marks and total, instructions and answer spaces. The student paper must not leak key answers. The answer key must refer to the same questions, versions and marks. Reopened work must preserve the intent promised by its actual flow. Record any manual corrections in the app versus Word separately; corrections needed after export are findings, not invisible success.

Retain the exact student/key files in approved private storage, assign pair ID, record SHA-256 for each and any permitted safe storage reference. Record who inspected them, Word version, date, page counts, clipping, direction, editability and reported acceptance. If LibreOffice is also used, record its observation separately. A changed file gets a new hash and review. Browser content, package validation and human visual acceptance remain separate layers. No local or bundled DOCX rendering is authorized by this protocol.

## Pause, repair and interpretation

Stop the affected task on suspected security/privacy exposure, data loss, wrong answers or invalid paper. Preserve only safe reproduction evidence; contain access as authorized, and require owner-approved resumption after the fix and relevant retest. Never expose another participant's work to reproduce a defect. See [triage](support-and-triage.md).

Keep observations, brief quotes (with permission), inferred cause, severity and proposed remedy distinct. Record evidence that contradicts the expected benefit. Ask about the most recent real preparation task before speculative future preferences. Intended reuse is an answer; actual reuse requires a later observed event. No market-share, age, demand or pricing conclusion follows from this small alpha.

Freeze protocol version and briefs before the first session. Record any amendment, reason and effective attempt range before applying it. Never change thresholds after seeing results. Preserve historical Phase 15/14 acceptance at its exact scope. Gate completion and Phase 17 work are not authorized by preparation alone.

## Method clarification v1.1 — 21 October 2026, before teacher attempts

Owner correction: one person coordinates the trial and handles support; contact with teachers is through text, without direct observation. The [short text pack](teacher-text-pack.md) supports this feasible collection method. No separate observer or support staff is presumed. The intended private route is the owner's existing one-to-one conversation. The period was initially unconfirmed; the v1.2 decision below now fixes it. The actual private service/storage and practical deletion route remain part of pre-session readiness.

This clarification adds a text-feedback round without changing the original success gate. Mark observation mode as `remote-text-self-report`. Teacher claims about actions, duration, help or completion are reported evidence, not direct observation or demonstrated independent success. Review of an original returned paper/key pair supports only the exact artifact facts actually inspected, with reviewer/application/hash evidence. Keep these layers separate in [text feedback records](records/text-feedback.csv).

Effective scope: future text-feedback reports; no existing teacher attempt/result is reclassified. Do not mix these reports into an observed-workflow numerator or denominator without a separately recorded, explicit acceptance-method decision. If an eligible observed attempt starts under the original protocol, its original all-started-attempt rules still apply. Text-only reports neither erase failed observed attempts nor close missing observation evidence. Three teachers, two distinct observed workflows each, at least 80% independent success and zero known Alpha P0/P1 defects remain the existing formal gate. That gate remains unverified without the required evidence.

## Retention clarification v1.2 — 21 October 2026, before teacher attempts

Owner selected **30 days after the trial ends** for trial feedback and copies of papers teachers send to the owner. This covers collected feedback/notes and received paper copies, not app-bank/saved-paper retention, account data or operational logs. The owner is the removal contact through the existing private conversation.

Confirm trial end-date arrangements before consent; record the actual end date and the date 30 days later privately. The owner performs manual removal and records completion privately, including any agreed earlier removal. No automatic deletion, reminder or app-data operation is introduced. Do not publish real feedback, consent/contact records or deletion logs in this repository, Linear or the shared Brain.

Effective scope: future collected feedback/copies. No real participant data was collected or deleted by this update. The original participation, observed-workflow, independent-success and defect gates remain unchanged; selecting retention does not make sessions ready or pass the Alpha gate.
