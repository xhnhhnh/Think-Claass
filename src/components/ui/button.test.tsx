import { createRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('forwards refs to the underlying button element', () => {
    const ref = createRef<HTMLElement>();

    render(<Button ref={ref}>Save</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
