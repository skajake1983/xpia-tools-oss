import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GeneratingOverlay from './GeneratingOverlay';

describe('GeneratingOverlay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders nothing when not active', () => {
    const { container } = render(<GeneratingOverlay active={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows spinner and label when active', () => {
    render(<GeneratingOverlay active={true} label="document" />);
    expect(screen.getByText('Generating document…')).toBeInTheDocument();
  });

  it('shows elapsed seconds timer', () => {
    render(<GeneratingOverlay active={true} />);
    expect(screen.getByText(/0s/)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/5s/)).toBeInTheDocument();
  });

  it('shows minutes format after 60s', () => {
    render(<GeneratingOverlay active={true} />);
    act(() => { vi.advanceTimersByTime(65_000); });
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it('resets timer when active toggles off then on', () => {
    const { rerender } = render(<GeneratingOverlay active={true} />);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/10s/)).toBeInTheDocument();

    rerender(<GeneratingOverlay active={false} />);
    rerender(<GeneratingOverlay active={true} />);
    expect(screen.getByText(/0s/)).toBeInTheDocument();
  });

  it('uses default label when none provided', () => {
    render(<GeneratingOverlay active={true} />);
    expect(screen.getByText('Generating content…')).toBeInTheDocument();
  });
});
