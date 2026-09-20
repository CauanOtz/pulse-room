import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SignalBars } from '../../src/renderer/components/signal-bars';
import { TooltipProvider } from '../../src/renderer/components/ui/tooltip';

afterEach(cleanup);

const show = (props: Parameters<typeof SignalBars>[0]) =>
  render(
    <TooltipProvider>
      <SignalBars {...props} />
    </TooltipProvider>,
  );

describe('SignalBars', () => {
  it('says nothing about a line that is behaving', () => {
    show({ signal: 'excellent' });
    show({ signal: 'good' });
    expect(screen.queryByLabelText(/Connection/)).toBeNull();
  });

  it('draws nothing at all before the server has an opinion', () => {
    show({});
    show({ signal: 'unknown' });
    expect(document.querySelector('.signal-bars')).toBeNull();
  });

  it('speaks up the moment a line is in trouble', () => {
    show({ signal: 'poor' });
    expect(screen.getByLabelText('Connection is poor')).toHaveAttribute('data-signal', 'poor');
  });

  it('reports a line that has gone', () => {
    show({ signal: 'lost' });
    expect(screen.getByLabelText('Connection lost')).toBeInTheDocument();
  });

  it('shows a healthy line where its absence would itself be a question', () => {
    show({ signal: 'excellent', always: true });
    expect(screen.getByLabelText('Connection is excellent')).toBeInTheDocument();
  });
});
