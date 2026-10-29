---
name: TIGERIS AI OS
description: Institution-owned, case-first intelligence and decision layer. Calm light surfaces where every figure is cited and every action is a named human decision.
colors:
  bone-canvas: '#f3f2ef'
  panel-white: '#ffffff'
  raised-bone: '#ecebe6'
  sand: '#ebe0c8'
  hairline: '#e2e0d9'
  hairline-strong: '#c9c5ba'
  ink: '#17261f'
  ink-muted: '#4c5a53'
  ink-faint: '#5b6862'
  sovereign-emerald: '#0f4a36'
  sovereign-emerald-hover: '#155f46'
  sovereign-emerald-soft: '#e4efe8'
  deep-emerald: '#0d2219'
  provenance-gold: '#b8924f'
  provenance-gold-text: '#7a5a22'
  provenance-gold-soft: '#f6eedc'
  route-teal: '#1a6a6e'
  route-teal-soft: '#e1efee'
  observed-green: '#18674b'
  observed-green-soft: '#e3f0e8'
  caution-amber: '#8c540e'
  caution-amber-soft: '#fbedd8'
  blocked-red: '#a2392e'
  blocked-red-soft: '#f8e3df'
  gulf-sea: '#9fcccb'
  gulf-land: '#f0e4c9'
  gulf-coast: '#f7f1e2'
  gilt-border: '#b89b66'
typography:
  display:
    fontFamily: 'Source Serif 4 Variable, Source Serif 4, IBM Plex Sans Arabic, Georgia, serif'
    fontSize: '1.75rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.01em'
  headline:
    fontFamily: 'Source Serif 4 Variable, Source Serif 4, IBM Plex Sans Arabic, Georgia, serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.556
    letterSpacing: '-0.01em'
  figure:
    fontFamily: 'Source Serif 4 Variable, Source Serif 4, IBM Plex Sans Arabic, Georgia, serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.556
    fontFeature: 'tnum'
  lead:
    fontFamily: 'Inter Variable, Inter, IBM Plex Sans Arabic, Arial, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: 'cv11, ss01'
  body:
    fontFamily: 'Inter Variable, Inter, IBM Plex Sans Arabic, Arial, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: 'cv11, ss01'
  label:
    fontFamily: 'Inter Variable, Inter, IBM Plex Sans Arabic, Arial, system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 500
    lineHeight: 1.385
    fontFeature: 'cv11, ss01'
  badge:
    fontFamily: 'Inter Variable, Inter, IBM Plex Sans Arabic, Arial, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1.333
rounded:
  badge: '4px'
  control: '6px'
  row: '8px'
  panel: '12px'
  pill: '9999px'
spacing:
  hair: '4px'
  tight: '8px'
  row: '12px'
  gutter: '16px'
  panel: '20px'
  section: '24px'
  page: '32px'
components:
  button-primary:
    backgroundColor: '{colors.sovereign-emerald}'
    textColor: '{colors.panel-white}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '40px'
  button-primary-hover:
    backgroundColor: '{colors.sovereign-emerald-hover}'
  button-secondary:
    backgroundColor: '{colors.panel-white}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '40px'
  button-secondary-hover:
    backgroundColor: '{colors.raised-bone}'
  button-ghost:
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '40px'
  button-danger:
    backgroundColor: '{colors.blocked-red-soft}'
    textColor: '{colors.blocked-red}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '40px'
  button-small:
    height: '32px'
    padding: '0 12px'
  panel:
    backgroundColor: '{colors.panel-white}'
    rounded: '{rounded.panel}'
  panel-footer:
    backgroundColor: '{colors.raised-bone}'
    textColor: '{colors.ink-muted}'
    typography: '{typography.label}'
    padding: '10px 20px'
  input-search:
    backgroundColor: '{colors.panel-white}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.row}'
    height: '40px'
  nav-item:
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.row}'
    padding: '10px 12px'
  nav-item-active:
    backgroundColor: '{colors.sovereign-emerald-soft}'
    textColor: '{colors.sovereign-emerald}'
  truth-badge-sourced:
    backgroundColor: '{colors.route-teal-soft}'
    textColor: '{colors.route-teal}'
    typography: '{typography.badge}'
    rounded: '{rounded.badge}'
    padding: '2px 6px'
  truth-badge-synthetic:
    backgroundColor: '{colors.provenance-gold-soft}'
    textColor: '{colors.provenance-gold-text}'
    typography: '{typography.badge}'
    rounded: '{rounded.badge}'
    padding: '2px 6px'
  demo-banner:
    backgroundColor: '{colors.provenance-gold-soft}'
    textColor: '{colors.provenance-gold-text}'
    typography: '{typography.label}'
---

# Design System: TIGERIS AI OS

## Overview

**Creative North Star: "Sovereign Light"**

TIGERIS is the room where an institution decides. The system answers that with daylight rather than drama: a warm bone canvas, white working panels, ink that is almost black-green, and two quiet authorities. Deep emerald carries power: the primary action, the active place in the navigation, the approved state. Gold carries provenance: where a thing came from, and the standing reminder that this build is a demonstration. Everything else is hairline and type.

The surfaces are operate-mode screens that people work in for hours. Density is moderate and tabular; structure comes from thin borders and spacing, not from colour fields or shadows. Serif headings (Source Serif 4) give the record its formality; Inter carries the working text. Motion is short and only ever says that something entered, left, was selected or moved. Truth is never decorative: every badge pairs text with an icon, synthetic and illustrative material carries a hatched texture, and a missing number is shown as missing.

The system rejects the default intelligence-dashboard look: no dark cockpit, no glowing accents, no vanity KPI tiles, no live-feed theatre.

**Key Characteristics:**

- Light, warm, low-chroma ground; white panels with 1px hairlines.
- One emerald action per area; gold reserved for provenance and the demonstration disclosure.
- Serif for headings and cited figures, sans for everything worked with.
- Flat at rest; a shadow means the thing is floating above the page.
- Status always as text plus icon (plus border style or hatch), never colour alone.
- Logical properties throughout, so English and Arabic (RTL) share one layout.

## Colors

A warm bone ground with a deep emerald voice and a gold accent; the remaining hues exist only to label truth and state.

### Primary

- **Sovereign Emerald** (#0f4a36): primary buttons, the active navigation item and its indicator, selected tabs, the replay slider. It means "this is where authority acts". Hover deepens toward Sovereign Emerald Hover (#155f46); its tint Sovereign Emerald Soft (#e4efe8) fills the active nav row.
- **Deep Emerald** (#0d2219): overlays and the darkest structural surfaces (dialog scrims), never body text.

### Secondary

- **Provenance Gold** (#b8924f): focus outlines, the hatch of synthetic material, the illustrative-simulation frame on the map. Never text: its text form is **Provenance Gold Text** (#7a5a22), and its fill is **Provenance Gold Soft** (#f6eedc) for the demo banner and synthetic badges.

### Tertiary

- **Route Teal** (#1a6a6e): links, sourced and inferred relationships, routes on the map. Fill: Route Teal Soft (#e1efee).
- **Observed Green** (#18674b): observed claims and validated states. Fill: Observed Green Soft (#e3f0e8).
- **Caution Amber** (#8c540e): assumptions, warnings, stale freshness. Fill: Caution Amber Soft (#fbedd8).
- **Blocked Red** (#a2392e): disputed evidence, failures, blocked approvals, the case-origin node. Fill: Blocked Red Soft (#f8e3df).

### Neutral

- **Bone Canvas** (#f3f2ef): the page ground behind everything.
- **Panel White** (#ffffff): every working surface (panels, tables, inputs, menus).
- **Raised Bone** (#ecebe6): sidebar, panel footers, hover fills, the pressed segment of a toggle.
- **Sand** (#ebe0c8): illustration ground only.
- **Hairline** (#e2e0d9): panel borders and row dividers.
- **Hairline Strong** (#c9c5ba): control borders (buttons, inputs, selects), graph node borders.
- **Ink** (#17261f): headings and body text.
- **Ink Muted** (#4c5a53): descriptions, secondary text, inactive navigation.
- **Ink Faint** (#5b6862): metadata, timestamps, sources; still 4.5:1 on every surface.

### Cartography

- **Gulf Sea** (#9fcccb), **Gulf Land** (#f0e4c9), **Gulf Coast** (#f7f1e2), **Gilt Border** (#b89b66): the Arabian Gulf map and the sign-in waves only. MapLibre and WebGL read them at runtime through `lib/tokens.ts`.

### Named Rules

**The Two Authorities Rule.** Emerald acts, gold attests. Emerald is for what a person does (act, select, approve); gold is for where something came from and that this is a demonstration. Neither is used for decoration.

**The Text-Is-Tested Rule.** Every colour used as text meets 4.5:1 on canvas, panel and raised surfaces. Provenance Gold (#b8924f) fails that, so gold text is always Provenance Gold Text (#7a5a22).

**The Truth-Hue Reservation Rule.** Teal, green, amber and red belong to the truth and status vocabulary. A chart series, an illustration or a category never borrows them.

## Typography

**Display Font:** Source Serif 4 Variable (with Georgia)
**Body Font:** Inter Variable (with Arial, system-ui)
**Arabic:** IBM Plex Sans Arabic replaces both in `lang="ar"`, with letter-spacing reset to 0.

**Character:** A bookish serif for the record (page titles, panel titles, cited figures) set against a neutral, tabular sans for the work. All three families are self-hosted through @fontsource so the product runs air-gapped.

### Hierarchy

- **Display** (600, 1.75rem / 1.5rem below 640px, tight leading): the page title, one per screen.
- **Headline** (600, 1.125rem): panel and section titles.
- **Figure** (600 serif, 1.125rem, tabular numerals): a cited value in evidence lists and scenario results.
- **Lead** (400, 15px): the page description under the title, capped at 62ch.
- **Body** (400, 14px): working text, table cells, descriptions inside panels.
- **Label** (500, 13px): navigation subtitles, footers, metadata. 13px is the type floor for running labels.
- **Badge** (600, 12px): truth and status badges only.

### Named Rules

**The 13px Floor Rule.** No running text below 13px; 12px is reserved for badges and short tags.

**The Serif-For-The-Record Rule.** Serif marks what will be kept: titles and cited figures. Controls, labels and tables stay in the sans.

**The Tabular Number Rule.** Counts, figures and times in lists use tabular numerals so columns align.

## Layout

A fixed 17rem sidebar on desktop (1024px and up) beside a fluid main column padded 32px (16px on phones). Below 1024px the sidebar becomes a slide-in sheet behind a menu button. The demonstration banner spans the full width and, on desktop, stays pinned at the top with the sidebar beneath it (its height is published as `--banner-h`).

Inside the main column, content is arranged in panel grids that collapse to a single column on phones: typically a dominant panel with a narrower stack beside it (for example `minmax(0,1fr)` against 26rem). Cards in a row share a bottom edge: a panel footer grows to fill the stretched height rather than leaving a blank band.

Spacing follows a 4px base: 8px inside tight groups, 12px row padding, 16px gutters, 20px panel padding, 24px between panels and sections. Breakpoints are the Tailwind defaults (640, 768, 1024, 1280, 1536px).

**The Side-By-Side Collapses Rule.** Any row that sets a value, a label and actions side by side on desktop stacks them on phones; nothing is squeezed into a column narrower than its longest word.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (bone canvas, white panel, raised-bone footer and sidebar) and 1px hairlines. A single shadow exists, and only for things that genuinely float: popovers, menus, sheets, dialogs and the map's overlay controls.

### Shadow Vocabulary

- **Float** (`box-shadow: 0 8px 24px -8px rgb(23 38 31 / 0.18)`): popovers, dropdowns, sheets, dialogs, map controls and graph edge labels.

### Named Rules

**The Floating-Only Rule.** If it sits in the page flow, it has no shadow. Panels and cards are separated by hairlines, never by elevation.

## Shapes

Gently rounded and consistent by role: 4px for badges and tags, 6px for buttons and small controls, 8px for rows, inputs, navigation items and inner frames, 12px for panels. Fully round only for avatars and count pills. Borders are 1px; dashed borders mean "inferred" or "assumed", never style.

**The Dash-Means-Uncertain Rule.** A dashed line (on a badge, an edge or a map route) always encodes an inferred, assumed or illustrative claim.

## Components

Quiet and exact: thin borders, flat white surfaces, one emerald action per area, and no ornament that does not carry meaning.

### Buttons

- **Shape:** gently rounded (6px).
- **Primary:** Sovereign Emerald fill, white text, 14px medium, 40px tall (32px small). One per panel or dialog.
- **Secondary (default):** Panel White with a Hairline Strong border and Ink text; hover fills Raised Bone and tints the border emerald.
- **Ghost:** text only in Ink Muted; hover fills Raised Bone.
- **Danger:** Blocked Red Soft fill, Blocked Red text and border; used only for rejecting or blocking.
- **Hover / Focus / Active:** colour transitions in 150ms; a 0.98 press scale (removed under reduced motion); focus is the global 2px Provenance Gold outline offset 2px. Disabled is 50% opacity with a not-allowed cursor.

### Chips (truth badges)

- **Style:** 4px corners, 1px border at ~60% of the hue, the hue's soft fill, 12px semibold text and a 12px icon. Dashed borders for inferred and assumed; a gold hatch for synthetic and illustrative.
- **State:** badges are read-only labels; every one carries its meaning in words.

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Panel White on Bone Canvas.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 20px horizontal; header 16px top, 12px bottom; footer strip in Raised Bone at 50% with 13px Ink Muted text.

### Inputs / Fields

- **Style:** Panel White, 1px Hairline Strong border, 8px corners, 40px tall (48px on sign-in), placeholder in Ink Faint.
- **Focus:** the global gold focus outline; the search box also shifts its border to Sovereign Emerald. Selects that sit inside a labelled box (the Sector picker) draw the outline on that box.
- **Error / Disabled:** errors are stated in words below the field, with `aria-invalid`; disabled follows the button rule.

### Navigation

- Sidebar items are 14.5px Inter with an 18px icon, 10px by 12px padding and 8px corners. Inactive items are Ink Muted and darken to Ink on hover. The active item is Sovereign Emerald, semibold, on a Sovereign Emerald Soft fill with a 3px emerald inline-start rule; the fill slides between items with a critically damped spring. Planned modules carry a small phase tag ("P4"). On phones the same list opens as a sheet.
- Tabs use a 2px emerald underline that slides to the selected tab.

### Demonstration Banner (signature)

A full-width Provenance Gold Soft strip with a gold hatch, a flask icon and 13px semibold Provenance Gold Text: "Demonstration: fictional institution, synthetic and dated public snapshot data. No live feeds." Pinned at the top on desktop. It is a disclosure, not decoration, and never hides.

### Gulf Map (signature)

The Arabian Gulf drawn in the cartography palette, with chokepoints, ports and terminals as dots, and modelled routes in the truth hues (solid for sourced, dashed for inferred and assumed). Any movement is a replay framed by an "Illustrative simulation" gold badge, with play, restart, a scrubber and speed controls (32px targets; the bar wraps to two rows on phones).

## Do's and Don'ts

### Do:

- **Do** keep one Sovereign Emerald (#0f4a36) primary action per panel or dialog.
- **Do** pair every status with text and an icon; add a dashed border or the gold hatch for inferred, assumed, synthetic and illustrative material.
- **Do** show a missing value as missing ("Source not connected", or "—" in a table cell) instead of a filler number.
- **Do** use Provenance Gold Text (#7a5a22) whenever gold is text.
- **Do** separate panels with 1px Hairline (#e2e0d9) borders and spacing, not shadows.
- **Do** keep running text at 13px or larger and page descriptions within 62ch.
- **Do** write layout with logical properties (start/end, ps/pe, ms/me) so Arabic mirrors without overrides.
- **Do** keep motion to 150–320ms with the ease-out curve, and let reduced motion keep fades and colour changes while dropping movement.

### Don't:

- **Don't** label anything LIVE or animate data as if it were streaming; movement is "Illustrative simulation".
- **Don't** show a confidence as a bare percentage; use the band (high, moderate, low, insufficient) with its basis.
- **Don't** put a shadow on anything that sits in the page flow.
- **Don't** use teal, green, amber or red for categories, chart series or decoration; they belong to truth and status.
- **Don't** use Provenance Gold (#b8924f) as text, or put gold on primary actions.
- **Don't** go dark, add glows, gradients or glass, or build KPI tiles with invented values.
- **Don't** apply another company's branding, palette or typefaces; reference sites are for study only.
- **Don't** load fonts or assets from a CDN; everything is self-hosted.
