import { levelLabel } from './access';

describe('levelLabel', () => {
  it('maps access levels to human labels', () => {
    expect(levelLabel('none')).toBe('Hidden');
    expect(levelLabel('read')).toBe('Read');
    expect(levelLabel('write')).toBe('Write');
  });
});
