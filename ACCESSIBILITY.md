# Accessibility statement

The CoE-NNECT team is committed to making the application usable by people with disabilities. Accessibility is treated as part of the definition of done for UI changes, not as a separate project.

## Conformance target

CoE-NNECT aims for **WCAG 2.1 Level AA** conformance across the authenticated application and the public landing page. The project does not currently claim full conformance. This statement describes what is implemented, how it was reviewed, and what remains unverified.

## Review status

| Item | Detail |
| --- | --- |
| Last review | 13 November 2026 |
| Method | Source inspection of semantic HTML, labels, focus handling, and keyboard listeners; keyboard walkthroughs in Chromium; responsive checks at desktop, tablet, and mobile widths; review of the timetable's grid/agenda alternatives; review of `prefers-reduced-motion` handling. |
| Automated checks | No automated accessibility test suite is configured. ESLint does not include `eslint-plugin-jsx-a11y`, and Playwright does not run axe. |
| Assistive-technology audit | No formal screen-reader audit has been completed. |
| Conformance claim | Partial; not a certified WCAG 2.1 AA conformance statement. |

## Implemented accessibility features

### Structure and navigation

- The department shell provides a **Skip to content** link that becomes visible on focus and targets `#main-content`.
- The sidebar uses a labeled `nav` landmark, and the mobile drawer is a modal dialog with `aria-modal="true"`, a label, and Escape handling.
- Pages use headings and sections rather than styled `div` text alone.
- The public landing page and login page are reachable without a session.

### Keyboard support

- All primary actions are native buttons or links and are reachable with Tab.
- Visible focus rings are defined for navigation, icon buttons, cards, and form controls.
- The shared `Modal` component:
  - moves focus into the dialog when it opens;
  - traps Tab and Shift+Tab inside the dialog;
  - closes on Escape unless the action is busy;
  - restores focus to the previously focused element on close;
  - exposes `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and an optional `aria-describedby`.
- The mobile navigation drawer and search overlay close on Escape.
- Dropdowns and menus (`SearchableSelect`, `TimeSlotSelect`, `RowActionMenu`, notification menus, theme menu) close on Escape and support arrow/Enter interaction where implemented.
- The timetable supports `G` for grid view, `A` for agenda view, and `Escape` to clear the selected entry or open stack. The agenda view is a keyboard-friendly, day-grouped alternative to the grid.
- The chat drawer can be opened from the keyboard, and messages are reachable as normal text.

### Forms and feedback

- Inputs are paired with visible labels; icon-only buttons carry `aria-label`.
- Validation and error banners use `role="alert"` where they announce a failure.
- The top bar uses `aria-live="polite"` for changing status text.
- Loading and empty states use readable text rather than color alone.
- Buttons expose disabled and busy states; destructive actions require confirmation.

### Visual and responsive design

- Text and primary controls use the Tailwind design tokens, which are chosen for readable contrast on their surfaces.
- Layouts adapt to desktop, tablet, and mobile widths; the timetable switches to the agenda layout on narrow screens.
- Focus indicators are visible against the surrounding surface.
- Motion respects `prefers-reduced-motion` in the global stylesheet, including the rolling dashboard values and entrance animations.
- Status is not communicated by color alone in the main workflows; labels and counts accompany status dots and badges.

### Content and media

- The landing page uses text labels for statistics and faculty information.
- Decorative icons are marked `aria-hidden` where they duplicate a text label.
- The app does not autoplay audio. Chat sounds are opt-out in Settings.

## Assistive-technology support

| Technology | Status | Notes |
| --- | --- | --- |
| Keyboard only | Supported | Primary flows are operable without a pointer. The drag-and-drop timetable grid has an agenda alternative and an edit modal. |
| Browser zoom / large text | Partially verified | Responsive layouts and relative units are used, but 200% zoom has not been exhaustively tested on every screen. |
| NVDA + Firefox/Chrome (Windows) | Not formally tested | Semantic structure and labels are present; a full screen-reader pass is still needed. |
| JAWS + Chrome (Windows) | Not formally tested | Same as above. |
| VoiceOver + Safari (macOS/iOS) | Not formally tested | Mobile layouts are responsive; screen-reader behavior is unverified. |
| TalkBack (Android) | Not formally tested | Mobile navigation uses a labeled dialog; unverified with TalkBack. |
| Voice control / switch access | Not formally tested | Native controls should work, but no session has been recorded. |

## Known limitations

- **Timetable grid:** drag-and-drop is optimized for mouse and touch. Keyboard users can switch to the agenda view (`A`), open an entry, and edit it through the modal, but the grid itself is not a fully keyboard-equivalent drag surface.
- **Prospectus PDF editor:** the region editor is desktop-oriented and relies on pointer drawing over a PDF canvas. It is not a fully keyboard-operable editing surface. The PDF list, metadata, and import review screens remain usable.
- **PDF exports:** generated PDFs are layout-oriented and may not be tagged or fully screen-reader optimized.
- **Charts and visual summaries:** dashboard cards pair values with text, but some compact visualizations may not expose every data point as a table.
- **Screen-reader coverage:** no formal NVDA, JAWS, VoiceOver, or TalkBack audit has been completed. Announcements for asynchronous chat, notification, and presence updates may need refinement.
- **Automated coverage:** there is no axe or Pa11y check in CI. Regressions in labels or focus behavior rely on review and manual testing.
- **Third-party widgets:** the Cap CAPTCHA widget and browser PDF rendering are third-party surfaces. Their accessibility behavior is outside this repository's direct control.

## Reporting an accessibility barrier

Open a GitHub issue with:

- the page or route;
- the browser, operating system, and assistive technology;
- the steps you took;
- what happened versus what you expected;
- a screenshot or recording if it helps.

Do not include passwords, personal data, or production database details. If the issue is security-sensitive, follow [SECURITY.md](SECURITY.md) instead.

We will triage accessibility reports alongside functional bugs and prioritize barriers that block a core workflow.

## Guidelines for contributors

- Prefer native semantic elements over `div` click handlers.
- Give every input a visible label and every icon-only button an accessible name.
- Keep focus visible and restore focus when closing dialogs or drawers.
- Test the keyboard path for any new modal, menu, or drag interaction.
- Provide a non-drag alternative for pointer-heavy interactions.
- Respect `prefers-reduced-motion` for new animations.
- Do not use color alone to convey status.
- Update this statement when a limitation is fixed or a new one is introduced.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the frontend conventions and validation matrix.
