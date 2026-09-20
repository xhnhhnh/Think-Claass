import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormField } from './form-field';
import { Select } from './select';
import { Skeleton, SkeletonList } from './skeleton';
import { Spinner } from './spinner';
import { Textarea } from './textarea';

/**
 * The kit primitives, in one file because they carry no logic of their own: what
 * matters is that they render the element the pages expect, keep the label
 * association the page tests rely on (`getByLabelText`), and forward the props they
 * claim to forward.
 */

describe('Textarea', () => {
  it('renders a textarea with the value and rows it is given', () => {
    render(<Textarea aria-label="描述" rows={5} defaultValue="内容" />);

    const field = screen.getByLabelText('描述') as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.value).toBe('内容');
    expect(field.rows).toBe(5);
  });

  it('reports typing through onChange', () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="描述" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '新内容' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Select', () => {
  it('renders a native select with its options', () => {
    render(
      <Select aria-label="班级" defaultValue="b">
        <option value="a">一班</option>
        <option value="b">二班</option>
      </Select>,
    );

    const control = screen.getByLabelText('班级') as HTMLSelectElement;
    expect(control.tagName).toBe('SELECT');
    expect(control.value).toBe('b');
    expect(screen.getByRole('option', { name: '一班' })).toBeInTheDocument();
  });

  it('reports a choice through onChange with a string value', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="班级" onChange={onChange}>
        <option value="a">一班</option>
        <option value="b">二班</option>
      </Select>,
    );

    fireEvent.change(screen.getByLabelText('班级'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks itself invalid when asked', () => {
    render(
      <Select aria-label="班级" aria-invalid>
        <option value="a">一班</option>
      </Select>,
    );

    expect(screen.getByLabelText('班级')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Spinner', () => {
  it('announces itself instead of being a silent animation', () => {
    render(<Spinner label="正在保存" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('正在保存');
  });
});

describe('Skeleton', () => {
  it('renders one bar per requested row and stays out of the accessibility tree', () => {
    const { container } = render(<SkeletonList count={4} />);

    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(4);
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a single bar with the classes it is given', () => {
    const { container } = render(<Skeleton className="h-6" />);
    expect(container.querySelector('[data-slot="skeleton"]')).toHaveClass('h-6');
  });
});

describe('FormField', () => {
  it('associates its label with the control it wraps', () => {
    render(
      <FormField label="股票名称">
        <input defaultValue="" />
      </FormField>,
    );

    // The three page tests this kit must keep green reach their controls exactly
    // this way.
    expect(screen.getByLabelText('股票名称')).toBeInTheDocument();
  });

  it('keeps the required marker out of the label text', () => {
    render(
      <FormField label="股票名称" required>
        <input defaultValue="" />
      </FormField>,
    );

    // The marker is a CSS pseudo-element, so the accessible name is still the label
    // verbatim - a literal "*" would turn `getByLabelText('股票名称')` into a miss.
    expect(screen.getByLabelText('股票名称')).toBeInTheDocument();
  });

  it('shows the hint until there is an error, then the error instead', () => {
    const { rerender } = render(
      <FormField label="价格" hint="单位：积分">
        <input defaultValue="" />
      </FormField>,
    );
    expect(screen.getByText('单位：积分')).toBeInTheDocument();

    rerender(
      <FormField label="价格" hint="单位：积分" error="价格必须大于 0">
        <input defaultValue="" />
      </FormField>,
    );
    expect(screen.queryByText('单位：积分')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('价格必须大于 0');
  });
});
