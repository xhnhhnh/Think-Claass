/**
 * 荣誉奖状 - the 累计颁发 total.
 *
 * The stat used `certificates.length`, so a failed (or still-pending) read printed 0 - a section
 * heading claiming the class has never been awarded anything. It must read as unknown instead.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherCertificates from '@/features/engagement/pages/TeacherCertificatesPage';

const mocks = vi.hoisted(() => ({
  getStudents: vi.fn(),
  getCertificates: vi.fn(),
  issueCertificate: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 7, role: 'teacher' } }),
}));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getStudents: mocks.getStudents },
}));

vi.mock('@/features/engagement/api/certificatesApi', () => ({
  certificatesApi: {
    getCertificates: mocks.getCertificates,
    issueCertificate: mocks.issueCertificate,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('TeacherCertificates total', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStudents.mockResolvedValue({ success: true, students: [] });
    mocks.getCertificates.mockResolvedValue({ success: true, certificates: [] });
  });

  it('renders the total as unknown when the award read failed', async () => {
    mocks.getCertificates.mockRejectedValue(new Error('boom'));

    render(<TeacherCertificates />);

    expect(await screen.findByText('奖状数据加载失败')).toBeInTheDocument();
    // The stat card is the second "—"? There is exactly one on this page while failed.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the real total once the read succeeds', async () => {
    mocks.getCertificates.mockResolvedValue({
      success: true,
      certificates: [
        { id: 1, student_id: 10, student_name: '小明', title: '阅读之星', description: '', created_at: '2026-05-01' },
        { id: 2, student_id: 11, student_name: '小红', title: '进步标兵', description: '', created_at: '2026-05-01' },
      ],
    });

    render(<TeacherCertificates />);

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });
});
