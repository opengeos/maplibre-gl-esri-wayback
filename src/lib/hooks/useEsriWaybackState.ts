import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { EsriWaybackState } from '../core/types';

const DEFAULT_STATE: EsriWaybackState = {
  collapsed: true,
  panelWidth: 320,
  loading: false,
  error: null,
  releases: [],
  selectedRelease: null,
  metadata: null,
  metadataLoading: false,
  selectedPoint: null,
  persistentBeforeLayerId: '',
  persistentLayerStatus: null,
  localChangesOnly: false,
  localChangesLoading: false,
  localChanges: null,
  localChangesPoint: null,
};

export interface UseEsriWaybackStateReturn {
  state: EsriWaybackState;
  setState: Dispatch<SetStateAction<EsriWaybackState>>;
  setCollapsed: (collapsed: boolean) => void;
  setPanelWidth: (panelWidth: number) => void;
  reset: () => void;
  toggle: () => void;
}

export function useEsriWaybackState(
  initialState?: Partial<EsriWaybackState>,
): UseEsriWaybackStateReturn {
  const [state, setState] = useState<EsriWaybackState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, collapsed }));
  }, []);

  const setPanelWidth = useCallback((panelWidth: number) => {
    setState((prev) => ({ ...prev, panelWidth }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    setPanelWidth,
    reset,
    toggle,
  };
}
