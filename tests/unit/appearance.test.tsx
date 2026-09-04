import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppearanceChoice } from '../../src/renderer/components/appearance-choice';
import { installTheme, readTheme, resolveTheme } from '../../src/renderer/components/theme';

const prefersDark = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  prefersDark(true);
});
afterEach(cleanup);

describe('appearance', () => {
  it('starts black, because the room is the bright thing on the screen', () => {
    render(<AppearanceChoice />);
    expect(document.documentElement).not.toHaveClass('theme-light');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('switches to paper and back', () => {
    render(<AppearanceChoice />);

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveClass('theme-light');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).not.toHaveClass('theme-light');
  });

  it('follows the machine when asked to', () => {
    prefersDark(false);
    render(<AppearanceChoice />);

    fireEvent.click(screen.getByRole('radio', { name: 'Automatic' }));

    expect(readTheme()).toBe('system');
    expect(resolveTheme('system')).toBe('light');
    expect(document.documentElement).toHaveClass('theme-light');
  });

  it('remembers the choice for the next launch', () => {
    render(<AppearanceChoice />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    cleanup();

    document.documentElement.className = '';
    installTheme();

    expect(document.documentElement).toHaveClass('theme-light');
  });
});
