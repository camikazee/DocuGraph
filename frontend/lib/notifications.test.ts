import { verbFor, timeAgo } from './notifications';

describe('verbFor', () => {
  it.each([
    ['moved', 'moved'],
    ['comment', 'commented on'],
    ['mention', 'mentioned you in'],
    ['deleted', 'deleted'],
    ['review', 'reviewed'],
  ])('maps %s → %s', (kind, verb) => {
    expect(verbFor(kind)).toBe(verb);
  });

  it('falls back to "updated" for unknown kinds', () => {
    expect(verbFor('changed')).toBe('updated');
    expect(verbFor('whatever')).toBe('updated');
  });
});

describe('timeAgo', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('shows "just now" under a minute', () => {
    expect(timeAgo(ago(5_000))).toBe('just now');
  });
  it('shows minutes', () => {
    expect(timeAgo(ago(5 * 60_000))).toBe('5m ago');
  });
  it('shows hours', () => {
    expect(timeAgo(ago(3 * 3_600_000))).toBe('3h ago');
  });
  it('shows days', () => {
    expect(timeAgo(ago(2 * 86_400_000))).toBe('2d ago');
  });
});
