import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {DesktopVerticalSplit} from './DesktopVerticalSplit';

describe('DesktopVerticalSplit', () => {
  it('omits the resize separator and bottom when bottomCollapsed', () => {
    render(
      <DesktopVerticalSplit
        bottomCollapsed
        topHeightPx={280}
        minTopPx={20}
        maxTopPx={10_000}
        onTopHeightPxChanged={vi.fn()}
        top={<div>editor</div>}
        bottom={<div>inbox</div>}
      />,
    );

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByText('inbox')).toBeNull();
    expect(screen.getByText('editor')).toBeInstanceOf(HTMLElement);
  });

  it('omits the resize separator and top when topCollapsed', () => {
    render(
      <DesktopVerticalSplit
        topCollapsed
        topHeightPx={280}
        minTopPx={20}
        maxTopPx={10_000}
        onTopHeightPxChanged={vi.fn()}
        top={<div>notifications</div>}
        bottom={<div>inbox</div>}
      />,
    );

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByText('notifications')).toBeNull();
    expect(screen.getByText('inbox')).toBeInstanceOf(HTMLElement);
  });

  it('renders the resize separator when the bottom pane is visible', () => {
    render(
      <DesktopVerticalSplit
        topHeightPx={280}
        minTopPx={20}
        maxTopPx={10_000}
        onTopHeightPxChanged={vi.fn()}
        top={<div>editor</div>}
        bottom={<div>inbox</div>}
      />,
    );

    expect(screen.getByRole('separator')).toBeInstanceOf(HTMLElement);
    expect(screen.getByText('inbox')).toBeInstanceOf(HTMLElement);
  });
});
