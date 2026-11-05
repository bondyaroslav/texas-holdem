/** "bot-2" → "Bot 2"; the local player gets the localized "You" label. */
export function formatPlayerName(id: string, heroId: string, youLabel: string): string {
  return id === heroId ? youLabel : id.replace(/^bot-/, 'Bot ');
}
