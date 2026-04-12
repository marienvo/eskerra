import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {DesktopHorizontalSplit} from './DesktopHorizontalSplit';

describe('DesktopHorizontalSplit', () => {
  it('omits the resize separator when leftCollapsed', () => {
    render(
      <DesktopHorizontalSplit
        leftCollapsed
        leftWidthPx={280}
        minLeftPx={20}
        maxLeftPx={520}
        onLeftWidthPxChanged={vi.fn()}
        left={null}
        right={<div>editor</div>}
      />,
    );

    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('renders the resize separator when the left column is visible', () => {
    render(
      <DesktopHorizontalSplit
        leftWidthPx={280}
        minLeftPx={20}
        maxLeftPx={520}
        onLeftWidthPxChanged={vi.fn()}
        left={<div>left</div>}
        right={<div>editor</div>}
      />,
    );

    expect(screen.getByRole('separator')).toBeInstanceOf(HTMLElement);
  });
});
