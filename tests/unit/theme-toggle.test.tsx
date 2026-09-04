import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installTheme, ThemeToggle } from '../../src/renderer/components/theme-toggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
});
afterEach(cleanup);

describe('theme', () => {
  it('starts black, because the room is the bright thing on the screen', () => {
    render(<ThemeToggle />);
    expect(document.documentElement).not.toHaveClass('theme-light');
    expect(screen.getByRole('button', { name: 'Switch to the light theme' })).toBeInTheDocument();
  });

  it('switches to paper and back', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    expect(document.documentElement).toHaveClass('theme-light');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to the dark theme' }));
    expect(document.documentElement).not.toHaveClass('theme-light');
  });

  it('remembers the choice for the next launch', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the light theme' }));
    cleanup();

    document.documentElement.className = '';
    installTheme();

    expect(document.documentElement).toHaveClass('theme-light');
  });
});
