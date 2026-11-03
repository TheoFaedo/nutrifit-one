import { safeReturnUrl } from './auth-return.service';

describe('safeReturnUrl', () => {
  it('preserves an OAuth consent request through sign-in and onboarding', () => {
    expect(safeReturnUrl('/oauth/consent?authorization_id=abc_123')).toBe(
      '/oauth/consent?authorization_id=abc_123',
    );
  });

  it('allows only known internal destinations', () => {
    expect(safeReturnUrl('/profile')).toBe('/profile');
    expect(safeReturnUrl('https://attacker.example')).toBe('/journal');
    expect(safeReturnUrl('//attacker.example')).toBe('/journal');
    expect(safeReturnUrl('/oauth/consent?authorization_id=a&next=https://attacker.example')).toBe(
      '/oauth/consent?authorization_id=a',
    );
  });

  it('rejects missing, malformed and expired consent destinations', () => {
    expect(safeReturnUrl(null)).toBe('/journal');
    expect(safeReturnUrl('/oauth/consent')).toBe('/journal');
    expect(safeReturnUrl('/oauth/consent?authorization_id=bad%20id')).toBe('/journal');
    expect(safeReturnUrl('/oauth/consent?authorization_id=a#fragment')).toBe('/journal');
  });
});
