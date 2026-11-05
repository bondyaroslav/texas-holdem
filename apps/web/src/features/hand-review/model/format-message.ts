import type { TFunction } from 'i18next';
import type { Message } from './types.js';

const RANK_LABELS: Readonly<Record<number, string>> = {
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};
const PLAYER_PARAMS = new Set(['player', 'winner', 'bettor']);

export function rankLabel(value: number): string {
  return RANK_LABELS[value] ?? String(value);
}

/**
 * Renders an analysis message: the package hands over raw ids and codes, the
 * UI turns them into words — player ids into names, categories, streets and
 * ranks into their localized labels — before interpolation.
 */
export function formatMessage(
  message: Message,
  t: TFunction,
  playerName: (id: string) => string,
): string {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(message.params)) {
    if (PLAYER_PARAMS.has(name) && typeof value === 'string') {
      params[name] = playerName(value);
    } else if (name === 'winners' && typeof value === 'string') {
      params[name] = value.split(',').filter(Boolean).map(playerName).join(', ');
    } else if (name === 'category' && typeof value === 'string') {
      params[name] = value ? t(`handRankings.items.${value}.name`) : '';
    } else if (name === 'street' && typeof value === 'string') {
      params[name] = t(`streets.${value}`);
    } else if (name === 'pot' && typeof value === 'string') {
      params[name] = t(`review.potKind.${value}`);
    } else if (name === 'best' && typeof value === 'string') {
      params[name] = t(`review.action.${value}`);
    } else if (name === 'kickerRank' && typeof value === 'number') {
      params[name] = rankLabel(value);
    } else {
      params[name] = value;
    }
  }
  // Unknown keys (a newer analysis than this UI) fall back to a neutral sentence.
  const fallback = message.key.split('.')[0] === 'decision' ? 'decision.generic' : 'review.generic';
  return t([message.key, fallback], params);
}
