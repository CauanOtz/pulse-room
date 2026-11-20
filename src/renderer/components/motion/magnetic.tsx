import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/** Leans toward the pointer while it is near, and springs back when it leaves. */
export function Magnetic({
  children,
  strength = 0.22,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.6 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={still ? undefined : { x, y }}
      onPointerMove={(event) => {
        if (still || !ref.current) return;
        const box = ref.current.getBoundingClientRect();
        x.set((event.clientX - (box.left + box.width / 2)) * strength);
        y.set((event.clientY - (box.top + box.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
