import type { Spring, Transition } from "framer-motion";

export const gaugeSpring: Spring = { type: "spring", stiffness: 120, damping: 26 };

export const scoreSpring: Spring = { type: "spring", stiffness: 80, damping: 22 };

export const confidenceSpring: Spring = { type: "spring", stiffness: 100, damping: 25 };

export const pillTransition: Transition = { duration: 0.15 };

export const panelTransition: Transition = {
  duration: 0.3,
  ease: [0.2, 0, 0, 1], // snap easing (brutalist)
};

export const staggerDelay = 0.055;

export const itemTransition: Transition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1],
};

export const sparklineTransition: Transition = {
  duration: 0.3,
  ease: "easeOut",
};
