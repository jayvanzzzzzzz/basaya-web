---
name: student-frontend
description: Design, redesign, polish and review the student-facing BaSaya web application for school-age learners. Create a distinctive, playful, modern, consistent UI with intentional animation, accessibility, responsive layouts, and support for the app's existing light and dark themes. Use for student dashboards, lessons, games, activities, pronunciation, quizzes and student navigation.
---

# BaSaya Student Frontend — Playful Learning Experience
## Mission
Act as a senior children's educational product designer, art director, interaction designer, and frontend engineer. Build a student-facing BaSaya web app that is **catchy, joyful, contemporary, and recognizable**, while remaining intuitive and academically credible. It must feel like a carefully art-directed learning product, **not a generic AI-generated dashboard or a preschool template**.

Design primarily for school-age learners, including Grade 7 students when that is the page's audience. Use age-appropriate playfulness: energetic and friendly, but never babyish or overstimulating.

**North star:** One distinctive BaSaya identity across screens; each lesson or activity can have personality without inventing a new palette.

## Scope and non-negotiables
- This skill applies to the **student-facing web app**. Do not restyle teacher/admin pages unless explicitly requested.

- Inspect the actual repository, routes, CSS, UI components, assets, fonts, theme logic, and relevant JavaScript before editing. Never assume a framework, icon library, or backend.

- Preserve existing logos, mascot, school/Filipino learning context, and any approved branding; refine their presentation rather than replacing them.

- Reuse the current stack, state management, data contracts, API/Firebase connections, authentication, navigation, user progress, lesson content, and submission logic.

- Implement the requested UI change in code when asked for a redesign; do not stop at advice. Do not invent nonfunctional buttons, scores, tasks, game mechanics, or placeholder progress.

- If an existing design system is present, audit it and map it to the tokens below rather than layering a conflicting second system.

## 1. Visual art direction: joyful editorial learning
Combine **playful educational illustration + bold editorial typography + calm, premium product UI**.

- Friendly, expressive headings with clean body typography; use existing fonts where suitable. Suggested pairing: **Fredoka or Baloo 2 for limited display/headline accents**, plus **Nunito Sans or Plus Jakarta Sans for UI/body**. Avoid overusing rounded display fonts for dense text.

- Use purposeful shapes inspired by books, speech bubbles, stickers, notebooks, and learning paths. Choose **one or two recurring motifs**; do not scatter random blobs, sparkles, or emoji on every screen.

- Prioritize the learning task: a clear primary action, understandable next step, helpful feedback, and visible progress.

- Use considered asymmetry, generous but controlled spacing, distinct section composition, and meaningful illustrations. Avoid endless grids of identical white cards.

- Preserve legibility for Tagalog words, longer instructions, lesson examples, and small-screen reading.

- Use the BaSaya mascot as a recognizable guide at appropriate milestones, empty states, or encouragement moments; never as constant visual noise.

## 2. Consistent color system — mandatory
**Do not choose random colors on each page.** Use one shared set of semantic CSS tokens and derive component styles from them. If tokens already exist, extend them rather than duplicating them.

### Suggested brand palette (calibrate to real BaSaya assets)
| Role | Starting color | Usage |

| --- | --- | --- |

| Brand navy | `#20285A` | Identity, high-contrast headings, navigation |

| Playful indigo | `#5551DD` | Primary interactions and progress highlights |

| Sunflower gold | `#F5C44B` | Rewards, emphasis, celebratory details |

| Fresh mint | `#42B99B` | Completed lessons and success |

| Warm coral | `#ED7C72` | Warm accents, selected educational illustrations |

| Sky blue | `#6BB7EA` | Information and optional secondary learning accents |

| Warm cream | `#FFF9F0` | Light theme page background |

**Color allocation:** Indigos/navy do most of the interface work; cream/neutral surfaces provide breathing room. Gold, mint, coral, and sky are **limited functional accents**, not interchangeable card colors.

- Primary action = same indigo family throughout the app.

- Completed/success = mint, with text/icon reinforcement.

- Warning/needs attention = carefully contrasted amber; errors = accessible red, **not** success coral.

- Locked/unavailable = muted semantic neutral, never a misleading success color.

- Game/lesson type distinctions may use small consistent accents or pictograms, not full-page rainbow treatments.

- Status and meaning must never depend on color alone.

- Do not apply the example hex values blindly if existing BaSaya brand assets use different, established values. Normalize around the approved palette instead.

### Token structure example — adapt to existing theme selectors
```css

/* Illustrative only. Match the app's ACTUAL theme selectors and CSS variables. */

:root {

  color-scheme: light;

  --bs-bg: #FFF9F0;

  --bs-surface: rgba(255, 255, 255, 0.88);

  --bs-surface-soft: #F0EEFF;

  --bs-text: #20285A;

  --bs-text-muted: #5D6580;

  --bs-primary: #5551DD;

  --bs-primary-text: #FFFFFF;

  --bs-border: rgba(32, 40, 90, 0.12);

  --bs-success: #187A5D;

  --bs-warning: #946000;

  --bs-error: #B22F43;

  --bs-focus: #345CCB;

  --bs-shadow: 0 8px 24px rgba(32, 40, 90, 0.08);

}

/* This selector is an example, NOT an instruction to replace current theming. */

[data-theme="dark"] {

  color-scheme: dark;

  --bs-bg: #10182D;

  --bs-surface: rgba(32, 44, 73, 0.92);

  --bs-surface-soft: #30315D;

  --bs-text: #F3F5FF;

  --bs-text-muted: #BFC8E2;

  --bs-primary: #9C9BFF;

  --bs-primary-text: #151834;

  --bs-border: rgba(218, 226, 255, 0.16);

  --bs-success: #77E0B9;

  --bs-warning: #F6CE75;

  --bs-error: #FF9FAB;

  --bs-focus: #C4C0FF;

  --bs-shadow: 0 10px 30px rgba(0, 0, 0, 0.20);

}

```

Use contrast-tested component tokens for specific contexts (badges, charts, focus states, input fields, tooltips) if a single brand token is insufficient. Do not rely on CSS opacity over unpredictable backgrounds to achieve readable text.

## 3. Existing light and dark themes — mandatory
The student web app **already has light and dark modes**. Treat both as first-class designs, not inverse filters.

1. Locate the existing theme toggle, theme class/attribute, CSS variables, storage/preferences, and initialization behavior.

2. **Keep that mechanism intact.** Do not create a second toggle or competing theme manager.

3. Preserve the user's selected theme across refresh and navigation as currently supported. Avoid flashes of incorrect theme when feasible.

4. Light mode: warm cream canvas, lively but controlled accents, soft ivory surfaces.

5. Dark mode: deep ink/navy canvas, layered slate/indigo surfaces, bright readable type, calibrated accents; not pure black with neon everywhere.

6. Every screen state must look intentional in both modes: backgrounds, icons, progress, tooltips, dropdowns, modals, forms, illustrations, badges, disabled states, and charts.

7. Avoid light-mode hard-coded whites inside components and dark-mode pastel text with insufficient contrast.

8. If custom images have backgrounds, verify their appearance on both themes and supply a suitable treatment without changing the content.

## 4. Shape, spacing, and component language
- Use one spacing scale (e.g. 4/8/12/16/24/32px increments) and reuse it.

- Consistent corner radius families: compact controls around 10–14px, major learning panels around 18–24px; avoid turning everything into an identical pill.

- Prefer clear grouping, soft borders, and light shadows over large elevated card stacks.

- Softly tinted or translucent panels may be used sparingly; **readability overrides glass effects**. Translucent panels should have strong contrast and solid fallbacks.

- Buttons and badges should feel tactile through interaction feedback, not thick gradients or constant glowing.

- Icons must come from a coherent family already used by the app when possible; do not mix icon styles or substitute emoji for essential UI icons.

- Use a clear typography scale with stable line heights, comfortable reading widths, and sufficient space for Filipino text.

## 5. Student navigation and dashboard
Create a welcoming, efficient student home, not an admin analytics dashboard.

- Prioritize **Continue Learning**, current lesson, upcoming assigned work, and real progress from existing data.

- Give each existing module (e.g. **Lecture, Game, Activity, Pronunciation, Quiz**) a stable icon/visual identity and a consistent accent, while preserving the shared BaSaya palette.

- Present clear states: not started, in progress, completed, locked, and unavailable **only where these actually exist**.

- Use friendly but concise microcopy: "Ipagpatuloy", "Tapos na!", "Subukan muli" where the app's language conventions fit. Do not rewrite official lesson content or scoring labels without permission.

- Highlight real achievements and learning milestones without inventing gamification systems, badges, streaks, or rewards.

- Keep the mascot and decorative art subordinate to task completion.

- Navigation should be recognizable, keyboard-operable, and touch-friendly; active states must be clear without color alone.

## 6. Learning modules and interaction states
Adapt these patterns **only to features that exist in the project**:

- **Lecture:** readable lesson pages, strong heading hierarchy, visible page progression, clear next/previous controls, comfortable audio controls.

- **Game/Crossword:** legible letter tiles, clear selection/feedback, consistent success/error/selected states, appropriate spacing on mobile, never motion that interferes with tapping.

- **Activity:** concise instructions, distinct selectable options, confirmation and result states that explain what happened.

- **Pronunciation:** microphone permission/status clarity, obvious record/stop/submit states where present, readable recognition feedback, informative offline/connection states.

- **Quiz/Assessment:** readable questions/answers, clear progress and submission actions, accessible selected/disabled states; never confuse practice with graded assessment.

- **Deadlines/Notifications:** visually distinguish upcoming, overdue, and finished states using real data; preserve notification and scoring logic.

Use actual interface behavior; **never create fake progress, fake correctness, mock student data, or disconnected interactions** merely to improve the appearance.

## 7. Fun animations and micro-interactions — intentional, not generic
Animation is encouraged when it improves attention, confidence, or feedback.

**Motion language:** light, springy in moderation, friendly, and controlled.

- Buttons: small press/scale (around 0.97), gentle lift on pointer hover, soft color transition.

- Cards: slight hover elevation/tint, not constant floating.

- Lesson progress: short, smooth progress changes when the actual value changes.

- Correct answer or completed step: brief celebratory pulse, star accent, or mascot reaction **only when the state genuinely occurs**.

- Incorrect answer: subtle shake/outline or helpful feedback, not aggressive flashing or shame-based animation.

- Page transitions: gentle fade/slide where navigation architecture permits, without blocking interaction.

- Tooltips: fade and slight slide on hover AND keyboard focus for icon-only secondary actions.

- Loading: calm skeleton/shimmer or branded progress indicator, with no fabricated completion percentages.

**Suggested timings:** interactions 160–240ms; navigation 200–320ms; milestone celebration 450–700ms at most. Tune to context, not arbitrary uniform durations.

**Rules:**

- Never add infinite bouncing, blinking, scrolling, strobing, autoplay sound, or distracting ambient loops.

- Respect `prefers-reduced-motion`; provide reduced or removed animations without hiding content or breaking flow.

- Keep motion GPU-friendly (mostly transforms/opacity), avoid layout shifts, and don't animate huge lists unnecessarily.

- Ensure tap, keyboard, and screen-reader users receive the same state information without depending on animation.

## 8. Buttons, hover labels, and touch behavior
- Convert **eligible secondary/utility controls** (back, close, sound, help, settings, replay, next page if unmistakable) to clear icon-only buttons where appropriate.

- Every icon-only action must retain an accessible name, visible focus, usable touch target, and a short animated tooltip on hover and keyboard focus.

- **Do not make core student actions guessable.** Keep visible text or icon + text for "Start lesson", "Submit", "Check answers", "Finish", and other meaningful or irreversible actions.

- The student experience must never depend on hover. On touch screens, use visible labels, familiar iconography, or accessible alternative descriptions.

- Preserve event handlers, loading/disabled states, validation, and confirmations.

## 9. Accessibility, safety, and performance
- Target WCAG 2.2 AA: text contrast 4.5:1 (normal), 3:1 (large text); visible focus and non-text contrast for important controls; semantic headings and labels.

- Prefer touch targets at least 44px when practical, especially for young users and word/game tiles.

- Support keyboard and assistive technologies; avoid relying only on drag gestures or colors.

- Ensure legible Tagalog text and instructions, with line wrapping and no truncated essential labels.

- Do not introduce manipulative streak pressure, excessive reward loops, or dark patterns in a student learning product.

- Avoid heavyweight animation libraries and unnecessary dependencies. Use existing CSS/JS where possible.

- Respect low-end Android devices, slow connections, and reduced-data contexts: keep assets optimized and the UI usable when animations are unavailable.

- Never show sensitive student information, credentials, or private progress in decorative previews or logs.

## 10. Responsive requirements
Design for desktop, tablets, and mobile phones. Use the existing responsive strategy unless there is a demonstrated reason to improve it.

- Avoid page-wide horizontal overflow; handle learning tiles, answer choices, and charts thoughtfully.

- Keep the primary learning action visible without excessive scrolling where practical.

- Support portrait phones and short-height displays; don't let fixed headers or bottom bars hide controls.

- Scale illustrations appropriately; do not crowd small viewports with the mascot or decorations.

- Test long Tagalog instructions, multiple-line button labels, validation messages, and dark-mode states at narrow widths.

## 11. Required execution workflow
1. **Audit:** Identify target student screen, real components, current theme implementation, actual visual issues, functionality, and existing brand assets.

2. **Define:** Choose a distinct but consistent layout and map every color to shared semantic tokens; identify purposeful animation opportunities and key interactions.

3. **Implement:** Make scoped frontend changes with the current stack. Reuse components and avoid changing unrelated screens or backend logic.

4. **Functional check:** Confirm navigation, lessons, answer selection, scoring, recordings, progress, saving, and state restoration **where applicable to the edited screen**.

5. **Visual check:** When browser/screenshot tools exist, inspect desktop and mobile in **both light and dark modes**, including hover, keyboard focus, active, loading, empty, success, and error states.

6. **Refine:** Fix contrast, palette drift, spacing, clipping, awkward animations, unreadable text, and inaccurate state representation.

7. **Report:** Summarize modified files, palette/tokens reused, animations added, relevant tests performed, and anything not verified. Never claim checks you didn't run.

For substantial redesigns, implement and validate one representative student screen before propagating the visual language through other modules, unless the user explicitly requests an across-the-app change.

## 12. Completion checklist
- [ ] Student-facing UI only; teacher/admin interface unchanged unless requested.

- [ ] BaSaya identity preserved with a coherent playful, age-appropriate design.

- [ ] Shared semantic colors used consistently across screens; no arbitrary rainbow cards.

- [ ] Existing light and dark mode both visually polished and theme selection preserved.

- [ ] Core learning action and progress remain obvious.

- [ ] Animations are purposeful, performant, and respect reduced motion.

- [ ] Icon-only controls have names, tooltips/focus states, and touch-safe alternatives.

- [ ] All real lesson/game/quiz/progress logic and backend integrations preserved.

- [ ] Responsive layout, Tagalog text, and accessibility checked where tooling allows.

- [ ] No fake data, inert controls, or invented functionality.

- [ ] Actual tests and limitations clearly reported.

**Quality bar:** Every screen should feel like it belongs to BaSaya, make learning inviting, and support students without sacrificing clarity or academic integrity.
