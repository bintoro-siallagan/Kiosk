// karyaOS — Shared typography presets
// Spreadable composed style objects untuk hierarchy konsisten across surfaces.
// Originally extracted dari CinemaWebApp (round 1 typography refresh).
// Now reusable di Flow, Cinema, POS, dll.
//
// Usage:
//   import { TY, T } from "../lib/typography.js";
//   <div style={{ ...TY.headline, color: "#fff" }}>Title</div>

// Font scale + tracking primitives — building blocks for TY presets.
export const T = {
  // Size (px)
  xs:    11,    // meta, eyebrow, caption, copyright
  sm:    13,   // body secondary, footer link
  base:  14,   // body default, button label
  md:    16,   // emphasized body, list item primary
  lg:    18,   // card title, footer brand
  xl:    22,   // section heading, modal title
  '2xl': 28,  // page heading
  '3xl': 40,  // hero / large display
  '4xl': 56,  // landing hero only

  // Weight
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
  black:    800,

  // Line-height (unitless)
  tight:   1.15,
  snug:    1.35,
  normal:  1.5,
  relaxed: 1.65,

  // Letter-spacing (em)
  tracking_tight:  '-0.02em',
  tracking_normal: '0',
  tracking_wide:   '0.04em',
  tracking_wider:  '0.12em',

  // Font families
  sans: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Geist Mono', Menlo, ui-monospace, monospace",
};

// TY presets — composed style objects spreadable: <div style={{ ...TY.headline, color: "#fff" }}>
// Hierarchy pyramid: display → headline → title → subtitle → body → caption → eyebrow.
export const TY = {
  // DISPLAY — landing hero only (1 per page). Theatrical drama.
  display: {
    fontSize: 'clamp(40px, 6vw, 72px)',
    fontWeight: 900,
    lineHeight: 1.05,
    letterSpacing: '-0.035em',
    fontFamily: T.sans,
  },
  // HEADLINE — page heading, FilmDetail title. Strong but readable.
  headline: {
    fontSize: 'clamp(28px, 3.6vw, 44px)',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.025em',
    fontFamily: T.sans,
  },
  // TITLE — card title, modal title, section heading.
  title: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.012em',
    fontFamily: T.sans,
  },
  // SUBTITLE — section sub, sub-card heading.
  subtitle: {
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '-0.005em',
    fontFamily: T.sans,
  },
  // BODY — paragraph default, list item primary.
  body: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: '0',
    fontFamily: T.sans,
  },
  // BODY-SM — secondary text, footer body.
  bodySm: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: '0',
    fontFamily: T.sans,
  },
  // CAPTION — meta, helper text, fine print.
  caption: {
    fontSize: 11.5,
    fontWeight: 500,
    lineHeight: 1.45,
    letterSpacing: '0.005em',
    fontFamily: T.sans,
  },
  // EYEBROW — uppercase label di atas heading. Mono for premium feel.
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontFamily: T.mono,
  },
  // NUMBER — large numeric display (price, stat) — mono for tabular feel.
  number: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: T.mono,
  },
  // BUTTON — CTA label.
  button: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.005em',
    fontFamily: T.sans,
  },
};
