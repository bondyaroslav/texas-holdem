import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';
import type { Card } from './types.js';
import { CARD_H, CARD_RADIUS, CARD_W, SUIT_GLYPH, THEME } from './theme.js';

function drawBack(g: Graphics): void {
  const { base, accent, border } = THEME.cardBack;
  g.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS).fill(border);
  g.roundRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, CARD_RADIUS - 2).fill(base);
  // Diamond lattice — cheap to draw, reads as a classic card back.
  for (let x = -2; x <= 2; x++) {
    for (let y = -3; y <= 3; y++) {
      const cx = x * 11;
      const cy = y * 11;
      g.poly([cx, cy - 5, cx + 5, cy, cx, cy + 5, cx - 5, cy]).fill({ color: accent, alpha: 0.55 });
    }
  }
  g.roundRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, CARD_RADIUS - 2).stroke({
    width: 1.5,
    color: accent,
    alpha: 0.9,
  });
}

/** Pip positions per rank on a unit grid: x in [-1, 1] columns, y in [-1, 1] rows (standard casino layouts). */
const PIPS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  '2': [
    [0, -1],
    [0, 1],
  ],
  '3': [
    [0, -1],
    [0, 0],
    [0, 1],
  ],
  '4': [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  '5': [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  '6': [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
  '7': [
    [-1, -1],
    [1, -1],
    [0, -0.5],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
  '8': [
    [-1, -1],
    [1, -1],
    [0, -0.5],
    [-1, 0],
    [1, 0],
    [0, 0.5],
    [-1, 1],
    [1, 1],
  ],
  '9': [
    [-1, -1],
    [1, -1],
    [-1, -1 / 3],
    [1, -1 / 3],
    [0, 0],
    [-1, 1 / 3],
    [1, 1 / 3],
    [-1, 1],
    [1, 1],
  ],
  T: [
    [-1, -1],
    [1, -1],
    [0, -2 / 3],
    [-1, -1 / 3],
    [1, -1 / 3],
    [-1, 1 / 3],
    [1, 1 / 3],
    [0, 2 / 3],
    [-1, 1],
    [1, 1],
  ],
};

const FACE_NAMES: Readonly<Record<string, string>> = { J: 'J', Q: 'Q', K: 'K' };

function glyphText(glyph: string, size: number, color: number): Text {
  const t = new Text({
    text: glyph,
    style: { fontFamily: THEME.fontFamily, fontWeight: '800', fontSize: size, fill: color },
  });
  t.anchor.set(0.5);
  return t;
}

function indexBlock(rank: string, glyph: string, color: number): Container {
  const block = new Container();
  const r = new Text({
    text: rank,
    style: {
      fontFamily: THEME.fontFamily,
      fontWeight: '800',
      fontSize: rank.length > 1 ? 15 : 19,
      fill: color,
      letterSpacing: rank.length > 1 ? -1 : 0,
    },
  });
  r.anchor.set(0.5);
  const s = glyphText(glyph, 15, color);
  s.y = 19;
  block.addChild(r, s);
  return block;
}

function drawFace(face: Container, card: Card): void {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = red ? THEME.suit.red : THEME.suit.black;
  const glyph = SUIT_GLYPH[card.suit];
  const rank = card.rank === 'T' ? '10' : card.rank;

  const bg = new Graphics()
    .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS)
    .fill(THEME.cardFace)
    .stroke({ width: 1, color: 0x000000, alpha: 0.28 });
  // Soft paper sheen along the top edge, then an inset hairline like a printed border.
  bg.roundRect(-CARD_W / 2 + 1, -CARD_H / 2 + 1, CARD_W - 2, CARD_H * 0.4, CARD_RADIUS - 1).fill({
    color: 0xffffff,
    alpha: 0.5,
  });
  bg.roundRect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 2).stroke({
    width: 1,
    color,
    alpha: 0.12,
  });
  face.addChild(bg);

  const ix = -CARD_W / 2 + 12;
  const iy = -CARD_H / 2 + 15;
  const top = indexBlock(rank, glyph, color);
  top.position.set(ix, iy);
  const bottom = indexBlock(rank, glyph, color);
  bottom.rotation = Math.PI;
  bottom.position.set(-ix, -iy);
  face.addChild(top, bottom);

  const pips = PIPS[card.rank];
  if (pips) {
    const px = 10;
    const py = 26;
    for (const [gx, gy] of pips) {
      const pip = glyphText(glyph, 16, color);
      pip.position.set(gx * px, gy * py);
      // Lower half is printed upside down, as on a real deck.
      if (gy > 0) pip.rotation = Math.PI;
      face.addChild(pip);
    }
    return;
  }

  if (card.rank === 'A') {
    face.addChild(Object.assign(glyphText(glyph, 46, color), { x: 3, y: 2 }));
    return;
  }

  // J / Q / K: framed court panel with a tinted field and the letter between two pips.
  const panel = new Graphics()
    .roundRect(-14, -34, 34, 68, 4)
    .fill({ color, alpha: 0.09 })
    .stroke({ width: 1.5, color, alpha: 0.55 });
  panel.roundRect(-11, -31, 28, 62, 3).stroke({ width: 1, color, alpha: 0.25 });
  const topPip = glyphText(glyph, 16, color);
  topPip.position.set(3, -20);
  const botPip = glyphText(glyph, 16, color);
  botPip.position.set(3, 20);
  botPip.rotation = Math.PI;
  const letter = new Text({
    text: FACE_NAMES[card.rank] ?? rank,
    style: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: '700',
      fontSize: 34,
      fill: color,
    },
  });
  letter.anchor.set(0.5);
  letter.position.set(3, 0);
  face.addChild(panel, topPip, botPip, letter);
}

/**
 * One playing card. Face/back swap happens mid-flip (scaleX through 0) so the
 * flip reads as a 3D turn without a real 3D transform. Purely visual — which
 * face is shown is decided by the projected game state, never by this class.
 */
export class CardSprite extends Container {
  private readonly shadow = new Graphics();
  private readonly back = new Graphics();
  private readonly front = new Container();
  private faceUp: boolean;
  private flipTween: gsap.core.Tween | null = null;

  private card: Card | null;

  constructor(card: Card | null, faceUp: boolean) {
    super();
    this.card = card;
    this.faceUp = faceUp && card !== null;
    this.shadow
      .roundRect(-CARD_W / 2 + 2, -CARD_H / 2 + 5, CARD_W, CARD_H, CARD_RADIUS)
      .fill({ color: 0x000000, alpha: 0.38 });
    drawBack(this.back);
    if (card) drawFace(this.front, card);
    this.addChild(this.shadow, this.back, this.front);
    this.applyFace();
  }

  get cardKey(): string | null {
    return this.card ? `${this.card.rank}${this.card.suit}` : null;
  }

  /** Reveals a previously unknown card (opponent hand at showdown) and flips it face up. */
  reveal(card: Card, animate: boolean): void {
    if (this.card) return;
    this.card = card;
    drawFace(this.front, card);
    this.setFaceUp(true, animate);
  }

  get isFaceUp(): boolean {
    return this.faceUp;
  }

  private applyFace(): void {
    this.front.visible = this.faceUp;
    this.back.visible = !this.faceUp;
  }

  setFaceUp(faceUp: boolean, animate: boolean): void {
    if (faceUp === this.faceUp || (faceUp && !this.card)) return;
    this.flipTween?.kill();
    if (!animate) {
      this.faceUp = faceUp;
      this.applyFace();
      return;
    }
    const base = this.scale.x;
    this.flipTween = gsap.to(this.scale, {
      x: 0,
      duration: 0.16,
      ease: 'power2.in',
      onComplete: () => {
        this.faceUp = faceUp;
        this.applyFace();
        this.flipTween = gsap.to(this.scale, { x: base, duration: 0.2, ease: 'back.out(2)' });
      },
    });
  }

  killTweens(): void {
    this.flipTween?.kill();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
  }
}
