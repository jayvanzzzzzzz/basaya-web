---
name: basaya-frontend-design
description: Design and redesign BaSaya educational web interfaces using a distinctive Contemporary Editorial Academic aesthetic, premium UI/UX standards, light and dark mode, icon-first controls, animated tooltips, translucent surfaces, and responsive layouts. Use when redesigning, styling, polishing, or reviewing the BaSaya frontend.
---

# BaSaya — Premium Frontend Design Skill

## 1. Role and Objective

Act as a senior product designer, creative director, UI/UX specialist, accessibility expert, and frontend engineer.

Your goal is to transform BaSaya's existing web application into a distinctive, sophisticated, production-quality educational platform.

The final interface must feel intentionally crafted by an experienced design team rather than assembled from generic dashboard templates.

**Primary design direction:**

Contemporary Editorial Academic + Premium Educational SaaS + Subtle Playful Identity.

Design characteristics:

- Modern and sophisticated

- Unique and recognizable

- Professional and trustworthy

- Clean and thoughtfully composed

- Visually elegant without unnecessary decoration

- Intuitive for teachers and school administrators

- Consistent across every page

- Responsive and accessible

- Practical for everyday educational workflows

Prioritize design quality over decorative complexity.

## 2. Project Understanding

BaSaya is a Filipino educational learning platform.

The teacher-facing website includes classroom management, lessons, students, messages, dictionary management, assessments, and other educational workflows.

Before modifying any interface:

1. Inspect the existing project structure.

2. Identify the frontend technologies and CSS conventions.

3. Understand the intended users and each page's purpose.

4. Identify existing reusable components.

5. Examine the current brand assets, logo, mascot, typography, and colors.

6. Identify functionality that must remain unchanged.

Never assume a particular page structure without inspecting the actual source code.

## 3. Visual Identity

Follow an approximate design balance of:

- 85% professional academic interface

- 15% playful educational personality

Preserve BaSaya's brand identity while improving its visual quality.

The interface should resemble a premium, thoughtfully designed educational product.

Use editorial typography, carefully composed layouts, refined navigation, and restrained visual effects.

Avoid turning the application into a childish interface or a generic corporate dashboard.

### Suggested Colors

| Token | Color | Purpose |

|---|---|---|

| Academic Navy | #1F2559 | Primary brand identity |

| Soft Cream | #F8F5EC | Main page background |

| Muted Lavender | #EAE7F8 | Secondary tinted surfaces |

| Soft Sky | #EAF2FF | Informational surfaces |

| Mint | #DDF3E4 | Positive states |

| Warm Gold | #F6D36A | Limited highlights |

| Text Primary | #20243A | Main text |

| Text Secondary | #626B7B | Supporting text |

These are starting values, not mandatory replacements for established brand colors.

Define reusable CSS custom properties.

Use consistent semantic colors for success, warning, error, and information states.

Do not use color alone to communicate meaning.

### Typography

Use confident, expressive, and highly readable typography.

Preferred fonts:

- Plus Jakarta Sans

- Manrope

- Sora

- Inter

Use no more than two complementary font families unless the existing branding requires otherwise.

Establish a consistent typography scale for page headings, section headings, body text, captions, metadata, and labels.

Prefer intentional typography over oversized headings everywhere.

## 4. Editorial Layout Standards

Create layouts that feel designed rather than automatically generated.

Principles:

- Strong information hierarchy

- Purposeful asymmetry

- Balanced whitespace

- Consistent alignment

- Carefully controlled content density

- Distinctive page compositions

- Clear section relationships

- Predictable navigation

- Responsive grid systems

Avoid repetitive grids of identical cards when the information benefits from different visual priorities.

Give important classroom and teaching information appropriate prominence.

Use whitespace to establish hierarchy, not merely to make pages look empty.

## 5. Icon-First Interaction System

Prefer icon-only controls for secondary and utility actions when their meaning remains understandable.

Examples:

- Search

- Edit

- Delete

- Copy

- Filter

- Settings

- Notifications

- More options

- Expand or collapse

- Secondary classroom actions

- Quick navigation

Use a consistent icon library already present in the project, such as Lucide.

Do not mix unrelated icon styles.

### Icon Button Design

Icon-only buttons should have:

- Consistent dimensions

- Refined rounded-square or circular geometry

- Visually balanced icon sizes

- Subtle translucent backgrounds

- Soft borders when appropriate

- Smooth hover and focus transitions

- Clear pressed and disabled states

- Accessible names

- Visible keyboard focus indicators

Avoid excessive shadows, bright glows, or exaggerated scaling.

### Tooltip Requirements

Every icon-only button must have a descriptive accessible name and, where appropriate, a visual tooltip.

Tooltip behavior:

1. Hidden by default.

2. Appears on hover or keyboard focus.

3. Uses a subtle opacity and translation animation.

4. Displays concise, meaningful text.

5. Remains readable against the page background.

6. Avoids clipping at viewport boundaries.

7. Does not obstruct important content.

8. Dismisses appropriately when focus or hover ends.

Tooltips must never be the only means of understanding critical actions on touch devices.

### Primary Actions

Do not force icon-only treatment onto ambiguous or critical actions.

Keep visible text for actions such as:

- Create Class

- Publish Lesson

- Assign Activity

- Save Changes

- Submit Assessment

- Delete Confirmation

Where appropriate, combine an icon and short text label.

On mobile devices, prioritize clarity over visual minimalism.

## 6. Hover Animation System

Create restrained, polished micro-interactions.

Recommended timing:

- Standard interaction: 180–250ms

- Tooltip entrance: 150–200ms

- Small icon movement: 150–200ms

Preferred effects:

- Hover lift of approximately 2px

- Gentle background tint transition

- Slight icon scaling

- Tooltip fade and slide

- Subtle border emphasis

- Soft pressed feedback

- Smooth active navigation transitions

Avoid:

- Large bouncing effects

- Excessive glow

- Continuous decorative motion

- Distracting animation sequences

- Unnecessary page-wide transitions

Respect `prefers-reduced-motion`.

Animations should communicate interaction states, not compete with content.

## 7. Translucent Surface System

Favor softly tinted, translucent containers instead of excessively solid white cards.

Use subtle transparency to create visual depth.

Suggested starting values:

```css

:root {

  --surface-glass: rgba(255, 255, 255, 0.68);

  --surface-glass-strong: rgba(255, 255, 255, 0.84);

  --surface-border: rgba(31, 37, 89, 0.10);

  --surface-blur: 12px;

  --surface-radius: 16px;

}

.surface-glass {

  background: var(--surface-glass);

  border: 1px solid var(--surface-border);

  border-radius: var(--surface-radius);

  backdrop-filter: blur(var(--surface-blur));

  -webkit-backdrop-filter: blur(var(--surface-blur));

}

```

These are examples, not rules to apply indiscriminately.

Use transparency only when it meaningfully improves visual depth.

Do not apply glassmorphism to every element.

Maintain readable text contrast.

Provide a solid or sufficiently opaque fallback where backdrop filtering is unsupported.

Avoid excessive nested translucent containers.

## 7A. Light and Dark Mode Design System

BaSaya already has a dark mode theme. **Every redesign must support BOTH the existing light mode and dark mode with equal visual quality.** Do not implement a light-only design or replace the existing theme system.

### Inspect Before Editing

- Find how the existing theme is selected and applied (such as a class, `data-theme` attribute, CSS variables, saved preference, or system preference).
- Reuse the existing theme selectors, CSS architecture, toggle control, state persistence, and initialization logic rather than introducing a competing theme mechanism.
- Preserve the user's selected theme when navigating, refreshing, or signing in, to the extent the current app already supports it.
- Do not force dark mode or light mode, and do not silently change the existing default theme behavior.
- Avoid a flash of the wrong theme during initial page load where the app's existing architecture permits an early preference application.

### Theme-Aware Design Tokens

- Use shared **semantic tokens** for backgrounds, surfaces, borders, text, muted text, accents, shadows, focus rings, tooltips, and input states.
- Define appropriate light and dark values under the project's **existing** theme selectors. Avoid scattering hard-coded light colors through components.
- Both themes must preserve the same Contemporary Editorial Academic identity, recognizable navy-inspired branding, spacing, typography, and visual hierarchy.
- The light theme may use warm cream bases and softly tinted bright glass surfaces; the dark theme should use layered deep navy/slate surfaces, NOT pure black everywhere.
- Muted lavender, sky, mint, and gold accents should be adjusted for dark-mode contrast rather than reused at the same light-mode brightness.

Illustrative CSS pattern **only** (adapt to the project's actual selectors and tokens):

```css
:root {
  color-scheme: light;
  --page-bg: #F8F5EC;
  --surface: rgba(255, 255, 255, 0.68);
  --surface-strong: rgba(255, 255, 255, 0.88);
  --text-primary: #20243A;
  --text-muted: #626B7B;
  --border-subtle: rgba(31, 37, 89, 0.12);
  --tooltip-bg: #1F2559;
  --tooltip-text: #FFFFFF;
}

/* Example selector only; match the actual theme mechanism. */
[data-theme="dark"] {
  color-scheme: dark;
  --page-bg: #11182B;
  --surface: rgba(34, 46, 75, 0.76);
  --surface-strong: rgba(41, 54, 84, 0.92);
  --text-primary: #F4F6FC;
  --text-muted: #BDC8DB;
  --border-subtle: rgba(214, 224, 245, 0.16);
  --tooltip-bg: #EAF2FF;
  --tooltip-text: #17243A;
}
```

Do not copy these tokens blindly; calibrate them against the real backgrounds, imagery, and accessible contrast requirements.

### Translucency in Both Modes

- In light mode, use warm-white translucent surfaces with restrained tinting.
- In dark mode, use translucent deep navy or slate surfaces with sufficient opacity for legible content.
- Adapt border, shadow, and blur strength to each theme: dark surfaces may need subtle luminous borders rather than heavy black shadows.
- Do not use transparent light cards on dark backgrounds or translucent dark cards on light backgrounds unless intentionally and accessibly designed.
- Ensure overlays, dropdowns, popovers, modals, and tooltips remain readable and visually separated from what is behind them.
- Provide appropriate fallbacks when `backdrop-filter` is unsupported.

### Theme-Aware Interaction States

- Icon-only buttons, hover tooltips, navigation, inputs, status indicators, and charts need correctly contrasted normal, hover, focus, active, disabled, error, and loading states in **both themes**.
- Theme-toggle icons and accessible labels must reflect the current state or intended action accurately.
- Avoid hover-only theme controls; keyboard and touch interactions must work.
- Keep transitions restrained, and respect `prefers-reduced-motion`.

### Required Theme QA

Before completing ANY redesign:

1. Check the page in light mode and dark mode at desktop and mobile sizes.
2. Switch themes and verify that the interface updates without stale colors or hidden content.
3. Refresh and navigate between pages to check whether the existing saved preference still works.
4. Inspect text contrast, icons, translucent cards, form fields, menus, dialogs, charts, toast messages, and tooltips in both modes.
5. Test keyboard focus and hover states in both themes.
6. Report which theme checks were actually performed, and clearly identify any checks that could not be performed.

## 8. Component Standards

### Sidebar

- Preserve intuitive navigation.

- Use consistent icons.

- Create a refined active-state indicator.

- Use subtle translucent hover backgrounds.

- Support a collapsed icon-only mode when appropriate.

- Provide tooltips in collapsed mode.

- Keep keyboard navigation accessible.

- Preserve recognizable BaSaya branding.
- Ensure navigation and active-state styling works equally well in light and dark modes.

### Welcome Section

- Use expressive but controlled typography.

- Preserve the mascot where appropriate.

- Avoid oversized generic gradient banners.

- Prioritize meaningful teacher information.

- Maintain purposeful visual composition.

### Statistics

- Establish hierarchy between primary and secondary metrics.

- Use compact, readable layouts.

- Avoid unnecessary decorative charts.

- Use restrained iconography and semantic colors.

- Prevent redundant nested cards.

### Classroom Cards

Treat classrooms as central dashboard content.

- Make classroom names visually prominent.

- Display metadata clearly.

- Use icon-only secondary actions with tooltips.

- Include clear class-code copying feedback.

- Apply subtle hover states.

- Preserve intuitive classroom access.

- Avoid excessive decorative elements.

### Forms

- Use consistent input heights.

- Provide persistent labels for important fields.

- Maintain readable placeholder text.

- Show accessible validation errors.

- Support keyboard interactions.

- Preserve existing submission functionality.

### Empty States

- Explain what is missing.

- Suggest a useful next action.

- Use purposeful illustrations or icons.

- Avoid unnecessary visual clutter.

### Dialogs and Menus

- Use consistent spacing and typography.

- Maintain visible focus states.

- Handle focus appropriately.

- Support keyboard dismissal where expected.

- Use clear confirmation language for destructive actions.

## 9. Anti-Generic Design Rules

Avoid patterns that make websites feel automatically generated:

- Repetitive identical card grids

- Oversized rounded rectangles everywhere

- Purple gradients used without brand justification

- Excessive glassmorphism

- Decorative blobs and random shapes

- Unnecessary shadow stacking

- Generic dashboard hero banners

- Excessively large empty sections

- Inconsistent icon sizes

- Random animation effects

- Arbitrary colors

- Unnecessary design complexity

Do not replace one generic design trend with another.

The goal is a coherent visual identity appropriate for BaSaya.

## 10. Responsive Design

Design for:

- Desktop

- Laptop

- Tablet

- Mobile

Use flexible layouts and content-based breakpoints.

Requirements:

- No horizontal overflow

- Readable typography at smaller sizes

- Appropriately sized touch targets

- Responsive tables and data displays

- Accessible mobile navigation

- Clear actions without requiring hover

- Predictable spacing and hierarchy

Test both wide and narrow viewports.

## 11. Accessibility

Target WCAG 2.2 AA where applicable.

Requirements:

- Sufficient text contrast

- Visible keyboard focus

- Semantic buttons and links

- Accessible names for icon-only controls

- Proper form labeling

- Meaningful status messages

- Keyboard-operable menus and dialogs

- Reduced-motion support

- No essential hover-only information

- Appropriate touch target sizes

Prefer native HTML semantics wherever possible.

## 12. Functional Preservation

The redesign must not compromise the existing system.

Preserve:

- Firebase functionality

- Authentication

- Authorization

- API requests

- Database operations

- Existing JavaScript interactions

- Form submissions

- Navigation and routing

- Classroom management

- Lesson management

- Student management

- Existing backend integrations

Never introduce fake functionality, dummy statistics, or nonfunctional buttons.

Do not migrate frameworks or rewrite the application's architecture without explicit authorization.

Avoid unrelated refactoring.

## 13. Required Design Workflow

### Phase 1 — Audit

Inspect the actual page and identify:

- Visual inconsistencies

- Weak hierarchy

- Generic design patterns

- Usability problems

- Responsive issues

- Accessibility concerns

- Functional dependencies

### Phase 2 — Establish Direction

Determine:

- Page hierarchy

- Typography

- Color roles

- Surface treatments

- Navigation patterns

- Icon behavior

- Interaction states

- Responsive layout

Reuse the established BaSaya design system.

### Phase 3 — Implement

Make focused, maintainable frontend changes.

Use existing technologies and conventions.

Create reusable components or styling patterns when beneficial.

Preserve functionality throughout implementation.

### Phase 4 — Verify

Run available project checks. Verify both the existing light and dark themes, including theme toggle persistence and visual contrast.

If browser or screenshot tools are available, inspect the rendered page at desktop, tablet, and mobile sizes.

Review hover, keyboard-focus, active, loading, disabled, and empty states.

Do not claim tests or visual inspections that were not performed.

### Phase 5 — Refine

Correct:

- Inconsistent spacing

- Typography problems

- Visual clutter

- Poor contrast

- Misalignment

- Broken responsive layouts

- Clipped tooltips

- Unclear icon controls

- Excessive animations

- Generic-looking compositions

Repeat verification after major corrections.

## 14. Completion Checklist

Before completing a redesign, confirm:

- [ ] The design follows Contemporary Editorial Academic principles.

- [ ] Both light mode and dark mode are polished, readable, and consistent.

- [ ] Existing theme toggle, theme preference persistence, and navigation behavior are preserved.

- [ ] Translucent cards, tooltips, inputs, and icons are correctly styled in both themes.

- [ ] BaSaya branding remains recognizable.

- [ ] Typography and spacing are consistent.

- [ ] Containers use deliberate, restrained translucent treatments.

- [ ] Icon-only actions have accessible labels.

- [ ] Tooltips appear on hover and keyboard focus.

- [ ] Touch devices are not dependent on hover.

- [ ] Animations are subtle and purposeful.

- [ ] Responsive layouts are usable.

- [ ] Keyboard accessibility is preserved.

- [ ] Existing application functionality remains intact.

- [ ] No unnecessary frameworks were introduced.

- [ ] Relevant checks were executed.

- [ ] Any unverified behavior is clearly reported.

## 15. Expected Output

When invoked for a redesign task:

1. Briefly explain the important design problems discovered.

2. Establish the intended visual direction.

3. Implement the requested frontend changes.

4. Verify the result using available tools.

5. Summarize what was changed.

6. Report tests performed and remaining limitations.

Do not stop after producing a design proposal when implementation was requested.

**Final design principle: Build BaSaya as a recognizable, elegant, highly usable educational product—not another generic AI-generated school dashboard.**
