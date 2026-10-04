export interface LatestRefreshRunner {
  request: () => Promise<void>;
  dispose: () => void;
}

/**
 * Serializes refreshes while remembering a newer request. If focus arrives
 * while polling is in flight, the older response is discarded and one fresh
 * read runs immediately after it. Disposal also invalidates an in-flight read.
 */
export function createLatestRefreshRunner<T>(
  load: () => Promise<T>,
  apply: (value: T) => void,
): LatestRefreshRunner {
  let disposed = false;
  let inFlight = false;
  let requestedSequence = 0;

  const request = async () => {
    if (disposed) return;
    requestedSequence += 1;
    if (inFlight) return;

    inFlight = true;
    try {
      while (!disposed) {
        const sequence = requestedSequence;
        const value = await load();
        if (disposed) return;
        if (sequence === requestedSequence) {
          apply(value);
          return;
        }
      }
    } finally {
      inFlight = false;
    }
  };

  return {
    request,
    dispose: () => {
      disposed = true;
      requestedSequence += 1;
    },
  };
}
