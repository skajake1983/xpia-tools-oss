import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpTip from './HelpTip';

describe('HelpTip', () => {
  it('renders the tooltip text', () => {
    render(<HelpTip text="Test tooltip content" />);
    expect(screen.getByText('Test tooltip content')).toBeInTheDocument();
  });

  it('renders multi-line text with newlines preserved', () => {
    render(<HelpTip text={'Line one\n\nLine two'} />);
    const el = screen.getByText(/Line one/);
    expect(el).toHaveClass('whitespace-pre-line');
  });

  it('renders the help circle icon', () => {
    const { container } = render(<HelpTip text="Hover me" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('flips tooltip below when near the top of the viewport', () => {
    const { container } = render(<HelpTip text="Flip me" />);
    const wrapper = container.querySelector('span.group')!;
    const tooltip = screen.getByText('Flip me');
    // Mock wrapper near top of viewport
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      top: 20, left: 200, right: 214, bottom: 34, width: 14, height: 14, x: 200, y: 20, toJSON: () => {},
    });
    // Mock tooltip height (tall Security Framework tooltip)
    vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 224, bottom: 180, width: 224, height: 180, x: 0, y: 0, toJSON: () => {},
    });
    fireEvent.mouseEnter(wrapper);
    expect(tooltip.className).toContain('top-full');
    expect(tooltip.className).not.toContain('bottom-full');
  });
});
