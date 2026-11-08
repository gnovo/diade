# PR A: wizard motion (merged, #15)

## Why

The add-date wizard felt too fast and jittery. Three causes, found by reading `StepPager`:

1. Height was animated with the JS driver (`useNativeDriver: false`) on both the pager and the footer.
   While the next step mounted and measured, the JS thread was busy and frames dropped.
2. `onLayout` re-measuring fed back into the animation, restarting the height tween mid-slide.
3. `bezier(0.2, 0, 0, 1)` at 300 ms spends most of its travel in the first tenth of the time.

## What changed

`apps/mobile/src/components/StepPager.tsx` is now Reanimated. One `progress` value (a fractional step
index) drives the slide, the container height (interpolated between the steps' measured heights), the
parallax and the fade, so nothing chases anything else. A step that resizes in place (a section opening)
uses a decaying offset. Exports: `StepPager`, `useStepProgress`, `StepProgress`, `FoldingFooter`,
`STEP_EASING`, `STEP_MS`, `RESIZE_MS`, `useReduceMotion`. `ImportantDateWizard` uses them.

## Measured

Six step transitions on a Pixel 6 with `adb shell dumpsys gfxinfo`: 0.53% janky frames (190 frames),
against 2.6% (77 frames) before. The old animations were shorter, so the frame counts differ: treat it
as a rough signal.

## Limits to know about (matters for PR D)

`StepPager` sizes its height bookkeeping from `steps.length` on mount. A wizard whose number of steps
changes at runtime (PR D: Empty is 2 steps, Meal plan is 4) must either key the pager by path or make
that bookkeeping dynamic.
