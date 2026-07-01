import type { Spring, Transition } from 'framer-motion';

export const gaugeSpring: Spring = { type: 'spring', stiffness: 55, damping: 18 };

export const scoreSpring: Spring = { type: 'spring', stiffness: 80, damping: 22 };

export const confidenceSpring: Spring = { type: 'spring', stiffness: 100, damping: 25 };

export const pillTransition: Transition = { duration: 0.25 };

export const panelTransition: Transition = {
  duration: 0.65,
  ease: [0.4, 0, 0.2, 1],
};

export const staggerDelay = 0.055;

export const itemTransition: Transition = {
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1],
};

export const sparklineTransition: Transition = {
  duration: 0.4,
  ease: 'easeOut',
};
