/** Visual design tokens for the Pixi table — kept in one place so the look can be re-themed (deck/felt) without touching scene code. */
export const THEME = {
  background: { top: 0x0a0f1a, bottom: 0x02040a },
  rail: { outer: 0x1a0f08, mid: 0x4a2c17, highlight: 0x8a5a33 },
  felt: { center: 0x1f9468, edge: 0x064a34, line: 0xe8c872 },
  gold: 0xf2c75c,
  goldDark: 0xa87a1f,
  text: 0xf8fafc,
  textMuted: 0x9fb3c8,
  plate: 0x0b1220,
  danger: 0xef4444,
  suit: { red: 0xd62839, black: 0x111827 },
  cardFace: 0xfdfdfb,
  cardBack: { base: 0x1d3a8a, accent: 0x3b63d6, border: 0xf8fafc },
  chips: [
    { value: 1000, color: 0x111827, edge: 0xf2c75c },
    { value: 500, color: 0x7c3aed, edge: 0xede9fe },
    { value: 100, color: 0x1f2937, edge: 0xf8fafc },
    { value: 25, color: 0x15803d, edge: 0xdcfce7 },
    { value: 5, color: 0xb91c1c, edge: 0xfee2e2 },
    { value: 1, color: 0xf8fafc, edge: 0x64748b },
  ],
  avatarPalette: [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x8e7dbe, 0x4ea8de, 0xf28482, 0x84a98c, 0xf4a261],
  fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
} as const;

export const CARD_W = 70;
export const CARD_H = 98;
export const CARD_RADIUS = 7;

export const SUIT_GLYPH = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
} as const;

export function formatChips(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(value);
}
