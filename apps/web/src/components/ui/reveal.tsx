import { motion, type HTMLMotionProps } from 'motion/react';

/**
 * Subtle entrance for panels (skill guidance: 200–300 ms, opacity + short translate, no layout properties).
 * MotionConfig reducedMotion="user" at the root turns this into an instant state for reduced-motion users.
 */
export function Reveal({ delay = 0, ...props }: HTMLMotionProps<'div'> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay }}
      {...props}
    />
  );
}
