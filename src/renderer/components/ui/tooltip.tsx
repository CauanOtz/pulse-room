import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './utils';
import { useOverlayContainer } from './overlay-portal';

export const TooltipProvider = Primitive.Provider;

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: ComponentProps<typeof Primitive.Content>['side'];
  shortcut?: string;
  className?: string;
}

/**
 * A hint that arrives and leaves on its own.
 *
 * The animation moves opacity and transform only, which the compositor can do
 * without repainting: this window sits over a game and a live screen, so an
 * effect that costs frames is not worth a label.
 */
export function Tooltip({ label, children, side = 'top', shortcut, className }: TooltipProps) {
  const container = useOverlayContainer();
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal container={container}>
        <Primitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'pulse-tooltip z-50 flex max-w-64 items-center gap-2 rounded-[10px] px-2.5 py-1.5',
            'text-xs font-medium will-change-[transform,opacity]',
            className,
          )}
        >
          <span className="pulse-tooltip-label">{label}</span>
          {shortcut && (
            <span className="pulse-tooltip-keys" aria-label={`Shortcut ${shortcut}`}>
              {shortcut.split('+').map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
          )}
          <Primitive.Arrow className="pulse-tooltip-arrow" width={10} height={5} />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
