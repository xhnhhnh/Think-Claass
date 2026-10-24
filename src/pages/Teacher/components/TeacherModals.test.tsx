/**
 * Teacher dashboard modal forms keep what was typed when the write fails.
 *
 * All three used to clear their field inside `handleSubmit`, while the parent closes the dialog
 * only on success: a failed create class / create group / send praise left the dialog open with an
 * empty form, so the teacher retyped it. The field may only be cleared when the dialog closes.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateClassModal } from '@/pages/Teacher/components/CreateClassModal';
import { CreateGroupModal } from '@/pages/Teacher/components/CreateGroupModal';
import { PraiseModal } from '@/pages/Teacher/components/PraiseModal';

describe('dashboard create/praise modals', () => {
  it('keeps a failed 新建班级 name until the dialog actually closes', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const props = { onClose, onSubmit, submitting: false };

    const { rerender } = render(<CreateClassModal isOpen {...props} />);
    fireEvent.change(screen.getByLabelText('班级名称'), { target: { value: '三年二班' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(onSubmit).toHaveBeenCalledWith('三年二班');
    // The request failed, so the parent keeps the dialog open: the typed name must still be there.
    expect(screen.getByLabelText('班级名称')).toHaveValue('三年二班');

    // Parent closes on success; reopening starts blank.
    rerender(<CreateClassModal isOpen={false} {...props} />);
    rerender(<CreateClassModal isOpen {...props} />);
    expect(screen.getByLabelText('班级名称')).toHaveValue('');
  });

  it('keeps a failed 新建小组 name until the dialog actually closes', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const props = { onClose, onSubmit, submitting: false };

    const { rerender } = render(<CreateGroupModal isOpen {...props} />);
    fireEvent.change(screen.getByLabelText('小组名称'), { target: { value: '第一小队' } });
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(onSubmit).toHaveBeenCalledWith('第一小队');
    expect(screen.getByLabelText('小组名称')).toHaveValue('第一小队');

    rerender(<CreateGroupModal isOpen={false} {...props} />);
    rerender(<CreateGroupModal isOpen {...props} />);
    expect(screen.getByLabelText('小组名称')).toHaveValue('');
  });

  it('keeps the written praise (and colour) when sending fails, then clears on close', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const props = { onClose, onSubmit, submitting: false };

    const { rerender } = render(<PraiseModal isOpen {...props} />);
    fireEvent.change(screen.getByLabelText('表扬内容'), { target: { value: '主动帮同学讲题' } });
    fireEvent.click(screen.getByRole('button', { name: '发送表扬信' }));

    expect(onSubmit).toHaveBeenCalledWith('主动帮同学讲题', 'bg-yellow-100');
    expect(screen.getByLabelText('表扬内容')).toHaveValue('主动帮同学讲题');

    rerender(<PraiseModal isOpen={false} {...props} />);
    rerender(<PraiseModal isOpen {...props} />);
    expect(screen.getByLabelText('表扬内容')).toHaveValue('');
  });
});
