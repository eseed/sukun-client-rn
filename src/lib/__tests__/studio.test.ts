import {
  branchColor,
  branchShortName,
  classDuration,
  isRoomQr,
  packageLine,
  studioLinkPath,
  validityText,
  webOrigin,
} from '../studio';
import type { MemberPackageSummary } from '../../api/studio-types';

const ROOM = '0b6f1f1e-1c1a-4c3b-9a55-2f2f6a0f3c11';

describe('studioLinkPath', () => {
  it('sends a room poster to the scanner with the whole link, code included', () => {
    const link = `https://book.sukunwellness.co/checkin/${ROOM}?utm_source=qr&utm_medium=studio_poster#t=abc`;
    expect(studioLinkPath(link)).toBe(`/studio/scan?payload=${encodeURIComponent(link)}`);
  });

  it('opens a shared class and a friend invitation', () => {
    expect(studioLinkPath(`https://clientstaging.sukunwellness.co/classes/sessions/${ROOM}`)).toBe(
      `/classes/sessions/${ROOM}`,
    );
    expect(studioLinkPath('https://book.sukunwellness.co/classes/invites/Abc_123-xyz')).toBe(
      '/classes/invites/Abc_123-xyz',
    );
    expect(studioLinkPath('sukun://classes/invites/Abc_123-xyz')).toBe(
      '/classes/invites/Abc_123-xyz',
    );
    expect(studioLinkPath('sukunclient://classes/invites/Abc_123-xyz')).toBe(
      '/classes/invites/Abc_123-xyz',
    );
  });

  it('leaves everything else alone', () => {
    expect(studioLinkPath('https://book.sukunwellness.co/claim')).toBeNull();
    expect(studioLinkPath(`https://evil.example.com/checkin/${ROOM}`)).toBeNull();
    expect(studioLinkPath('https://book.sukunwellness.co/checkin/not-a-room')).toBeNull();
    expect(studioLinkPath('sukunclient://events/tulua')).toBeNull();
  });
});

describe('isRoomQr', () => {
  it('accepts the poster link and the older bare payload', () => {
    expect(isRoomQr(`https://book.sukunwellness.co/checkin/${ROOM}#t=x`)).toBe(true);
    expect(isRoomQr(`sukun-room:v1:${ROOM}:token`)).toBe(true);
    expect(isRoomQr('https://example.com/menu')).toBe(false);
  });
});

describe('presentation', () => {
  it('names branches and lengths the way the design writes them', () => {
    expect(branchShortName('Sukun Studios East')).toBe('East');
    expect(branchShortName('Zamalek Test Studio')).toBe('Zamalek Test Studio');
    expect(classDuration(60)).toBe('1h');
    expect(classDuration(75)).toBe('1h 15');
    expect(classDuration(45)).toBe('45 min');
    expect(validityText(3, 'month')).toBe('valid 3 months');
    expect(validityText(1, 'day')).toBe('valid 1 day');
  });

  it('falls back to sage for a branch with no colour', () => {
    expect(branchColor('#055270')).toBe('#055270');
    expect(branchColor(null)).toBe('#495C2F');
    expect(branchColor('red')).toBe('#495C2F');
  });

  it('pairs the website with the backend', () => {
    expect(webOrigin('https://staging-api.sukunwellness.co')).toBe(
      'https://clientstaging.sukunwellness.co',
    );
    expect(webOrigin('https://api.sukunwellness.co')).toBe('https://book.sukunwellness.co');
  });

  it('writes a package line', () => {
    const pkg = {
      status: 'active',
      passesTotal: 10,
      passesRemaining: 6,
      expiresOn: '2027-02-14',
    } as MemberPackageSummary;
    expect(packageLine(pkg)).toBe('6 of 10 passes left · expires 14 Feb 2027');
    expect(packageLine({ ...pkg, passesTotal: null, passesRemaining: null })).toBe(
      'Unlimited · expires 14 Feb 2027',
    );
  });
});
