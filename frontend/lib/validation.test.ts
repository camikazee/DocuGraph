import { required, isEmail, minLength, firstError } from './validation';

describe('validation', () => {
  describe('required', () => {
    it('rejects empty and whitespace-only', () => {
      expect(required('')).toBeTruthy();
      expect(required('   ')).toBeTruthy();
    });
    it('accepts non-empty', () => {
      expect(required('x')).toBeNull();
    });
  });

  describe('isEmail', () => {
    it.each(['a@b.co', 'ada.lovelace@example.com'])('accepts %s', (v) => {
      expect(isEmail(v)).toBeNull();
    });
    it.each(['', 'nope', 'a@b', 'a@b.', '@b.co', 'a b@c.co'])(
      'rejects %s',
      (v) => {
        expect(isEmail(v)).toBeTruthy();
      },
    );
    it('trims before validating', () => {
      expect(isEmail('  a@b.co  ')).toBeNull();
    });
  });

  describe('minLength', () => {
    it('enforces the minimum', () => {
      const v = minLength(8);
      expect(v('short')).toBeTruthy();
      expect(v('longenough')).toBeNull();
      expect(v('12345678')).toBeNull();
    });
  });

  describe('firstError', () => {
    it('returns the first failing validator message', () => {
      expect(firstError('', [required, isEmail])).toBe(required(''));
    });
    it('returns null when all pass', () => {
      expect(firstError('a@b.co', [required, isEmail])).toBeNull();
    });
    it('short-circuits (email not evaluated when required fails)', () => {
      // required fails first → message is the required one, not the email one
      expect(firstError('   ', [required, isEmail])).toBe('This field is required');
    });
  });
});
