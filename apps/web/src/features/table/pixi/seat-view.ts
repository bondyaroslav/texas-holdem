import { Container, Graphics, Point, Text } from 'pixi.js';
import gsap from 'gsap';
import type { Card, PlayerStatus } from './types.js';
import { CardSprite } from './card-sprite.js';
import { THEME, formatChips } from './theme.js';

export interface SeatInfo {
  readonly name: string;
  readonly seatIndex: number;
  readonly stack: number;
  readonly status: PlayerStatus;
  readonly holeCards: readonly Card[] | null;
  readonly inHand: boolean;
  readonly isDealer: boolean;
  readonly isActing: boolean;
  readonly isLocal: boolean;
  readonly handNumber: number;
}

const AVATAR_R = 30;

function text(value: string, size: number, fill: number, weight = '700'): Text {
  const t = new Text({
    text: value,
    style: { fontFamily: THEME.fontFamily, fontSize: size, fontWeight: weight as '700', fill },
  });
  t.anchor.set(0.5);
  return t;
}

/** One player's seat: avatar, name plate, stack, status badge, dealer button and hole cards. Renders `SeatInfo` only — no game rules. */
export class SeatView extends Container {
  private readonly glow = new Graphics();
  private readonly avatar = new Graphics();
  private readonly initial = text('', 24, 0xffffff, '800');
  private readonly plate = new Graphics();
  private readonly nameText = text('', 13, THEME.text);
  private readonly stackText = text('', 14, THEME.gold, '800');
  private readonly badge = new Container();
  private readonly badgeBg = new Graphics();
  private readonly badgeText = text('', 10, 0xffffff, '800');
  private readonly dealer = new Container();
  private readonly cardLayer = new Container();
  private cards: CardSprite[] = [];
  private lastHand = -1;
  private pulse: gsap.core.Tween | null = null;
  private acting = false;
  private lastName = '';

  constructor(private readonly deckPoint: () => Point) {
    super();
    this.glow.circle(0, 0, AVATAR_R + 10).fill({ color: THEME.gold, alpha: 0.5 });
    this.glow.alpha = 0;
    this.badge.addChild(this.badgeBg, this.badgeText);
    this.badge.visible = false;

    const d = new Graphics()
      .circle(0, 2, 12)
      .fill({ color: 0x000000, alpha: 0.4 })
      .circle(0, 0, 12)
      .fill(0xfdfdfb)
      .stroke({ width: 2, color: THEME.goldDark });
    const dt = text('D', 13, 0x111827, '900');
    this.dealer.addChild(d, dt);
    this.dealer.position.set(AVATAR_R - 2, -AVATAR_R + 4);

    this.nameText.position.set(0, AVATAR_R + 14);
    this.stackText.position.set(0, AVATAR_R + 31);
    this.badge.position.set(0, -AVATAR_R - 4);
    this.initial.position.set(0, 1);
    this.addChild(
      this.cardLayer,
      this.glow,
      this.avatar,
      this.initial,
      this.plate,
      this.nameText,
      this.stackText,
      this.badge,
      this.dealer,
    );
  }

  private drawFrame(color: number, local: boolean): void {
    this.avatar.clear();
    this.avatar.circle(0, 3, AVATAR_R).fill({ color: 0x000000, alpha: 0.45 });
    this.avatar
      .circle(0, 0, AVATAR_R)
      .fill(color)
      .stroke({
        width: local ? 4 : 3,
        color: local ? THEME.gold : 0xf8fafc,
        alpha: local ? 1 : 0.85,
      });
    this.avatar.circle(-8, -10, 9).fill({ color: 0xffffff, alpha: 0.18 });
  }

  private drawPlate(width: number): void {
    this.plate.clear();
    this.plate
      .roundRect(-width / 2, AVATAR_R + 3, width, 41, 13)
      .fill({ color: THEME.plate, alpha: 0.92 })
      .stroke({ width: 1.5, color: THEME.gold, alpha: 0.55 });
  }

  private setBadge(label: string | null, color: number): void {
    this.badge.visible = label !== null;
    if (!label) return;
    this.badgeText.text = label;
    const w = this.badgeText.width + 16;
    this.badgeBg
      .clear()
      .roundRect(-w / 2, -9, w, 18, 9)
      .fill(color);
  }

  private setActing(acting: boolean, animate: boolean): void {
    if (acting === this.acting) return;
    this.acting = acting;
    this.pulse?.kill();
    if (acting && animate) {
      this.glow.alpha = 0.35;
      this.pulse = gsap.to(this.glow, {
        alpha: 0.9,
        duration: 0.7,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    } else {
      this.glow.alpha = acting ? 0.7 : 0;
    }
  }

  update(
    info: SeatInfo,
    animate: boolean,
    dealDelay: () => number,
    labels: { allIn: string; fold: string },
  ): void {
    if (info.name !== this.lastName) {
      this.lastName = info.name;
      this.nameText.text = info.name;
      this.initial.text = (/\d+$/.exec(info.name)?.[0] ?? info.name.slice(0, 1)).toUpperCase();
      const color = THEME.avatarPalette[info.seatIndex % THEME.avatarPalette.length] ?? 0x4ea8de;
      this.drawFrame(color, info.isLocal);
    }
    this.stackText.text = formatChips(info.stack);
    this.drawPlate(Math.max(92, this.nameText.width + 26));
    this.dealer.visible = info.isDealer;

    const folded = info.status === 'folded';
    const out = info.status === 'sittingOut';
    this.alpha = out ? 0.35 : folded ? 0.55 : 1;
    if (info.status === 'allIn') this.setBadge(labels.allIn, THEME.danger);
    else if (folded) this.setBadge(labels.fold, 0x475569);
    else this.setBadge(null, 0);
    this.setActing(info.isActing, animate);
    this.syncCards(info, animate, dealDelay);
  }

  private cardScale(info: Pick<SeatInfo, 'isLocal'>): number {
    return info.isLocal ? 0.92 : 0.62;
  }

  private cardTarget(i: number, isLocal: boolean): { x: number; y: number; rotation: number } {
    const spread = isLocal ? 30 : 17;
    const side = i === 0 ? -1 : 1;
    return {
      x: side * spread,
      y: isLocal ? -AVATAR_R - 22 : -AVATAR_R - 16,
      rotation: side * 0.13,
    };
  }

  private syncCards(info: SeatInfo, animate: boolean, dealDelay: () => number): void {
    const wantCards = info.inHand || (info.holeCards !== null && info.holeCards.length > 0);
    if (info.handNumber !== this.lastHand || !wantCards) {
      for (const c of this.cards) {
        c.killTweens();
        c.destroy({ children: true });
      }
      this.cards = [];
      this.lastHand = info.handNumber;
    }
    if (!wantCards || info.status === 'sittingOut') return;

    const known = info.holeCards;
    const total = known?.length ?? 2;
    const scale = this.cardScale(info);
    for (let i = 0; i < total; i++) {
      const card = known?.[i] ?? null;
      let sprite = this.cards[i];
      if (!sprite) {
        sprite = new CardSprite(card, false);
        this.cards[i] = sprite;
        this.cardLayer.addChild(sprite);
        const t = this.cardTarget(i, info.isLocal);
        sprite.scale.set(scale);
        if (animate) {
          const from = this.toLocal(this.deckPoint());
          sprite.position.copyFrom(from);
          sprite.alpha = 0;
          sprite.rotation = -0.6;
          const delay = dealDelay();
          gsap.to(sprite, {
            x: t.x,
            y: t.y,
            rotation: t.rotation,
            alpha: 1,
            duration: 0.45,
            delay,
            ease: 'power3.out',
          });
          if (card) {
            gsap.delayedCall(delay + 0.4, () => {
              if (!sprite?.destroyed) sprite?.setFaceUp(true, true);
            });
          }
        } else {
          sprite.position.set(t.x, t.y);
          sprite.rotation = t.rotation;
          sprite.setFaceUp(card !== null, false);
        }
      } else if (card && !sprite.cardKey) {
        sprite.reveal(card, animate);
      }
    }
  }

  /** Snap cards to their resting pose after a resize cancelled any in-flight deal. */
  snapCards(isLocal: boolean): void {
    this.cards.forEach((c, i) => {
      c.killTweens();
      const t = this.cardTarget(i, isLocal);
      c.position.set(t.x, t.y);
      c.rotation = t.rotation;
      c.scale.set(this.cardScale({ isLocal }));
      c.alpha = 1;
      c.setFaceUp(c.cardKey !== null && c.isFaceUp, false);
    });
  }

  override destroy(): void {
    this.pulse?.kill();
    for (const c of this.cards) c.killTweens();
    gsap.killTweensOf(this.glow);
    super.destroy({ children: true });
  }
}
