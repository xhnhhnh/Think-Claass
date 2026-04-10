import { describe, it, expect, vi } from 'vitest';
import { authApi } from '../auth';

describe('authApi', () => {
  it('should login successfully with correct credentials', async () => {
    const data = await authApi.login({ username: 'admin', password: '123456' }) as any;
    expect(data.success).toBe(true);
    expect(data.user.username).toBe('admin');
  });

  it('should throw FetchError with wrong credentials', async () => {
    try {
      await authApi.login({ username: 'admin', password: 'wrong' });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.response.status).toBe(401);
      expect(error.response.data.success).toBe(false);
    }
  });

  it('should register successfully', async () => {
    const data = await authApi.register({ username: 'newuser', password: '123' }) as any;
    expect(data.success).toBe(true);
  });
});
