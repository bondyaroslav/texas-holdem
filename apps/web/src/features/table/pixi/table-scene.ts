import { Application, BlurFilter, Container, FillGradient, Graphics, Point, Text } from 'pixi.js';
import gsap from 'gsap';
import type { ProjectedState } from './types.js';
import { CardSprite } from './card-sprite.js';
import { ChipStack } from './chip-stack.js';
import { SeatView } from './seat-view.js';
import { formatPlayerName } from '../model/hand-result.js';
import { CARD_H, CARD_W, THEME, formatChips } from './theme.js';

export interface SceneLabels {
  readonly pot: string;
  readonly you: string;
  readonly allIn: string;
  readonly fold: string;
  readonly title: string;
}

interface Layout {
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly scale: number;
  readonly portrait: boolean;
  /** Scale of the community cards — smaller on phones so five fit between the side seats. */
  readonly boardScale: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Imperative Pixi scene for the poker table. It only consumes projected state
 * (CLAUDE.md §3.5): every visual is derived from the latest `ProjectedState`,
 * animations never feed back into the game.
 */
export class TableScene {
  private readonly app = new Application();
  private readonly bg = new Graphics();
  private readonly tableLayer = new Container();
  private readonly ambient = new Container();
  private readonly slots = new Graphics();
  private readonly deck = new Container();
  private readonly seatLayer = new Container();
  private readonly betLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly potStack = new ChipStack(false);
  private readonly potLabel: Text;
  private readonly potAmount: Text;
  private readonly seats = new Map<string, SeatView>();
  private readonly bets = new Map<string, ChipStack>();
  private readonly betAmounts = new Map<string, number>();
  private community: CardSprite[] = [];
  private layout: Layout | null = null;
  private state: ProjectedState | null = null;
  private labels: SceneLabels;
  private ready = false;
  private destroyed = false;
  private lastHand = -1;
  private dust: { g: Graphics; vx: number; vy: number }[] = [];
  private tick = (): void => {
    for (const d of this.dust) {
      d.g.x += d.vx;
      d.g.y += d.vy;
      if (this.layout) {
        if (d.g.y < -10) d.g.y = this.layout.h + 10;
        if (d.g.x < -10) d.g.x = this.layout.w + 10;
        if (d.g.x > this.layout.w + 10) d.g.x = -10;
      }
    }
  };

  constructor(labels: SceneLabels) {
    this.labels = labels;
    const label = (size: number, fill: number, weight: string): Text => {
      const t = new Text({
        text: '',
        style: {
          fontFamily: THEME.fontFamily,
          fontSize: size,
          fontWeight: weight as '700',
          fill,
          letterSpacing: 2,
        },
      });
      t.anchor.set(0.5);
      return t;
    };
    this.potLabel = label(11, THEME.textMuted, '700');
    this.potAmount = label(22, THEME.gold, '800');
    this.potAmount.style.letterSpacing = 0;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(
      this.bg,
      this.ambient,
      this.tableLayer,
      this.slots,
      this.deck,
      this.potStack,
      this.potLabel,
      this.potAmount,
      this.betLayer,
      this.cardLayer,
      this.seatLayer,
    );
    this.app.renderer.on('resize', () => {
      this.relayout();
    });
    this.app.ticker.add(this.tick);
    this.ready = true;
    this.relayout();
    if (this.state) this.sync(false);
  }

  setLabels(labels: SceneLabels): void {
    this.labels = labels;
    if (this.ready) this.relayout();
  }

  update(state: ProjectedState): void {
    const first = this.state === null;
    this.state = state;
    if (this.ready) this.sync(!first);
  }

  /** Pause the ticker while the tab is hidden (CLAUDE.md §3.5 performance). */
  setPaused(paused: boolean): void {
    if (!this.ready) return;
    if (paused) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.ready) return;
    this.ready = false;
    gsap.killTweensOf('*');
    for (const c of this.community) c.killTweens();
    this.app.ticker.remove(this.tick);
    this.app.destroy(true, { children: true, texture: true, textureSource: true });
  }

  // ---- layout -----------------------------------------------------------

  private computeLayout(): Layout {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const portrait = w < h * 0.9;
    const tableW = portrait ? w * 0.7 : Math.min(w * 0.9, h * 1.85);
    const tableH = portrait ? Math.min(h * 0.62, tableW * 1.7) : Math.min(h * 0.6, tableW * 0.54);
    const scale = portrait ? clamp(w / 520, 0.5, 0.9) : clamp(Math.min(w / 900, h / 520), 0.5, 1.4);
    const boardScale = portrait ? scale * 0.58 : scale * 0.95;
    return {
      w,
      h,
      cx: w / 2,
      cy: h * 0.5,
      rx: tableW / 2,
      ry: tableH / 2,
      scale,
      portrait,
      boardScale,
    };
  }

  private relayout(): void {
    this.layout = this.computeLayout();
    this.drawBackground();
    this.drawTable();
    this.drawAmbient();
    this.placeStatics();
    if (this.state) this.sync(false, true);
  }

  private drawBackground(): void {
    const { w, h, cx, cy } = this.layout ?? this.computeLayout();
    const grad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.45 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.45 },
      outerRadius: 0.75,
      colorStops: [
        { offset: 0, color: 0x15233b },
        { offset: 1, color: THEME.background.bottom },
      ],
      textureSpace: 'local',
    });
    this.bg.clear().rect(0, 0, w, h).fill(grad);
    // Soft spotlight cone above the table.
    this.bg.ellipse(cx, cy, w * 0.55, h * 0.5).fill({ color: 0xffffff, alpha: 0.03 });
  }

  private drawTable(): void {
    const { cx, cy, rx, ry, scale, portrait } = this.layout ?? this.computeLayout();
    for (const c of this.tableLayer.removeChildren()) c.destroy({ children: true });

    const shadow = new Graphics()
      .ellipse(cx, cy + 26 * scale, rx + 34, ry + 30)
      .fill({ color: 0x000000, alpha: 0.7 });
    shadow.filters = [new BlurFilter({ strength: 22, quality: 3 })];

    const rail = new Graphics();
    const railW = 26 * scale + 6;
    rail.ellipse(cx, cy, rx + railW, ry + railW).fill(THEME.rail.outer);
    rail.ellipse(cx, cy, rx + railW - 3, ry + railW - 3).fill(THEME.rail.mid);
    rail
      .ellipse(cx, cy - 2, rx + railW - 8, ry + railW - 8)
      .stroke({ width: 3, color: THEME.rail.highlight, alpha: 0.55 });
    rail.ellipse(cx, cy, rx + 6, ry + 6).fill(0x120a05);

    const feltGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.62,
      colorStops: [
        { offset: 0, color: THEME.felt.center },
        { offset: 1, color: THEME.felt.edge },
      ],
      textureSpace: 'local',
    });
    const felt = new Graphics().ellipse(cx, cy, rx, ry).fill(feltGrad);
    // Inner betting line, a classic felt detail.
    const line = new Graphics()
      .ellipse(cx, cy, rx * 0.8, ry * 0.76)
      .stroke({ width: 2, color: THEME.felt.line, alpha: 0.35 });
    // Light falloff towards the rim.
    const vignette = new Graphics()
      .ellipse(cx, cy, rx, ry)
      .stroke({ width: 18, color: 0x000000, alpha: 0.28 });
    vignette.filters = [new BlurFilter({ strength: 8 })];

    const title = new Text({
      text: this.labels.title.toUpperCase(),
      style: {
        fontFamily: THEME.fontFamily,
        fontSize: Math.round(15 * scale),
        fontWeight: '800',
        fill: THEME.felt.line,
        letterSpacing: 6,
      },
    });
    title.alpha = 0.22;
    title.anchor.set(0.5);
    title.position.set(cx, cy - ry * 0.42);
    // On wide tables the pot sits where the watermark would, so it is dropped there.
    title.visible = portrait;

    this.tableLayer.addChild(shadow, rail, felt, line, vignette, title);
  }

  private drawAmbient(): void {
    const { w, h } = this.layout ?? this.computeLayout();
    for (const c of this.ambient.removeChildren()) c.destroy();
    this.dust = [];
    for (let i = 0; i < 26; i++) {
      const g = new Graphics()
        .circle(0, 0, 1 + (i % 3) * 0.7)
        .fill({ color: 0xffe9b0, alpha: 0.12 + (i % 4) * 0.04 });
      g.position.set((((i * 97) % 100) / 100) * w, (((i * 53) % 100) / 100) * h);
      this.ambient.addChild(g);
      this.dust.push({ g, vx: ((i % 5) - 2) * 0.04, vy: -0.05 - (i % 4) * 0.03 });
    }
  }

  private deckPoint = (): Point => {
    const l = this.layout;
    if (!l) return new Point(0, 0);
    return l.portrait
      ? new Point(l.cx, l.cy - l.ry * 0.5)
      : new Point(l.cx - l.rx * 0.42, l.cy - l.ry * 0.28);
  };

  private communityPoint(i: number): Point {
    const l = this.layout ?? this.computeLayout();
    const gap = (CARD_W + (l.portrait ? 6 : 10)) * l.boardScale;
    return new Point(l.cx + (i - 2) * gap + (l.portrait ? 0 : l.rx * 0.06), l.cy - 8 * l.scale);
  }

  private placeStatics(): void {
    const l = this.layout ?? this.computeLayout();
    const s = l.boardScale;

    this.slots.clear();
    for (let i = 0; i < 5; i++) {
      const p = this.communityPoint(i);
      this.slots
        .roundRect(p.x - (CARD_W * s) / 2, p.y - (CARD_H * s) / 2, CARD_W * s, CARD_H * s, 7 * s)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.14 });
    }

    for (const c of this.deck.removeChildren()) c.destroy({ children: true });
    const dp = this.deckPoint();
    // On phones the deck would collide with bets; cards still fly in from its point.
    for (let i = 0; i < (l.portrait ? 0 : 4); i++) {
      const c = new CardSprite(null, false);
      c.scale.set(l.scale * 0.8);
      c.position.set(dp.x - i * 1.2, dp.y - i * 1.6);
      this.deck.addChild(c);
    }

    // Landscape has room above the board; portrait is too narrow, so the pot sits below it.
    const boardTop = this.communityPoint(0).y - (CARD_H * l.boardScale) / 2;
    const potY = l.portrait ? l.cy + 62 * l.scale : boardTop - 24 * l.scale;
    this.potStack.position.set(l.cx - 4 * l.scale, potY);
    this.potStack.scale.set(l.scale * 1.15);
    this.potLabel.text = this.labels.pot.toUpperCase();
    this.potAmount.scale.set(l.scale);
  }

  // ---- state sync -------------------------------------------------------

  private sync(animate: boolean, snap = false): void {
    const state = this.state;
    const l = this.layout;
    if (!state || !l) return;

    // A new hand: wipe last hand's board so cards deal in fresh.
    if (state.handNumber !== this.lastHand) {
      for (const c of this.community) {
        c.killTweens();
        c.destroy({ children: true });
      }
      this.community = [];
      this.lastHand = state.handNumber;
    }

    let delay = 0;
    const nextDelay = (): number => {
      delay += 0.12;
      return delay;
    };

    this.syncSeats(state, l, animate && !snap, nextDelay, snap);
    this.syncCommunity(state, l, animate && !snap, snap);
    this.syncPot(state, animate && !snap);
  }

  private seatPosition(rel: number, count: number, l: Layout): Point {
    const angle = Math.PI / 2 + (rel / count) * Math.PI * 2;
    // Seats sit just outside the felt, on the rail.
    const k = 1.06;
    return new Point(
      l.cx + Math.cos(angle) * l.rx * k,
      l.cy + Math.sin(angle) * l.ry * k + (rel === 0 ? 8 * l.scale : 0),
    );
  }

  private syncSeats(
    state: ProjectedState,
    l: Layout,
    animate: boolean,
    nextDelay: () => number,
    snap: boolean,
  ): void {
    const count = state.players.length;
    const localIndex = Math.max(
      0,
      state.players.findIndex((p) => p.id === state.viewerId),
    );
    const inHand = state.street !== 'idle';
    const ids = new Set(state.players.map((p) => p.id as string));

    for (const [id, seat] of this.seats) {
      if (!ids.has(id)) {
        seat.destroy();
        this.seats.delete(id);
      }
    }

    state.players.forEach((player, index) => {
      const rel = (index - localIndex + count) % count;
      const pos = this.seatPosition(rel, count, l);
      let seat = this.seats.get(player.id);
      if (!seat) {
        seat = new SeatView(this.deckPoint);
        this.seats.set(player.id, seat);
        this.seatLayer.addChild(seat);
      }
      seat.position.copyFrom(pos);
      seat.scale.set(l.scale * (rel === 0 ? 1.1 : 1));
      const isLocal = player.id === state.viewerId;
      seat.update(
        {
          name: formatPlayerName(player.id, state.viewerId, this.labels.you),
          seatIndex: index,
          stack: player.stack,
          // The engine leaves last hand's 'allIn' on seats until the next deal; between hands show who can still play.
          status: inHand ? player.status : player.stack > 0 ? 'active' : 'sittingOut',
          holeCards: player.holeCards,
          inHand: inHand && player.status !== 'sittingOut',
          isDealer: index === state.dealerIndex,
          isActing: player.id === state.actingPlayerId,
          isLocal,
          handNumber: state.handNumber,
        },
        animate,
        nextDelay,
        this.labels,
      );
      if (snap) seat.snapCards(isLocal);

      // Bet chips slide from the seat towards the middle of the table.
      let bet = this.bets.get(player.id);
      if (!bet) {
        bet = new ChipStack();
        this.bets.set(player.id, bet);
        this.betLayer.addChild(bet);
      }
      const target = new Point(pos.x + (l.cx - pos.x) * 0.34, pos.y + (l.cy - pos.y) * 0.34);
      const prev = this.betAmounts.get(player.id) ?? 0;
      this.betAmounts.set(player.id, player.committedThisStreet);
      bet.scale.set(l.scale * 0.9);
      bet.setAmount(player.committedThisStreet);
      gsap.killTweensOf(bet);
      if (animate && prev === 0 && player.committedThisStreet > 0) {
        bet.position.copyFrom(pos);
        gsap.to(bet, { x: target.x, y: target.y, duration: 0.35, ease: 'power2.out' });
      } else {
        bet.position.copyFrom(target);
      }
    });
  }

  private syncCommunity(state: ProjectedState, l: Layout, animate: boolean, snap: boolean): void {
    const s = l.boardScale;
    state.communityCards.forEach((card, i) => {
      const target = this.communityPoint(i);
      let sprite = this.community[i];
      if (!sprite) {
        sprite = new CardSprite(card, false);
        this.community[i] = sprite;
        this.cardLayer.addChild(sprite);
        sprite.scale.set(s);
        if (animate) {
          const from = this.deckPoint();
          sprite.position.copyFrom(from);
          sprite.alpha = 0;
          sprite.rotation = -0.5;
          // Cards of one street (flop = 3) are staggered by their index within it.
          const streetStart = i < 3 ? 0 : i;
          const delay = (i - streetStart) * 0.16;
          gsap.to(sprite, {
            x: target.x,
            y: target.y,
            rotation: 0,
            alpha: 1,
            duration: 0.5,
            delay,
            ease: 'power3.out',
          });
          gsap.delayedCall(delay + 0.45, () => {
            if (!sprite?.destroyed) sprite?.setFaceUp(true, true);
          });
        } else {
          sprite.position.copyFrom(target);
          sprite.setFaceUp(true, false);
        }
      } else if (snap) {
        sprite.killTweens();
        sprite.position.copyFrom(target);
        sprite.scale.set(s);
        sprite.rotation = 0;
        sprite.alpha = 1;
        sprite.setFaceUp(true, false);
      }
    });
  }

  /** Keeps the pot caption and total clear of the chip stack, whose width grows with the amount. */
  private placePotLabels(): void {
    const l = this.layout;
    if (!l) return;
    const half = this.potStack.width / 2 + 10 * l.scale;
    const y = this.potStack.y - 6 * l.scale;
    this.potLabel.position.set(this.potStack.x - half - this.potLabel.width / 2, y);
    this.potAmount.position.set(this.potStack.x + half + this.potAmount.width / 2, y);
  }

  private syncPot(state: ProjectedState, animate: boolean): void {
    // The pot figure includes uncollected street bets, which are drawn in front of seats instead.
    const settled = state.pot;
    const before = this.potAmount.text;
    this.potStack.setAmount(settled);
    this.potAmount.text = formatChips(settled);
    this.potAmount.visible = settled > 0;
    this.placePotLabels();
    this.potLabel.visible = settled > 0;
    if (animate && before !== this.potAmount.text && settled > 0) {
      gsap.fromTo(
        this.potAmount.scale,
        { x: (this.layout?.scale ?? 1) * 1.25, y: (this.layout?.scale ?? 1) * 1.25 },
        {
          x: this.layout?.scale ?? 1,
          y: this.layout?.scale ?? 1,
          duration: 0.4,
          ease: 'back.out(3)',
        },
      );
    }
  }
}
