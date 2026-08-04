
import { useEffect, useState } from 'react';
import { loadMushaf } from '../services/mushaf';

/**
 * Loads the Mushaf page layout, but only once something actually needs it.
 *
 * It is 697 KB that the verse list never looks at, so it stays out of the startup load and
 * arrives the first time a view that draws pages is opened. Once loaded it stays: the module
 * caches it, and `enabled` going false again does not unload anything.
 *
 * Deliberately no page state in here. Which page is open is a property of a view, not of the
 * layout, and two views want different answers.
 */
export const useMushafLayout = (enabled: boolean): { ready: boolean; failed: boolean } => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || ready) return;
    let cancelled = false;
    loadMushaf()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        console.error('Failed to load the Mushaf layout', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ready]);

  return { ready, failed };
};
