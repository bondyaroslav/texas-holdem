import type { HandRecord } from '@poker/protocol';

type Card = HandRecord['board'][number];

const card = (c: Card): string => `${c.rank}${c.suit[0] ?? ''}`;
const cards = (list: readonly Card[]): string => `[${list.map(card).join(' ')}]`;

/**
 * Plain-text hand history in the familiar online-poker layout. Deliberately
 * not localized: it is a data format meant for other tools, like a CSV header.
 */
export function formatHandText(record: HandRecord): string {
  const { smallBlind, bigBlind, ante } = record.blinds;
  const lines: string[] = [
    `Hand #${String(record.handNumber)} (${record.id}) - Hold'em No Limit (${String(smallBlind)}/${String(bigBlind)}${ante > 0 ? ` ante ${String(ante)}` : ''}) - ${new Date(record.endedAt).toISOString()}`,
    `Seed: ${String(record.seed)}`,
  ];
  for (const p of record.players) {
    const dealer = p.seat === record.dealerIndex ? ' (button)' : '';
    lines.push(
      `Seat ${String(p.seat + 1)}: ${p.id} (${String(p.startingStack)} in chips)${dealer} ${cards(p.holeCards)}`,
    );
  }

  const committed = new Map<string, number>();
  for (const event of record.events) {
    switch (event.type) {
      case 'blindsPosted': {
        const label = { ante: 'the ante', smallBlind: 'small blind', bigBlind: 'big blind' }[
          event.kind
        ];
        lines.push(`${event.playerId}: posts ${label} ${String(event.amount)}`);
        if (event.kind !== 'ante') committed.set(event.playerId, event.amount);
        break;
      }
      case 'cardsDealt':
        if (!lines.includes('*** HOLE CARDS ***')) lines.push('*** HOLE CARDS ***');
        break;
      case 'actionTaken': {
        const a = event.action;
        const who = event.playerId;
        if (a.kind === 'bet') lines.push(`${who}: bets ${String(a.amount)}`);
        else if (a.kind === 'raise') lines.push(`${who}: raises to ${String(a.amount)}`);
        else if (a.kind === 'call') lines.push(`${who}: calls`);
        else
          lines.push(
            `${who}: ${a.kind === 'fold' ? 'folds' : a.kind === 'check' ? 'checks' : 'is all-in'}`,
          );
        break;
      }
      case 'streetAdvanced':
        if (event.street === 'showdown') lines.push('*** SHOWDOWN ***');
        else if (event.street !== 'idle' && event.street !== 'preflop') {
          lines.push(`*** ${event.street.toUpperCase()} *** ${cards(event.communityCards)}`);
        }
        break;
      case 'potAwarded':
        lines.push(`${event.playerId} collected ${String(event.amount)}`);
        break;
      default:
        break;
    }
  }

  lines.push('*** SUMMARY ***');
  if (record.board.length > 0) lines.push(`Board ${cards(record.board)}`);
  for (const p of record.players) {
    const net = p.endingStack - p.startingStack;
    lines.push(`${p.id}: ${net >= 0 ? '+' : ''}${String(net)}`);
  }
  return lines.join('\n');
}

/** Several hands, oldest first, separated by blank lines — the usual file layout. */
export function formatHandsText(records: readonly HandRecord[]): string {
  return [...records]
    .sort((a, b) => a.endedAt - b.endedAt)
    .map(formatHandText)
    .join('\n\n\n');
}

/** Offers `text` as a file download; a no-op where Blob URLs are unavailable (tests, old browsers). */
export function downloadText(fileName: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
