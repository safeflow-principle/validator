# Reasoning field lost focus during autosave

## Observed behavior

During the real 20-item validation walkthrough, typing in the required reasoning textarea stopped after short bursts. The validator had to click the textarea repeatedly to continue entering a judgment.

## Root cause

The annotation screen treated every local save as an input-locking operation. The 500 ms autosave therefore disabled the controlled textarea while the validator was typing. A disabled focused control loses focus in the browser, so each autosave disconnected the active typing session even though the underlying annotation state was preserved.

## Expected behavior

Autosave must preserve an enabled, focused reasoning control while recording a stable snapshot in IndexedDB. Navigation and explicit submission may lock controls while their writes are pending, but background autosave must not. The save indicator may show `Saving…` only while the persistence request is unresolved and `Saved locally` only after it succeeds.

## Regression coverage

`src/annotation/AnnotationScreen.test.tsx` reproduces an annotation state in `saving` with the `autosave` intent, focuses the reasoning textarea, and asserts that the field remains enabled and focused. `src/annotation/stateMachine.test.ts` additionally verifies that typing events arriving during an autosave are merged into the active edit state rather than discarded.
