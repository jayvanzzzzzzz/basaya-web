# BaSaya web assistant

Open `student/#/assistant` after signing in as a student. The robot icon in the
header and “BaSaya Assistant · AI Help” in the account menu open this page.
Android is unchanged.

## Deployment

- Vercel project: `basaya-notify-api`, deploy root `notify-api/`.
- Required server secret: `GROQ_API_KEY`. Optional `GROQ_MODEL` defaults to
  `openai/gpt-oss-20b`. Keep the Groq account on its Free plan if zero AI spend is
  required. App limits control usage; they do not select the provider's billing plan.
- `POST /api/assistant` rewrites to the existing shared function. No additional
  Vercel function or new dependency is needed. Deploy the rewrites with the backend.
- Existing Firebase Admin credentials and `ALLOWED_ORIGINS` apply. Local XAMPP
  origins `http://localhost` and `http://127.0.0.1` are already allowed.
- Publish the web files through the normal website workflow; local XAMPP uses
  the changed workspace directly. Regenerated `offline-shell.js` updates PWA caches.
- No Firestore rule changes are necessary: private top-level assistant collections
  are denied by default. Backend tests verify client reads and writes fail.

## Content and scope

`js/assistantHelp.js` contains eight public app-help articles, including the
user-approved creator names and school. Change workflow
facts there, bump `HELP_VERSION`, then run:

```
node tools/build-assistant-help.mjs
node tools/build-offline-shell.mjs
```

The first command bundles the same facts inside Vercel's deploy root. Tests check
that the server copy matches. All articles fit in one bounded prompt: there is no
phrase matching, vector database, search service, or per-question content upkeep.
AI receives the help reference and current question only, never student profiles,
scores, lesson answer keys, email, or prior chat turns. Each question is independent.
The prompt limits the assistant to app help, not lesson tutoring. Prompt guidance
reduces unsupported answers but cannot guarantee factual correctness; pilot review
with actual student questions is still necessary.

Responses always use simple Tagalog, including for English/Taglish questions and
unrelated topics. Existing app names and screen labels are retained. The response
policy version is included in cache hashes so earlier English answers are not reused.

Offline articles are always available after the PWA shell has been cached. AI
requires internet. Suggestions fill the input; sending remains an explicit action.
Generated text uses `textContent`, never HTML or generated navigation URLs.

## Abuse and budget controls

- Firebase token and student profile required, including for status checks.
- Five attempted AI requests per student per UTC day, shared across sessions.
- Debug exception: `jayvanz1@gmail.com` has no per-student daily cap. The handler
  verifies the email from the signed Firebase token against the current Firebase
  Auth account and passes its UID internally. Client profile emails and request
  flags cannot grant this exception. Shared app/provider caps, cooldown and pending
  lock still apply. The interface shows “Debug · No daily limit”.
- Ten-second cooldown and one server-side pending request (60-second lease).
- Maximum 500 input characters and 1,024 generated tokens, including reasoning.
- Global caps: 100 AI attempts / day, 20 / minute, 160,000 tokens / day and
  7,000 / minute. Other apps using the same Groq organization are not counted here;
  provider rate limits may therefore be reached earlier.
- Firestore transactions reserve budget before calling Groq. Concurrent tabs,
  instances and students share the same counters. Successful calls reconcile the
  conservative UTF-8-byte reservation to reported token usage. Unknown/failed
  outcomes retain their reservation and attempt count to prevent retry abuse.
- A student's latest identical question can reuse the saved answer for that day
  without another AI attempt; it still gets the ten-second cooldown.
- A provider 429 pauses subsequent upstream calls globally for its bounded retry
  period. Provider requests time out after 20 seconds. No automatic retries.
- UTC day reset is 8:00 AM in the Philippines/Singapore. UI uses the viewer's
  local time. The Groq account may have different quota windows.

## Stored data

`assistantUsers/{uid}`: daily attempt count, cooldown, pending lease and hash of
the latest question with its answer. The raw question is not persisted by BaSaya.
`assistantUsage/{UTC-date}`: global request/token counters and provider cooldown.
Browser transcript is memory-only and scoped to the signed-in user; refreshing the
page does not reset quotas or delete the backend's latest-answer cache.
The generated answer may echo details from a question, so students should not
include personal information even though raw questions have no stored field.

Both collections have `expiresAt`. For automatic cleanup configure Firestore TTL
on that field (user state: day reset + 1 day; global counters: reset + 7 days).
Without a TTL policy, documents persist; an old user's single cache is overwritten
on the next successful question. Questions are sent to Groq under its data policies.
No API keys, raw questions or provider response bodies are logged by the handler.

## Verification

```
node tools/assistant-tests.mjs <java.exe> <firestore-emulator.jar>
node tools/assistant-browser-tests.mjs
```

Backend tests use a real Firestore emulator and stubbed provider. Browser tests
use the real assistant view and CSS with synthetic API responses. They cover
authentication roles, validation, concurrent requests, quotas, cache, failures,
provider pauses, midnight reset, private collection rules, mobile/dark layout,
offline guides, HTML injection, and leaving during a request.

For an isolated visual preview with synthetic answers:
`node tools/serve-assistant-preview.mjs`, then open
`http://127.0.0.1:8794/student/`. This preview makes no Firebase or Groq calls.
Screenshots are in `audit/assistant/`. A live signed-in student test is separate
from these automated checks and should confirm the deployed model's answer quality.

The assistant now shares Class Chat's layout, message bubbles, scroll area and send
button. Help articles are behind the Help toggle. Suggestions appear only before
the first user message. The small
questions-left indicator is separate from transient status; the reset notice only
appears when the account is exhausted.

Assistant message avatars use the existing BaSaya logo; the chat header icon is
unchanged. While a request is pending, a temporary three-dot typing bubble is
shown. New answers fade in one sentence every 500 ms. Complete text is saved in
the in-memory transcript before revealing, so returning to the screen shows it
immediately. Leaving cancels reveal timers. Reduced-motion preferences disable
the bounce/fade and display complete answers immediately. Animation requires no
additional provider requests or tokens.
