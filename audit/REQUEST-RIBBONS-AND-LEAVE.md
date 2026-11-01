# Request ribbons, bulk leave approval and Students indicator

The teacher Students page now has a violet Join requests ribbon and an amber Leave
requests ribbon, each with a live pending count. Switching ribbons preserves the chosen
tab for that class when the roster refreshes. The enrolled roster stays below both panels.

Leave requests include search, individual checkboxes, Select all shown, mixed selection
state, Approve selected with the selected count, and individual approval/decline controls.
Search changes clear selection. Live cancellation or a replacement request clears stale
selection. Bulk approval lists the selected students and explains that their class progress
and scores will be deleted; no removal starts before the teacher confirms.

Approval re-reads each request before calling the existing remove-student API, skips
requests already cancelled/changed and reports partial failures. This reuses the current
removal endpoint; it does not add a server-side atomic cancellation guard. Individual
decline uses a Firestore transaction to check the current request and preserve membership,
with an optional note. No real student was removed or declined during development.

The Students button on the class overview now has a red dot whenever that class has a
pending join OR leave request. It is an active-request indicator: opening Students does
not clear it. It disappears when both kinds have been resolved. Both subscriptions stop
when leaving the class page or switching classes, and the button has an accessible label.

This update changes website files only. It needs no additional API deployment, Firestore
rules change, or Android build. It relies on the approval API/rules introduced in phase 2.

Verification:

- 22 new interaction checks passed for ribbons, selection, confirmations, cancellation,
  stale requests, partial failures, decline, red-dot behavior and listener cleanup.
- All 18 existing join-request selection/routing checks passed.
- All 17 offline regression checks passed after rebuilding the offline shell.
- All 122 website JavaScript files passed syntax parsing.
- The fictional local preview includes both ribbons, leave confirmation/decline and the
  Students red-dot indicator. Preview: `http://127.0.0.1:8786/audit/admissions-preview.html`.
  Rendered layout was not visually verified because no browser connection was available.

Run the interaction checks from the website root:

```powershell
node --experimental-vm-modules tools/leave-requests-ui-tests.mjs
node --experimental-vm-modules tools/join-requests-ui-tests.mjs
```
