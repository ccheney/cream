/**
 * Custom Hooks
 *
 * Reusable React hooks for the dashboard.
 */

export { type UseFocusTrapOptions, type UseFocusTrapReturn, useFocusTrap } from "./useFocusTrap";
export {
	type KeyboardShortcut,
	type UseKeyboardShortcutsOptions,
	type UseKeyboardShortcutsReturn,
	useKeyboardShortcuts,
} from "./useKeyboardShortcuts";
export {
	BREAKPOINTS,
	type Breakpoint,
	type UseMediaQueryReturn,
	useMatchMedia,
	useMediaQuery,
} from "./useMediaQuery";
export {
	type OptimisticMutationOptions,
	type OptimisticMutationResult,
	type SimpleMutationOptions,
	useOptimisticMutation,
	useSimpleMutation,
} from "./useOptimisticMutation";
export {
	SLIDE_UP_KEYFRAMES,
	type StaggeredAnimationStyle,
	type UseStaggeredAnimationOptions,
	type UseStaggeredAnimationReturn,
	useStaggeredAnimation,
} from "./useStaggeredAnimation";
export {
	type SwipeDirection,
	type TouchGestureHandlers,
	type TouchGestureOptions,
	type TouchGestureState,
	type UseTouchGesturesReturn,
	useTouchGestures,
} from "./useTouchGestures";
