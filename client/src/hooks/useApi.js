import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// Module-level cache for GETs that never change during a session
// (boundaries, states manifest, parties). Key = url.
const cache = new Map();

function initialState(url, cached) {
  if (!url) return { url, data: null, error: null, loading: false };
  if (cached && cache.has(url)) {
    return { url, data: cache.get(url), error: null, loading: false };
  }
  return { url, data: null, error: null, loading: true };
}

/**
 * Fetch a GET url. Pass url = null to fetch nothing.
 * Options: { cached: true } to use the module-level cache.
 * Returns { data, error, loading, refetch }.
 */
export function useApi(url, options = {}) {
  const { cached = false } = options;
  const [state, setState] = useState(() => initialState(url, cached));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setState({ url, data: null, error: null, loading: false });
      return undefined;
    }
    if (cached && cache.has(url)) {
      setState({ url, data: cache.get(url), error: null, loading: false });
      return undefined;
    }
    let cancelled = false;
    // Keep showing the previous data for the SAME url while refetching
    // (e.g. the admin table after an action); only a url change blanks it.
    setState((s) => ({
      url,
      data: s.url === url ? s.data : null,
      error: null,
      loading: true,
    }));
    api.get(url).then(
      (data) => {
        if (cached) cache.set(url, data);
        if (!cancelled) setState({ url, data, error: null, loading: false });
      },
      (error) => {
        if (!cancelled) setState({ url, data: null, error, loading: false });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url, cached, tick]);

  const refetch = useCallback(() => {
    if (url && cached) cache.delete(url);
    setTick((t) => t + 1);
  }, [url, cached]);

  // If the url changed this render, don't report the previous url's state.
  const current = state.url === url ? state : initialState(url, cached);

  return { data: current.data, error: current.error, loading: current.loading, refetch };
}
