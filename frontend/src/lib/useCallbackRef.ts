import { useCallback, useRef } from "react";

/** A stable callback identity that always invokes the latest closure. */
export function useCallbackRef<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
