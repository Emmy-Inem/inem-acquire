# Mobile layout and interaction verification

## Changes

- Transparent native tap highlights on buttons and links; pointer taps do not leave focus rectangles. Keyboard focus remains visible.
- Mobile public navigation uses a separate glass panel with backdrop blur, outside the header's backdrop-filter boundary. The panel includes login and signup actions.
- Public and workspace menus close on selection, Escape and outside taps. Focus stays within an open menu, returns to its trigger, and hidden workspace navigation is inert.
- Background scrolling is locked while menus and dialogs are open. Record dialogs fit the dynamic viewport, preserve focus, and keep save actions available while scrolling.
- Phone controls have larger touch areas; editable fields use at least 16px text to avoid automatic input zoom. Safe-area insets and dynamic viewport height are supported.
- Headers and actions wrap on narrow screens. Dashboard metrics use two columns. Record tables and pipeline columns scroll inside their own regions, with keyboard access and a table swipe hint.
- Workflow preview content is more legible on phones; sample pipeline columns scroll rather than shrinking text to fit.
- Hover movement is restricted on touch devices. Short, interruptible press feedback and menu transitions use shared timing. Newly loaded panels and dialogs receive the same subtle entrance motion as initial content; completed animations release inline transforms.
- Navigation to another route starts at the top. Reduced-motion preferences stop slide/scale transitions and keep the background video on its poster.

## Checks

- 84 public, authentication, onboarding and workspace route/viewport combinations at 320, 390 and 768 CSS pixels, after live data finished loading: no page-wide horizontal overflow, no editable text below 16px and no browser runtime errors.
- Additional landing breakpoints at 820, 1024 and 1440 pixels: navigation switches correctly and content stays within the page.
- `npm run test:browser` covers real login, record persistence, roles, public menu blur, touch-highlight suppression, menu focus restoration, workflow switching, workspace navigation, mobile record editing and reduced motion.
- `npm test` and `npm run build` pass.

Browser checks use installed Chrome with touch/mobile emulation and disposable Supabase fixtures. These checks do not replace testing on physical iOS/Safari and Android devices. Evidence is kept in ignored `work/qa-mobile` and `work/qa-backend` folders.
