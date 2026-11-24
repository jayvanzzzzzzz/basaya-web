# Teacher and admin AI Handbook

Open `teacher/#/handbook` or `admin/#/handbook` after signing in with the appropriate role. Both sidebars include AI Handbook.

- Each teacher/admin account has 10 questions per UTC day and a 10-second cooldown starting when the server accepts a question. Accepted attempts consume allowance, including cached repeats. Uncertain provider failures retain the reservation, as with the student assistant.
- Allowance resets at midnight UTC; the page displays the reset time in the browser's local timezone when exhausted. The existing shared app/provider budgets still apply.
- Authentication and role are checked on the server. The role-specific reference and question are sent to Groq; personal records and conversation history are not sent. Each question is independent.
- Staff answers are instructed to match English, Filipino, or Taglish questions. Student language, five-question allowance, and debug account behavior remain as before.
- Three staggered dots indicate a pending response. New answers fade in one measured visual line at a time. Reduced motion displays the complete answer immediately. Leaving the page stops local animation and cancels the browser request; it does not refund an accepted server request.
- Searchable reference articles stay readable without AI availability. Clear conversation clears local messages, not allowance.

Update `js/handbookHelp.js`, bump `HANDBOOK_VERSION`, and run `node tools/build-assistant-help.mjs` to bundle the same facts into `notify-api/lib/handbookHelp.js` for Vercel. The existing API endpoint and Groq configuration are reused. No new dependencies or Firestore rules are required.

Deploy the backend from `notify-api/` and publish the frontend together. The old deployed backend only accepts students. This change does not itself deploy either service.

Verification:

```text
node tools/assistant-tests.mjs <java.exe> <cached-firestore-emulator.jar>
node tools/handbook-browser-tests.cjs
node tools/assistant-browser-tests.mjs
```

The browser checks use the real portal HTML/CSS and handbook module with synthetic auth and API responses. Screenshots are saved under `audit/handbook/`. Backend checks use the Firestore emulator with a synthetic Groq response. Live provider answer quality and deployed endpoints require verification after deployment.
