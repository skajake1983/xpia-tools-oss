import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MultiSelect from './MultiSelect';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('MultiSelect', () => {
  it('shows "None selected" when nothing is selected', () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />);
    expect(screen.getByText('None selected')).toBeInTheDocument();
  });

  it('shows "All (N)" when every option is selected', () => {
    render(<MultiSelect options={OPTIONS} selected={['a', 'b', 'c']} onChange={() => {}} />);
    expect(screen.getByText('All (3)')).toBeInTheDocument();
  });

  it('shows single label when one item is selected', () => {
    render(<MultiSelect options={OPTIONS} selected={['b']} onChange={() => {}} />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows "N selected" for partial selection', () => {
    render(<MultiSelect options={OPTIONS} selected={['a', 'c']} onChange={() => {}} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('uses custom allLabel with count when all selected', () => {
    render(<MultiSelect options={OPTIONS} selected={['a', 'b', 'c']} onChange={() => {}} allLabel="Everything" />);
    expect(screen.getByText('Everything (3)')).toBeInTheDocument();
  });

  it('keeps all values when selecting the last remaining item', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={['a', 'b']} onChange={onChange} />);
    // Open dropdown
    fireEvent.click(screen.getByText('2 selected'));
    // Click Gamma to select all 3
    fireEvent.click(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('calls onChange with item removed when deselecting', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={['a', 'b']} onChange={onChange} />);
    fireEvent.click(screen.getByText('2 selected'));
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('selects all when "All" button is clicked from partial selection', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={['a']} onChange={onChange} />);
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('All (3)'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('clears all when "All" button is clicked from full selection', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={['a', 'b', 'c']} onChange={onChange} />);
    // Open dropdown by clicking the trigger button
    fireEvent.click(screen.getByText('All (3)'));
    // Click the "All" row inside the dropdown to toggle off
    const allRows = screen.getAllByText('All (3)');
    fireEvent.click(allRows[allRows.length - 1]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('hides "All" button when hideAll is true', () => {
    render(<MultiSelect options={OPTIONS} selected={['a']} onChange={() => {}} hideAll />);
    fireEvent.click(screen.getByText('Alpha'));
    expect(screen.queryByText('All (3)')).not.toBeInTheDocument();
  });
});
