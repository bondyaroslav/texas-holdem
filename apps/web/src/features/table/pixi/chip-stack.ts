import { Container, Graphics, Text } from 'pixi.js';
import { THEME, formatChips } from './theme.js';

const CHIP_R = 11;
const CHIP_THICK = 3;
const MAX_CHIPS_PER_COLUMN = 8;

function drawChip(color: number, edge: number): Graphics {
  const g = new Graphics();
  g.ellipse(0, CHIP_THICK, CHIP_R, CHIP_R * 0.55).fill({ color: 0x000000, alpha: 0.45 });
  g.ellipse(0, 0, CHIP_R, CHIP_R * 0.55)
    .fill(color)
    .stroke({ width: 1, color: edge, alpha: 0.5 });
  g.ellipse(0, 0, CHIP_R * 0.62, CHIP_R * 0.34).stroke({ width: 1.5, color: edge, alpha: 0.85 });
  // Edge notches.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.circle(Math.cos(a) * CHIP_R * 0.85, Math.sin(a) * CHIP_R * 0.47, 1.4).fill(edge);
  }
  return g;
}

/** Greedy breakdown of an amount into chip denominations, capped so huge pots stay readable. */
export function breakIntoChips(amount: number): { color: number; edge: number; count: number }[] {
  const out: { color: number; edge: number; count: number }[] = [];
  let rest = amount;
  for (const d of THEME.chips) {
    const count = Math.min(Math.floor(rest / d.value), MAX_CHIPS_PER_COLUMN);
    if (count > 0) out.push({ color: d.color, edge: d.edge, count });
    rest -= Math.floor(rest / d.value) * d.value;
    if (out.length >= 4) break;
  }
  return out;
}

/** Stacked chips with an amount label beneath; rebuilt only when the amount changes. */
export class ChipStack extends Container {
  private amount = -1;
  private readonly amountText: Text;

  constructor(showLabel = true) {
    super();
    this.amountText = new Text({
      text: '',
      style: {
        fontFamily: THEME.fontFamily,
        fontSize: 13,
        fontWeight: '700',
        fill: THEME.text,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.amountText.anchor.set(0.5, 0);
    this.amountText.visible = showLabel;
  }

  setAmount(amount: number): void {
    if (amount === this.amount) return;
    this.amount = amount;
    for (const child of this.removeChildren()) {
      // The label is reused across rebuilds, so it must survive the cleanup.
      if (child !== this.amountText) child.destroy({ children: true });
    }
    this.visible = amount > 0;
    if (amount <= 0) return;

    const columns = breakIntoChips(amount);
    const spacing = CHIP_R * 2 + 2;
    const startX = (-(columns.length - 1) * spacing) / 2;
    columns.forEach((col, ci) => {
      for (let i = 0; i < col.count; i++) {
        const chip = drawChip(col.color, col.edge);
        chip.position.set(startX + ci * spacing, -i * CHIP_THICK);
        this.addChild(chip);
      }
    });
    this.amountText.text = formatChips(amount);
    this.amountText.position.set(0, CHIP_R * 0.9);
    this.addChild(this.amountText);
  }
}
