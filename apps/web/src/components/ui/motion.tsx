/**
 * Shared motion vocabulary. Short (150–300 ms), no overshoot — this is an institutional decision tool,
 * so motion only signals entry, exit, selection or layout change. `MotionConfig reducedMotion="user"` at the
 * root removes the transforms for people who ask for reduced motion and keeps the opacity fades.
 */
import { motion, type HTMLMotionProps, type Transition, type Variants } from 'motion/react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DURATION = { fast: 0.16, base: 0.24, slow: 0.32 } as const;

/** Critically damped spring for moving indicators (tab underline, nav highlight). */
export const INDICATOR_SPRING: Transition = { type: 'spring', bounce: 0, visualDuration: 0.28 };

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

/** A list whose items fade up in sequence when it first mounts. Pair with `StaggerItem`. */
export function StaggerList(props: HTMLMotionProps<'ul'>) {
  return <motion.ul variants={listVariants} initial="hidden" animate="show" {...props} />;
}

export function StaggerItem(props: HTMLMotionProps<'li'>) {
  return <motion.li variants={itemVariants} {...props} />;
}

/** Block-level stagger container for non-list layouts (grids of panels). Pair with `StaggerBlock`. */
export function StaggerGroup(props: HTMLMotionProps<'div'>) {
  return <motion.div variants={listVariants} initial="hidden" animate="show" {...props} />;
}

export function StaggerBlock(props: HTMLMotionProps<'div'>) {
  return <motion.div variants={itemVariants} {...props} />;
}

/** Cross-fade for content that swaps in place (tab panels, selected detail). Key it by what changed. */
export function FadeSwap(props: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      {...props}
    />
  );
}

/** Height reveal for small inline content (alerts, disclosures). Use inside AnimatePresence. */
export function Collapse({ style, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
      style={{ overflow: 'hidden', ...style }}
      {...props}
    />
  );
}
