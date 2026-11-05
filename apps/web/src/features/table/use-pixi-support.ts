/**
 * Pixi is used only when WebGL works, the user doesn't prefer reduced motion
 * and we're not under Vitest (jsdom has no canvas) — otherwise the DOM view
 * renders (CLAUDE.md §3.5).
 */
export function canUsePixi(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
