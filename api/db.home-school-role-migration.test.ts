import { describe, expect, it, vi } from 'vitest';

import { migrateLegacyHomeSchoolSenderRoles } from './db';

describe('home-school sender role migration', () => {
  it('keeps explicit teacher and parent sender roles intact', () => {
    const connection = { exec: vi.fn() };

    migrateLegacyHomeSchoolSenderRoles(connection);

    expect(connection.exec).toHaveBeenCalledWith(expect.stringContaining("sender_role = 'student'"));
    expect(connection.exec).toHaveBeenCalledWith(expect.not.stringContaining("WHERE type = 'HOME_SCHOOL';"));
  });
});
