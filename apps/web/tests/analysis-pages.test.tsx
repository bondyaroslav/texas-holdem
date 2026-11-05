import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { JSX } from 'react';
import i18next from '@/shared/i18n';
import { HandHistoryContext, type HandEntry } from '@/shared';
import { buildTimeline, frameBeforeEvent } from '@/features/hand-review';
import { HistorySettings } from '@/features/settings';
import HandHistoryPage from '@/pages/HandHistory';
import HandReviewPage from '@/pages/HandReview';
import StatsPage from '@/pages/Stats';
import GlossaryPage from '@/pages/Glossary';
import {
  InMemoryHistoryService,
  playHands,
  reviewableEntry,
  toEntry,
} from './fixtures/played-hands';

function renderAt(service: InMemoryHistoryService, path: string, extra?: JSX.Element) {
  return render(
    <HandHistoryContext.Provider value={service}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/history" element={<HandHistoryPage />} />
          <Route path="/history/:handId" element={<HandReviewPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
          <Route path="/settings" element={extra ?? <div />} />
        </Routes>
      </MemoryRouter>
    </HandHistoryContext.Provider>,
  );
}

beforeAll(async () => {
  await i18next.changeLanguage('uk');
});

describe('HandReview page', () => {
  let entry: HandEntry;
  beforeAll(async () => {
    entry = await reviewableEntry();
  });

  const openReview = async (): Promise<HTMLElement> => {
    renderAt(new InMemoryHistoryService([entry]), `/history/${entry.record.id}`);
    expect(
      await screen.findByRole('heading', {
        name: `Розбір роздачі №${String(entry.record.handNumber)}`,
      }),
    ).toBeInTheDocument();
    return screen.getByRole('slider', { name: 'Крок роздачі' });
  };

  it('steps through the hand with the keyboard and the buttons', async () => {
    const slider = await openReview();
    const frames = buildTimeline(entry.record);

    expect(slider).toHaveAttribute('aria-valuenow', '1');
    expect(slider).toHaveAttribute('aria-valuemax', String(frames.length));
    expect(slider.getAttribute('aria-valuetext')).toContain('Роздано карти');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '2');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '1');

    fireEvent.keyDown(slider, { key: 'PageDown' });
    const flop = frames.findIndex((f) => f.street === 'flop');
    expect(slider).toHaveAttribute('aria-valuenow', String(flop + 1));
    expect(slider.getAttribute('aria-valuetext')).toContain('Флоп');

    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', String(frames.length));
    expect(slider.getAttribute('aria-valuetext')).toContain('Банк забирає');
    expect(screen.getByRole('button', { name: 'Крок уперед' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'На початок' }));
    expect(slider).toHaveAttribute('aria-valuenow', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Крок уперед' }));
    expect(slider).toHaveAttribute('aria-valuenow', '2');
  });

  it('shows every decision with its verdict in words, numbers and alternatives', async () => {
    await openReview();
    const decisions = entry.analysis?.decisions ?? [];
    const section = screen.getByRole('heading', { name: 'Ваші рішення' }).closest('section');
    if (!section) throw new Error('no decisions section');
    const cards = within(section).getAllByRole('article');

    expect(cards).toHaveLength(decisions.length);
    const verdictLabels = {
      best: 'Найкраще',
      good: 'Добре',
      inaccuracy: 'Неточність',
      mistake: 'Помилка',
      blunder: 'Груба помилка',
    };
    decisions.forEach((d, i) => {
      const card = cards[i];
      if (!card) throw new Error('missing card');
      expect(within(card).getByText(verdictLabels[d.verdict])).toBeInTheDocument();
      expect(
        within(card).getByRole('table', { name: 'Альтернативи та їхній EV' }),
      ).toBeInTheDocument();
    });
    // No raw i18n keys leak into the page.
    expect(section.textContent).not.toMatch(/decision\.\w+\./);
  });

  it('switches to the known-cards view and jumps from a decision to the replayer', async () => {
    const slider = await openReview();
    fireEvent.click(screen.getByLabelText('З відомими картами'));
    expect(screen.getByText(/Довідково/)).toBeInTheDocument();

    const first = entry.analysis?.decisions[0];
    if (!first) throw new Error('no decision');
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Показати в програвачі' })[0] as HTMLElement,
    );
    const expected = frameBeforeEvent(buildTimeline(entry.record), first.eventIndex) + 1;
    expect(slider).toHaveAttribute('aria-valuenow', String(expected));
  });

  it('explains the outcome and charts equity', async () => {
    await openReview();
    expect(screen.getByRole('heading', { name: 'Результат' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Найкращі 5 карт' }).length).toBeGreaterThan(0);
    const chart = screen.getByRole('slider', { name: /Графік equity/ });
    fireEvent.focus(chart);
    expect(chart.getAttribute('aria-valuetext')).toContain('Ви');
    expect(screen.getByRole('link', { name: 'Equity по вулицях' })).toHaveAttribute(
      'href',
      '/glossary#equity',
    );
  });

  it('says when the analysis is still running or the hand does not exist', async () => {
    const pending = toEntry(entry.record, null);
    const { unmount } = renderAt(
      new InMemoryHistoryService([pending]),
      `/history/${entry.record.id}`,
    );
    expect(await screen.findByText(/Аналіз ще виконується/)).toBeInTheDocument();
    unmount();

    renderAt(new InMemoryHistoryService([]), '/history/nope');
    expect(await screen.findByText(/Роздачу не знайдено/)).toBeInTheDocument();
  });
});

describe('HandHistory page', () => {
  let entries: HandEntry[];
  beforeAll(async () => {
    entries = (await playHands(5, 6)).map((r) => toEntry(r));
  });

  it('lists hands with links to their review and filters them', async () => {
    renderAt(new InMemoryHistoryService(entries), '/history');
    expect(
      await screen.findByText(`Показано: ${String(entries.length)} з ${String(entries.length)}`),
    ).toBeInTheDocument();

    const first = entries[0];
    if (!first) throw new Error('no hands');
    expect(
      screen.getByRole('link', {
        name: new RegExp(`Роздача №${String(first.record.handNumber)}\\b`),
      }),
    ).toHaveAttribute('href', `/history/${first.record.id}`);

    const position = first.summary.heroPosition;
    const matching = entries.filter((e) => e.summary.heroPosition === position).length;
    fireEvent.change(screen.getByLabelText('Позиція'), { target: { value: position } });
    expect(
      screen.getByText(`Показано: ${String(matching)} з ${String(entries.length)}`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Експорт у .txt' })).toBeEnabled();
  });

  it('clears the history only after confirmation', async () => {
    const service = new InMemoryHistoryService(entries);
    renderAt(service, '/history');
    fireEvent.click(await screen.findByRole('button', { name: 'Очистити історію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(service.cleared).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Очистити історію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Так, видалити все' }));
    expect(await screen.findByText('Ще немає зіграних роздач.')).toBeInTheDocument();
    expect(service.cleared).toBe(1);
  });
});

describe('Stats page', () => {
  let entries: HandEntry[];
  beforeAll(async () => {
    // A calling station over enough hands to trip the stat-based leak detectors.
    entries = (await playHands(9, 40, 1)).map((r) => toEntry(r));
  }, 60_000);

  it('shows the numbers with glossary links, the winnings chart and leaks linked to hands', async () => {
    renderAt(new InMemoryHistoryService(entries), '/stats');
    expect(await screen.findByRole('link', { name: 'VPIP' })).toHaveAttribute(
      'href',
      '/glossary#vpip',
    );
    expect(
      screen.getByRole('slider', { name: 'Виграш: фактичний і очікуваний' }),
    ).toBeInTheDocument();

    const leaks = screen.getByRole('heading', { name: 'Типові помилки' }).closest('section');
    if (!leaks) throw new Error('no leaks section');
    expect(within(leaks).getByRole('heading', { name: 'Граєте забагато рук' })).toBeInTheDocument();
    const example = within(leaks).getAllByRole('link')[0];
    expect(example?.getAttribute('href')).toMatch(/^\/history\//);
    expect(leaks.textContent).not.toMatch(/\{\{/);
  });

  it('limits the numbers to the current session', async () => {
    renderAt(new InMemoryHistoryService(entries, Number.POSITIVE_INFINITY), '/stats');
    fireEvent.click(await screen.findByLabelText('Ця сесія'));
    expect(screen.getByText('Немає роздач для статистики.')).toBeInTheDocument();
  });
});

describe('Glossary page', () => {
  it('lists every term under its own anchor and focuses the linked one', async () => {
    renderAt(new InMemoryHistoryService([]), '/glossary#vpip');
    expect(screen.getByText('Глосарій')).toBeInTheDocument();
    const term = document.getElementById('vpip');
    expect(term).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(term);
    });
    expect(within(term as HTMLElement).getByText('VPIP')).toBeInTheDocument();
  });
});

describe('History settings', () => {
  it('stores the hand limit and clears the history after confirmation', async () => {
    const service = new InMemoryHistoryService([]);
    renderAt(service, '/settings', <HistorySettings />);
    fireEvent.change(screen.getByLabelText(/Скільки роздач зберігати/), {
      target: { value: '500' },
    });
    expect(service.getMaxHands()).toBe(500);

    fireEvent.click(screen.getByRole('button', { name: 'Очистити історію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Так, видалити все' }));
    expect(await screen.findByText('Історію очищено.')).toBeInTheDocument();
    expect(service.cleared).toBe(1);
  });
});
