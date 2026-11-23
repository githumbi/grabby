import { describe, it, expect } from 'vitest';
import { parseCommentPayload, toStoredShape } from '../validate';
import { incoming } from './fixtures';

const member = (selector: string) => ({
  kind: 'action', tag: 'BUTTON', component: 'Actions', source: { file: 'src/Actions.tsx', line: 12, column: 3 },
  selector, preview: '<button>Approve</button>', label: 'Button "Approve"',
});

describe('multi-element and area comments', () => {
  it('keeps the elements of a group comment', () => {
    const parsed = parseCommentPayload({ comment: incoming({ members: [member('#approve'), member('#reject')] }) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const stored = toStoredShape(parsed.comment);
    expect(stored.members?.map((m) => [m.selector, m.tag, m.label])).toEqual([['#approve', 'button', 'Button "Approve"'], ['#reject', 'button', 'Button "Approve"']]);
    expect(stored.area).toBeUndefined();
  });

  it('keeps an area as fractions', () => {
    const parsed = parseCommentPayload({ comment: incoming({ area: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } }) });
    expect(parsed.ok && toStoredShape(parsed.comment).area).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 });
  });

  it('rejects too many elements and areas outside the element', () => {
    expect(parseCommentPayload({ comment: incoming({ members: Array.from({ length: 21 }, (_, i) => member(`#b${i}`)) }) }).ok).toBe(false);
    expect(parseCommentPayload({ comment: incoming({ area: { x: 0, y: 0, w: 2, h: 1 } }) }).ok).toBe(false);
  });

  it('stores an ordinary comment without them', () => {
    const parsed = parseCommentPayload({ comment: incoming() });
    expect(parsed.ok && 'members' in toStoredShape(parsed.comment)).toBe(false);
  });
});
