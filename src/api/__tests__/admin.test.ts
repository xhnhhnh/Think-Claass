import { describe, it, expect } from 'vitest';
import { adminApi } from '../admin';

describe('adminApi', () => {
  it('should fetch stats', async () => {
    const data = await adminApi.getStats() as any;
    expect(data.success).toBe(true);
    expect(data.data.server.cpuUsage).toBe(10);
    expect(data.data.database.totalUsers).toBe(10);
  });

  it('should reset database with the real contract', async () => {
    const data = await adminApi.resetDatabase() as any;
    expect(data.success).toBe(true);
    expect(data.message).toBe('所有数据已重置，并已恢复超级管理员账户');
  });
});
