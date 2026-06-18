import type { Map } from 'maplibre-gl';
import type { WaybackItem, WaybackMetadata } from '@esri/wayback-core';

export type EsriWaybackControlPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type EsriWaybackRelease = WaybackItem;
export type EsriWaybackMetadata = WaybackMetadata | null;

export interface EsriWaybackPoint {
  longitude: number;
  latitude: number;
}

export interface EsriWaybackControlOptions {
  /**
   * Whether the control panel should start collapsed.
   *
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control on the map.
   *
   * @default 'top-right'
   */
  position?: EsriWaybackControlPosition;

  /**
   * Title displayed in the control header.
   *
   * @default 'Esri Wayback'
   */
  title?: string;

  /**
   * Width of the control panel in pixels.
   *
   * @default 320
   */
  panelWidth?: number;

  /**
   * Minimum width of the control panel in pixels when resizing.
   *
   * @default 260
   */
  minPanelWidth?: number;

  /**
   * Maximum width of the control panel in pixels when resizing.
   * The panel is also constrained to stay within the map container.
   *
   * @default 640
   */
  maxPanelWidth?: number;

  /**
   * Custom CSS class name for the control container.
   */
  className?: string;

  /**
   * Release number to select after Wayback releases are loaded.
   * Defaults to the newest release.
   */
  initialReleaseNum?: number;

  /**
   * Stable MapLibre raster source id.
   *
   * @default 'esri-wayback-source'
   */
  sourceId?: string;

  /**
   * Stable MapLibre raster layer id.
   *
   * @default 'esri-wayback-layer'
   */
  layerId?: string;

  /**
   * Raster tile size in pixels.
   *
   * @default 256
   */
  tileSize?: number;

  /**
   * Maximum raster source zoom.
   *
   * @default 23
   */
  maxZoom?: number;

  /**
   * Query imagery metadata when users click the map.
   *
   * @default true
   */
  metadataOnClick?: boolean;

  /**
   * Show only the Wayback releases that introduced local imagery changes at the
   * current map center and zoom level. When enabled, the release list is
   * filtered using `@esri/wayback-core`'s change detection and refreshes as the
   * map moves. This mirrors Esri's "Only versions with local changes" option.
   *
   * @default false
   */
  localChangesOnly?: boolean;
}

export interface EsriWaybackState {
  collapsed: boolean;
  panelWidth: number;
  loading: boolean;
  error: string | null;
  releases: EsriWaybackRelease[];
  selectedRelease: EsriWaybackRelease | null;
  metadata: EsriWaybackMetadata;
  metadataLoading: boolean;
  selectedPoint: EsriWaybackPoint | null;
  persistentBeforeLayerId: string;
  persistentLayerStatus: string | null;
  /**
   * Whether the release list is filtered to versions with local changes.
   */
  localChangesOnly: boolean;
  /**
   * Whether a change-detection query is currently in flight.
   */
  localChangesLoading: boolean;
  /**
   * Releases that introduced local imagery changes at `localChangesPoint`.
   * `null` until the first change-detection query resolves.
   */
  localChanges: EsriWaybackRelease[] | null;
  /**
   * The map point used for the most recent change-detection query.
   */
  localChangesPoint: EsriWaybackPoint | null;
}

export interface EsriWaybackControlReactProps extends EsriWaybackControlOptions {
  /**
   * MapLibre GL map instance.
   */
  map: Map;

  /**
   * Callback fired when control state changes.
   */
  onStateChange?: (state: EsriWaybackState) => void;

  /**
   * Callback fired when the selected Wayback release changes.
   */
  onReleaseChange?: (release: EsriWaybackRelease | null) => void;

  /**
   * Callback fired when metadata query results change.
   */
  onMetadataChange?: (metadata: EsriWaybackMetadata) => void;

  /**
   * Callback fired when the set of versions with local changes is recomputed.
   * Receives `null` when the local-changes filter is disabled.
   */
  onLocalChangesChange?: (releases: EsriWaybackRelease[] | null) => void;

  /**
   * Callback fired when the control reports an error.
   */
  onError?: (error: string) => void;
}

export type EsriWaybackControlEvent =
  | 'collapse'
  | 'expand'
  | 'statechange'
  | 'releasechange'
  | 'metadatachange'
  | 'localchangeschange'
  | 'error';

export type EsriWaybackControlEventHandler = (event: {
  type: EsriWaybackControlEvent;
  state: EsriWaybackState;
}) => void;
