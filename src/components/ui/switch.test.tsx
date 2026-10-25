import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  it('is announced as a switch and reports its state', () => {
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={() => {}} aria-label="聊天气泡" />,
    );

    const control = screen.getByRole('switch', { name: '聊天气泡' });
    expect(control.getAttribute('aria-checked')).toBe('false');

    rerender(<Switch checked onCheckedChange={() => {}} aria-label="聊天气泡" />);
    expect(screen.getByRole('switch', { name: '聊天气泡' }).getAttribute('aria-checked')).toBe('true');
  });

  it('hands the caller the next value and respects disabled', () => {
    const onCheckedChange = vi.fn();
    render(
      <>
        <Switch checked={false} onCheckedChange={onCheckedChange} aria-label="开启" />
        <Switch checked={false} onCheckedChange={onCheckedChange} aria-label="停用" disabled />
      </>,
    );

    fireEvent.click(screen.getByRole('switch', { name: '开启' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    onCheckedChange.mockClear();
    fireEvent.click(screen.getByRole('switch', { name: '停用' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
