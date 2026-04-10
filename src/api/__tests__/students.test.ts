import { describe, it, expect } from 'vitest';
import { studentsApi } from '../students';

describe('studentsApi', () => {
  it('should fetch students for a given classId', async () => {
    const data = await studentsApi.getStudents(1) as any;
    expect(data.success).toBe(true);
    expect(data.students).toHaveLength(1);
    expect(data.students[0].name).toBe('Student A');
  });

  it('should return empty list for unknown classId', async () => {
    const data = await studentsApi.getStudents(999) as any;
    expect(data.success).toBe(true);
    expect(data.students).toHaveLength(0);
  });

  it('should update points for a student', async () => {
    const data = await studentsApi.updatePoints(1, { amount: 10, reason: 'Good job' }) as any;
    expect(data.success).toBe(true);
    expect(data.message).toBe('Added 10 points to student 1');
  });
});
