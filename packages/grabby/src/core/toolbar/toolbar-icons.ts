// All icons are 16x16, stroke-based with currentColor for theme compatibility
import { paths, type IconSpec } from '../ui/dom';

export const ICON_GRAB: IconSpec = {
  shapes: paths(
    'M5.5 7V3.5a1 1 0 0 1 2 0V7',
    'M7.5 6.5V2.5a1 1 0 0 1 2 0v4',
    'M9.5 7V3.5a1 1 0 0 1 2 0V8',
    'M5.5 7V5.5a1 1 0 0 0-2 0V9a4 4 0 0 0 4 4h1.5a4 4 0 0 0 4-4V6a1 1 0 0 0-2 0',
  ),
};

export const ICON_HISTORY: IconSpec = {
  shapes: [{ tag: 'circle', attrs: { cx: '8', cy: '8', r: '6' } }, ...paths('M8 4.5V8l2.5 1.5')],
};

export const ICON_POWER: IconSpec = {
  shapes: paths('M8 2v5', 'M4.5 4a5.5 5.5 0 1 0 7 0'),
};

export const ICON_DISMISS: IconSpec = {
  shapes: paths('M4 4l8 8M12 4l-8 8'),
};

export const ICON_CHECK_CIRCLE: IconSpec = {
  fill: 'none',
  shapes: [
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '7', fill: '#22c55e' } },
    { tag: 'path', attrs: { d: 'M5 8l2 2 4-4', stroke: '#fff', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ],
};

export const ICON_CHECK_SMALL: IconSpec = {
  viewBox: '0 0 10 10',
  size: 10,
  fill: 'none',
  shapes: [
    { tag: 'path', attrs: { d: 'M2 5.5l2 2 4-4', stroke: '#fff', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
  ],
};
