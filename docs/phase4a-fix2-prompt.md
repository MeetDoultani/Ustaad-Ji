# PHASE 4A: FINAL FIX ROUND (small; do not start Phase 4B)

Your follow-up report fixed the chair-busy race, the phone masking and the OTP guard well. A review of the report found the items below. Fix them. Do not change booking, auth, status-machine or database behaviour, and do not weaken any test. Do not claim anything works unless you ran it and saw the output.

## 1. English text leaking into Hindi mode
- `walkInName` is saved as the English text `'Walk-in Customer'` when staff leave the name empty, and the register DTO builds `'Walk-in'` and `` `Customer (${maskedPhone})` `` in English. A nameless walk-in therefore shows English in Hindi mode.
- Fix: store `null` when the trimmed name is empty. The register and detail DTOs return `customerName: string | null` plus the source, never English display text. The UI builds the label from message keys (walk-in = "Walk-in" / सीधे आए ग्राहक; a customer without a name = "Customer" / ग्राहक with the masked phone). Check `prisma/seed.ts` does not write the English placeholder.
- Then search ALL of `src/`, not only JSX, for user-visible English strings built in services, DTO builders, server actions, metadata and error handlers. Give me a table: file:line | string | where the user sees it | fix. Fix every one that reaches the screen.

## 2. The `react/jsx-no-literals` rule is too weak
- The rule is set to `"warn"`; I asked for `"error"`. Set it to `"error"`.
- `allowedStrings` contains real text that is visible to users: `"Max 80 characters."`, `"All rights reserved © 2026 • Ustaad-Ji"`, `"slug: /"`, `"No."`. Remove every real word or sentence from the list. Keep only punctuation, symbols, emoji, digits and the brand name. Move the texts to `en.json` / `hi.json` (keep parity).
- `ignoreProps: true` means attribute text is never checked. Add a Vitest audit that fails on literal text in `placeholder`, `aria-label`, `title`, `alt`, `aria-description` and `label` attributes in `.tsx` files (ignore `className`, `href`, `id`, `key`, `type`, `name`, `role`, `data-*`). Fix every hit.
- Show the raw `npm run lint` output and the list of violations you fixed or moved.

## 3. Old-name search was not what I asked for
Your search used different terms, covered only `src/`, and used `git grep` (tracked files only). The earlier report also printed `?????` where Devanagari should be, so a Devanagari term typed into the Windows terminal may not match. Replace it with a Vitest test that scans every text file outside `node_modules`, `.next` and `.git` (including `src`, `docs`, `README.md`, `package.json`, `public`, `prisma`, `src/messages`) and writes the Devanagari terms as `\u` escapes. Terms: `देसी`, `Indian Salon`, `Indian-salon` (the folder name does not count), `Dekhein`, `Pakka`, `Aapka`, `Hinglish`, `Guaranteed`, `गारंटीड`, `Phase 4`, `चरण 4`. List each allowed exception (for example negative assertions in tests, or history notes in `docs/decisions.md`) with a reason. Paste the raw output.

## 4. Two numbers that do not agree
Your first Phase 4A report said "481 keys each"; the follow-up's raw command printed 431. State which is correct, whether any message key was removed after the first report (list them), and remove any number you did not measure from the docs and reports.

## 5. A test was changed and not reported
In the first report the walk-in test in `dashboard.test.ts` logged the real clock time; in the follow-up the same test logs a fixed `2026-11-04T04:30:00.000Z`. Show the `git diff` of every existing test file changed since the first Phase 4A report and explain each change. Injecting a fixed `now` is fine (a test that depends on the real time of day fails at night), but it must be reported. List every test that still depends on the real clock (`Date.now()`, `new Date()`), and give those an injected `now` as well.

## 6. Report honesty
- Your "COULD NOT VERIFY" section listed SMS delivery and Redis. It must list the UI behaviours you have not seen in a browser: register layout and one-handed use at 360px, the 30-second refresh and pause when the tab is hidden, the print slip, the language switch keeping date and barber filter, the stamps on customer pages, the status buttons and the cancel dialog.
- Your manual checklist used accounts that are not in the seed ("Ramesh Kumar", +91 98765 00001, an owner with several branches). Do not invent data. Quote the lines of `prisma/seed.ts` that define the accounts, and state that no seeded owner has two salons.
- Also say honestly that the nameless-walk-in label, the stamps, the language switch and the layout are unverified until I have tested them.

## 7. Final report format
Raw `npx prisma validate`, `npx prisma migrate status`, `npm run lint`; the whole `test-output.txt` from `npx vitest run --reporter=verbose > test-output.txt 2>&1`; the `test:utc` and `test:ist` summaries; `npm run build` with the route list; the updated requirement-to-test table; the corrected COULD NOT VERIFY section.

## 8. Check in and Start on the wrong day (a gap in the Phase 4A spec, found by Meet while testing)
A booking for tomorrow can currently be checked in, started and completed today (open tomorrow's register, press Check in). Fix it:
- `CONFIRMED -> CHECKED_IN` and `CONFIRMED -> IN_PROGRESS` are allowed only when the IST calendar date of the booking's `startsAt` equals the IST calendar date of `now`. Any time of that day is fine (customers arrive early). Otherwise return a new code `WRONG_DAY`, translated in both languages (English: "You can check in only on the day of the booking."; natural Hindi).
- A booking from a past day that is still CONFIRMED cannot be checked in or started; staff can still mark NO_SHOW (already allowed after `startsAt`) or cancel it. `CHECKED_IN -> IN_PROGRESS`, `IN_PROGRESS -> COMPLETED`, accept, reject and cancel are not affected.
- Put the rule in the pure state machine (it receives `now` and `startsAt`, like the NO_SHOW rule) and enforce it in `dashboard-service.ts`. The server is the authority. In the register and on the booking detail page, hide Check in and Start for bookings that are not today; the "Next customer" button considers only today's bookings.
- Use the IST date, never the UTC date: a booking at 00:30 IST today is 19:00 UTC yesterday.
- Tests: a pure table (tomorrow rejected, today allowed, yesterday rejected, 23:59 and 00:00 IST boundaries, the 00:30 IST case); an integration test through the service with an injected `now`; the new code in both message files with parity. List the UI hiding under COULD NOT VERIFY.

## 9. Bugs Meet found while testing (Meet pastes them here before sending)
(none yet)

Do not start Phase 4B.
