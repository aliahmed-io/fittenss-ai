/**
 * Design tokens for FitTransform AI.
 * Single source of truth for color, spacing (8pt grid), radii, type and motion.
 * CSS custom properties in app/globals.css mirror these values; keep both in sync.
 */

export const colors = {
  void: '#0C0C0C',
  surface: '#111111',
  surface2: '#181818',
  lime: '#CBFF00',
  limeBg: 'rgba(203,255,0,0.07)',
  white: '#FFFFFF',
  text1: '#FFFFFF',
  text2: '#A3A3A3',
  text3: '#8A8A8A',
  rule: 'rgba(255,255,255,0.08)',
  ruleStrong: 'rgba(255,255,255,0.15)',
  danger: '#FF4444',
  warning: '#FFB020',
  hologram: '#00F0FF',
} as const;

export const spacing = {
  0: 0,
  1: 8,
  2: 16,
  3: 24,
  4: 32,
  5: 40,
  6: 48,
  8: 64,
} as const;

export const radii = {
  none: 0,
  sm: 2,
  md: 4,
} as const;

export const typography = {
  display: '"Barlow Condensed", sans-serif',
  body: '"DM Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", monospace',
} as const;

export const motion = {
  fast: 120,
  base: 300,
  slow: 450,
  easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
} as const;

export const breakpoints = {
  mobile: 640,
  tablet: 1024,
  desktop: 1440,
  ultrawide: 2560,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
export type MotionToken = keyof typeof motion;
