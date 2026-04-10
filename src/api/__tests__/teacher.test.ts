import { describe, it, expect } from 'vitest';
import { teacherApi } from '../teacher';

describe('teacherApi', () => {
  it('should fetch classes', async () => {
    const data = await teacherApi.getClasses() as any;
    expect(data.success).toBe(true);
    expect(data.classes).toHaveLength(1);
    expect(data.classes[0].name).toBe('Class 1');
  });
});
