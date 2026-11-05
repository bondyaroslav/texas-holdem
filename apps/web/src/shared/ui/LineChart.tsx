import type { JSX, KeyboardEvent, PointerEvent, RefObject } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export interface LineSeries {
  readonly id: string;
  readonly label: string;
  /** One value per x position; null leaves a gap (e.g. the player had folded). */
  readonly values: readonly (number | null)[];
  /** Categorical slot 1–8 (`--series-N`), fixed per entity so colours never follow rank. */
  readonly slot: number;
  /** Drawn slightly heavier and on top, e.g. the hero. */
  readonly emphasis?: boolean;
  /** Dashed stroke — a second encoding for a reference line that may run on top of another. */
  readonly dashed?: boolean;
}

export interface LineChartProps {
  /** Accessible name of the chart. */
  readonly title: string;
  readonly xLabels: readonly string[];
  readonly xHeader: string;
  readonly series: readonly LineSeries[];
  readonly yDomain: readonly [number, number];
  readonly formatY: (value: number) => string;
  readonly showTableLabel: string;
  readonly height?: number;
}

/** Drawing width before the container has been measured (and in environments without ResizeObserver). */
const DEFAULT_WIDTH = 640;
const MIN_WIDTH = 300;
const PAD = { top: 16, bottom: 30, left: 52 } as const;
const MIN_LABEL_GAP = 14;
/** Rough width of one 12px label character, to reserve room for direct labels on the right. */
const LABEL_CHAR_WIDTH = 7;

/**
 * Small dependency-free SVG line chart following the project's dataviz rules:
 * thin 2px lines with markers, recessive grid, one y axis, legend always
 * present for 2+ series, direct end labels for up to 4, a crosshair tooltip
 * on hover and on keyboard focus (←/→), and the full data as a table.
 */
export function LineChart(props: LineChartProps): JSX.Element {
  const { title, xLabels, xHeader, series, yDomain, formatY, showTableLabel } = props;
  const height = props.height ?? 240;
  const [active, setActive] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const width = useContainerWidth(frame);

  // Direct labels only for lines that reach the last x: a label stranded mid-chart
  // (a player who folded early) would sit on top of the other lines. The legend names them all.
  const lastX = xLabels.length - 1;
  const labelled =
    series.length <= 4 ? series.filter((s) => lastValueIndex(s.values) === lastX) : [];
  const padRight =
    labelled.length > 0
      ? Math.min(220, 16 + Math.max(...labelled.map((s) => s.label.length)) * LABEL_CHAR_WIDTH)
      : 24;
  // Where lines overlap, a dashed reference line goes on top (its gaps show the line below),
  // then emphasised lines above the rest.
  const layer = (s: LineSeries): number => (s.dashed ? 2 : s.emphasis ? 1 : 0);
  const painted = [...series].sort((a, b) => layer(a) - layer(b));

  const plotW = width - PAD.left - padRight;
  const plotH = height - PAD.top - PAD.bottom;
  const { min: yMin, max: yMax, step: yStep } = niceScale(yDomain[0], yDomain[1]);
  const span = yMax - yMin || 1;
  const x = (i: number): number =>
    PAD.left + (xLabels.length <= 1 ? plotW / 2 : (i / (xLabels.length - 1)) * plotW);
  const y = (v: number): number => PAD.top + (1 - (v - yMin) / span) * plotH;
  const ticks = Array.from({ length: Math.round(span / yStep) + 1 }, (_, i) => yMin + yStep * i);

  const pathOf = (s: LineSeries): string => {
    let d = '';
    let open = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };

  // Direct labels at the last point, nudged apart so they never collide.
  const directLabels = labelled
    .map((s) => {
      const value = s.values[lastX];
      return value === null || value === undefined
        ? null
        : { id: s.id, label: s.label, ly: y(value), lx: x(lastX) };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.ly - b.ly)
    .reduce<{ id: string; label: string; ly: number; lx: number }[]>((placed, l) => {
      const prev = placed.at(-1);
      placed.push(
        prev && l.ly - prev.ly < MIN_LABEL_GAP ? { ...l, ly: prev.ly + MIN_LABEL_GAP } : l,
      );
      return placed;
    }, []);

  const pickIndex = (event: PointerEvent<SVGRectElement>): void => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect || xLabels.length === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    xLabels.forEach((_, i) => {
      if (Math.abs(x(i) - svgX) < Math.abs(x(best) - svgX)) best = i;
    });
    setActive(best);
  };

  const describe = (index: number): string =>
    [
      xLabels[index] ?? '',
      ...series.map((s) => {
        const v = s.values[index];
        return `${s.label} ${v === null || v === undefined ? '—' : formatY(v)}`;
      }),
    ].join(', ');

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = xLabels.length - 1;
    const moves: Record<string, ((current: number) => number) | undefined> = {
      ArrowRight: (c) => c + 1,
      ArrowUp: (c) => c + 1,
      ArrowLeft: (c) => c - 1,
      ArrowDown: (c) => c - 1,
      Home: () => 0,
      End: () => last,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setActive((current) => Math.min(last, Math.max(0, move(current ?? last))));
  };

  return (
    <figure className="flex flex-col gap-3">
      <div
        ref={frame}
        className="chart-frame relative"
        tabIndex={0}
        // A crosshair stepping along the x axis is exactly a slider: ←/→ move it, the value text reads it out.
        role="slider"
        aria-label={title}
        aria-valuemin={1}
        aria-valuemax={Math.max(xLabels.length, 1)}
        aria-valuenow={(active ?? xLabels.length - 1) + 1}
        aria-valuetext={describe(active ?? xLabels.length - 1)}
        aria-describedby={active === null ? undefined : tooltipId}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setActive((current) => current ?? xLabels.length - 1);
        }}
        onBlur={() => {
          setActive(null);
        }}
      >
        <svg
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          className="w-full"
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - padRight}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {formatY(tick)}
              </text>
            </g>
          ))}
          {xLabels.map((label, i) => (
            <text
              key={label}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {label}
            </text>
          ))}
          {active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--color-muted)"
              strokeWidth={1}
            />
          ) : null}
          {painted.map((s) => (
            <g key={s.id} style={{ color: `var(--series-${String(s.slot)})` }}>
              <path
                d={pathOf(s)}
                fill="none"
                stroke="currentColor"
                strokeWidth={s.emphasis ? 3 : 2}
                strokeDasharray={s.dashed ? '6 5' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle
                    key={xLabels[i] ?? i}
                    cx={x(i)}
                    cy={y(v)}
                    r={active === i ? 5.5 : 4}
                    fill="currentColor"
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          ))}
          {directLabels.map((l) => (
            <text
              key={l.id}
              x={l.lx + 10}
              y={l.ly}
              dy="0.32em"
              fontSize={12}
              fill="var(--color-fg)"
            >
              {l.label}
            </text>
          ))}
          <rect
            x={PAD.left - 12}
            y={PAD.top}
            width={plotW + 24}
            height={plotH}
            fill="transparent"
            onPointerMove={pickIndex}
            onPointerLeave={() => {
              setActive(null);
            }}
          />
        </svg>

        {active !== null ? (
          <div
            id={tooltipId}
            role="status"
            className="chart-tooltip"
            style={{
              left: `${String((x(active) / width) * 100)}%`,
              transform:
                x(active) > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <p className="mb-1 font-bold" style={{ color: 'var(--color-muted)' }}>
              {xLabels[active]}
            </p>
            <ul className="flex flex-col gap-0.5">
              {series.map((s) => {
                const v = s.values[active];
                return (
                  <li key={s.id} className="flex items-center gap-2">
                    <LineKey slot={s.slot} dashed={s.dashed ?? false} />
                    <strong className="tabular-nums">
                      {v === null || v === undefined ? '—' : formatY(v)}
                    </strong>
                    <span style={{ color: 'var(--color-muted)' }}>{s.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {series.length >= 2 ? (
        <figcaption>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {series.map((s) => (
              <li key={s.id} className={`flex items-center gap-2 ${s.emphasis ? 'font-bold' : ''}`}>
                <LineKey slot={s.slot} dashed={s.dashed ?? false} />
                {s.label}
              </li>
            ))}
          </ul>
        </figcaption>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer" style={{ color: 'var(--color-muted)' }}>
          {showTableLabel}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3">
                  {xHeader}
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="py-1 pr-3">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xLabels.map((label, i) => (
                <tr key={label}>
                  <th scope="row" className="py-1 pr-3 font-semibold">
                    {label}
                  </th>
                  {series.map((s) => {
                    const v = s.values[i];
                    return (
                      <td key={s.id} className="py-1 pr-3">
                        {v === null || v === undefined ? '—' : formatY(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Draws in the container's own pixel width, so axis text stays at its real
 * size on a phone instead of shrinking with a scaled-down drawing.
 */
function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/** A y range widened to round numbers with a 1/2/2.5/5 × 10ⁿ step — about four gridlines. */
function niceScale(min: number, max: number): { min: number; max: number; step: number } {
  const raw = (max - min || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function lastValueIndex(values: readonly (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) return i;
  }
  return -1;
}

function LineKey({
  slot,
  dashed,
}: {
  readonly slot: number;
  readonly dashed: boolean;
}): JSX.Element {
  return (
    <svg
      width="16"
      height="8"
      aria-hidden="true"
      style={{ color: `var(--series-${String(slot)})` }}
    >
      <line
        x1="1"
        x2="15"
        y1="4"
        y2="4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  );
}
