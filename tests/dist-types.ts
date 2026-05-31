import {
  EsriWaybackControl,
  getPersistentWaybackLayerId,
  type EsriWaybackControlEventHandler,
  type EsriWaybackControlOptions,
  type EsriWaybackRelease,
  type EsriWaybackState,
  type LayerVisibilitySnapshot,
  type WaybackStyle,
} from 'maplibre-gl-esri-wayback';
import {
  EsriWaybackControlReact,
  useEsriWaybackState,
  type EsriWaybackControlReactProps,
  type UseEsriWaybackStateReturn,
} from 'maplibre-gl-esri-wayback/react';

const options: EsriWaybackControlOptions = {
  collapsed: true,
  initialReleaseNum: 1,
};
const control = new EsriWaybackControl(options);

const handler: EsriWaybackControlEventHandler = (
  event: Parameters<EsriWaybackControlEventHandler>[0],
) => {
  const state: EsriWaybackState = event.state;
  void state.selectedRelease;
};
control.on('statechange', handler);

const release = {
  releaseDateLabel: '2024-01-15',
} as EsriWaybackRelease;
const layerId = getPersistentWaybackLayerId(release);

const snapshot: LayerVisibilitySnapshot = {};
const style: WaybackStyle = { layers: [{ id: layerId, type: 'raster' }] };

const reactProps = {} as EsriWaybackControlReactProps;
const hook: UseEsriWaybackStateReturn = useEsriWaybackState();
const ReactControl = EsriWaybackControlReact;

void snapshot;
void style;
void reactProps;
void hook;
void ReactControl;
