import './lib/styles/esri-wayback-control.css';

export { EsriWaybackControl } from './lib/core/EsriWaybackControl';

export type {
  EsriWaybackControlOptions,
  EsriWaybackControlPosition,
  EsriWaybackState,
  EsriWaybackRelease,
  EsriWaybackMetadata,
  EsriWaybackPoint,
  EsriWaybackControlEvent,
  EsriWaybackControlEventHandler,
} from './lib/core/types';

export type {
  LayerVisibilitySnapshot,
  WaybackStyle,
  WaybackStyleLayer,
} from './lib/core/wayback';

export {
  DEFAULT_LAYER_ID,
  DEFAULT_SOURCE_ID,
  PERSISTENT_LAYER_PREFIX,
  findReleaseByNumber,
  formatWaybackDate,
  getChronologicalWaybackItems,
  getFirstSymbolLayerId,
  getHideableLayerIds,
  getPersistentWaybackLayerId,
  getPersistentWaybackSourceId,
  getReleaseBySliderIndex,
  getReleaseSliderIndex,
  hideBaseLayers,
  restoreLayerVisibilities,
  toLayerIdPart,
  toMapLibreTileUrl,
} from './lib/core/wayback';

export {
  clamp,
  formatNumericValue,
  generateId,
  debounce,
  throttle,
  classNames,
} from './lib/utils';
