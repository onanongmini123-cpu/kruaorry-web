export interface LatestRefreshRunner {
  request: () => Promise<void>;
  dispose: () => void;
}

export interface LatestRefreshController {
  attach: (runner: LatestRefreshRunner) => void;
  detach: (runner: LatestRefreshRunner) => void;
  request: () => Promise<void>;
  dispose: () => void;
}

/**
 * Holds the current runner outside React render state. Event handlers can
 * synchronously invalidate or queue work on it, while `detach` only clears
 * the runner that an effect actually installed. That identity check prevents
 * a late cleanup from disconnecting a newer signed-in member's runner.
 */
export function createLatestRefreshController(): LatestRefreshController {
  let current: LatestRefreshRunner | null = null;
  let requestedWhileDetached = false;

  return {
    attach: (runner) => {
      if (current !== runner) current?.dispose();
      current = runner;
      if (requestedWhileDetached) {
        requestedWhileDetached = false;
        void runner.request();
      }
    },
    detach: (runner) => {
      runner.dispose();
      if (current === runner) current = null;
    },
    request: () => {
      if (current) return current.request();
      requestedWhileDetached = true;
      return Promise.resolve();
    },
    dispose: () => {
      current?.dispose();
      current = null;
      requestedWhileDetached = false;
    },
  };
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
