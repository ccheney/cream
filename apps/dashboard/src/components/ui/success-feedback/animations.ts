/**
 * Success Feedback Animations
 *
 * CSS keyframes and animation constants for success feedback components.
 */

/**
 * Default animation durations.
 */
export const CHECKMARK_ANIMATION_DURATION = 300;
export const SUCCESS_STATE_DURATION = 2000;
export const ERROR_STATE_DURATION = 3000;

/**
 * CSS keyframes for success animations.
 */
export const checkmarkKeyframes = `
  @keyframes checkmark-draw {
    0% {
      stroke-dashoffset: 50;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes success-bg-flash {
    0% {
      background-color: rgba(34, 197, 94, 0.2);
    }
    100% {
      background-color: transparent;
    }
  }

  @keyframes fade-in-scale {
    0% {
      opacity: 0;
      transform: scale(0.8);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .checkmark-animated,
    .success-button {
      animation: none !important;
    }
  }
`;
