import { useEffect, useRef } from 'react';
import { EsriWaybackControl } from './EsriWaybackControl';
import type { EsriWaybackControlReactProps } from './types';

export function EsriWaybackControlReact({
  map,
  onStateChange,
  onReleaseChange,
  onMetadataChange,
  onError,
  ...options
}: EsriWaybackControlReactProps): null {
  const controlRef = useRef<EsriWaybackControl | null>(null);

  useEffect(() => {
    if (!map) return;

    const control = new EsriWaybackControl(options);
    controlRef.current = control;

    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    if (onReleaseChange) {
      control.on('releasechange', (event) => {
        onReleaseChange(event.state.selectedRelease);
      });
    }

    if (onMetadataChange) {
      control.on('metadatachange', (event) => {
        onMetadataChange(event.state.metadata);
      });
    }

    if (onError) {
      control.on('error', (event) => {
        if (event.state.error) {
          onError(event.state.error);
        }
      });
    }

    map.addControl(control, options.position || 'top-right');

    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;

    const currentState = control.getState();
    if (options.collapsed !== undefined && options.collapsed !== currentState.collapsed) {
      if (options.collapsed) {
        control.collapse();
      } else {
        control.expand();
      }
    }
  }, [options.collapsed]);

  useEffect(() => {
    const control = controlRef.current;
    if (!control || options.initialReleaseNum === undefined) return;

    if (control.getState().selectedRelease?.releaseNum !== options.initialReleaseNum) {
      control.selectRelease(options.initialReleaseNum);
    }
  }, [options.initialReleaseNum]);

  return null;
}
