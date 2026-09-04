import * as Primitive from '@radix-ui/react-slider';
import type { ComponentProps } from 'react';
import { cn } from './utils';

export function Slider({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <Primitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <Primitive.Range className="absolute h-full bg-primary" />
      </Primitive.Track>
      <Primitive.Thumb className="block size-4 rounded-full border border-primary/40 bg-primary shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </Primitive.Root>
  );
}
