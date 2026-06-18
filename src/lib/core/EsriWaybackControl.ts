import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import {
  getMetadata,
  getWaybackItems,
  getWaybackItemsWithLocalChanges,
  type WaybackMetadata,
} from '@esri/wayback-core';
import type {
  EsriWaybackControlEvent,
  EsriWaybackControlEventHandler,
  EsriWaybackControlOptions,
  EsriWaybackPoint,
  EsriWaybackRelease,
  EsriWaybackState,
} from './types';
import { debounce } from '../utils';
import {
  DEFAULT_LAYER_ID,
  DEFAULT_SOURCE_ID,
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
  toMapLibreTileUrl,
  type LayerVisibilitySnapshot,
} from './wayback';

const DEFAULT_OPTIONS: Required<Omit<EsriWaybackControlOptions, 'initialReleaseNum'>> &
  Pick<EsriWaybackControlOptions, 'initialReleaseNum'> = {
  collapsed: true,
  position: 'top-right',
  title: 'Esri Wayback',
  panelWidth: 320,
  minPanelWidth: 260,
  maxPanelWidth: 640,
  className: '',
  initialReleaseNum: undefined,
  sourceId: DEFAULT_SOURCE_ID,
  layerId: DEFAULT_LAYER_ID,
  tileSize: 256,
  maxZoom: 23,
  metadataOnClick: true,
  localChangesOnly: false,
};

const LOCAL_CHANGES_REFRESH_DELAY = 400;

type EventHandlersMap = globalThis.Map<
  EsriWaybackControlEvent,
  Set<EsriWaybackControlEventHandler>
>;

export class EsriWaybackControl implements IControl {
  private _map?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _content?: HTMLElement;
  private _options: typeof DEFAULT_OPTIONS;
  private _state: EsriWaybackState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _baseLayerSnapshot: LayerVisibilitySnapshot | null = null;
  private _resizeHandler: (() => void) | null = null;
  private _resizeDragCleanup: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _mapClickHandler: ((event: { lngLat: { lng: number; lat: number } }) => void) | null =
    null;
  private _mapMoveEndHandler: (() => void) | null = null;
  private _metadataRequestId = 0;
  private _localChangesRequestId = 0;
  private _localChangesAbort: AbortController | null = null;

  constructor(options?: Partial<EsriWaybackControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._state = {
      collapsed: this._options.collapsed,
      panelWidth: this._options.panelWidth,
      loading: false,
      error: null,
      releases: [],
      selectedRelease: null,
      metadata: null,
      metadataLoading: false,
      selectedPoint: null,
      persistentBeforeLayerId: '',
      persistentLayerStatus: null,
      localChangesOnly: this._options.localChangesOnly,
      localChangesLoading: false,
      localChanges: null,
      localChangesPoint: null,
    };
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();
    this._container = this._createContainer();
    this._panel = this._createPanel();

    this._mapContainer.appendChild(this._panel);
    this._setupEventListeners();
    this._renderContent();
    void this._loadReleases();

    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
      requestAnimationFrame(() => {
        this._updatePanelPosition();
      });
    }

    return this._container;
  }

  onRemove(): void {
    this._resizeDragCleanup?.();

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }

    if (this._mapClickHandler && this._map) {
      this._map.off('click', this._mapClickHandler);
      this._mapClickHandler = null;
    }

    if (this._mapMoveEndHandler && this._map) {
      this._map.off('moveend', this._mapMoveEndHandler);
      this._mapMoveEndHandler = null;
    }

    this._localChangesRequestId++;
    this._localChangesAbort?.abort();
    this._localChangesAbort = null;

    this._restoreBasemap();
    this._removeWaybackLayer();

    this._panel?.parentNode?.removeChild(this._panel);
    this._container?.parentNode?.removeChild(this._container);

    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._panel = undefined;
    this._content = undefined;
    this._eventHandlers.clear();
  }

  getState(): EsriWaybackState {
    return {
      ...this._state,
      releases: [...this._state.releases],
    };
  }

  setState(newState: Partial<EsriWaybackState>): void {
    const nextReleases = newState.releases ?? this._state.releases;
    const selectedReleaseChanged =
      newState.selectedRelease !== undefined &&
      newState.selectedRelease?.releaseNum !== this._state.selectedRelease?.releaseNum;

    this._state = {
      ...this._state,
      ...newState,
      releases: nextReleases,
    };

    if (selectedReleaseChanged) {
      this._applySelectedRelease();
      this._emit('releasechange');
    }

    this._renderContent();
    this._emit('statechange');
  }

  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
        this._emit('collapse');
      } else {
        this._panel.classList.add('expanded');
        this._updatePanelPosition();
        this._emit('expand');
      }
    }

    this._emit('statechange');
  }

  expand(): void {
    if (this._state.collapsed) {
      this.toggle();
    }
  }

  collapse(): void {
    if (!this._state.collapsed) {
      this.toggle();
    }
  }

  on(event: EsriWaybackControlEvent, handler: EsriWaybackControlEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }

    this._eventHandlers.get(event)!.add(handler);
  }

  off(event: EsriWaybackControlEvent, handler: EsriWaybackControlEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  selectRelease(releaseNum: number): void {
    const selectedRelease = findReleaseByNumber(this._state.releases, releaseNum);

    if (!selectedRelease) {
      return;
    }

    this._state = {
      ...this._state,
      selectedRelease,
      metadata: null,
      metadataLoading: false,
      selectedPoint: null,
    };
    this._applySelectedRelease();
    this._renderContent();
    this._emit('releasechange');
    this._emit('statechange');
  }

  addSelectedReleaseAsPersistentLayer(beforeLayerId?: string): string | null {
    const release = this._state.selectedRelease;

    if (!this._map || !release) {
      this._setPersistentLayerStatus('No Wayback release is selected.');
      return null;
    }

    if (!this._map.isStyleLoaded()) {
      this._setPersistentLayerStatus('Wait for the map style to finish loading.');
      return null;
    }

    const layerId = getPersistentWaybackLayerId(release);
    const sourceId = getPersistentWaybackSourceId(release);
    const requestedBeforeId = beforeLayerId?.trim() || '';
    const fallbackBeforeId = getFirstSymbolLayerId(this._map.getStyle());
    const resolvedBeforeId = requestedBeforeId || fallbackBeforeId;

    if (requestedBeforeId && requestedBeforeId !== layerId && !this._map.getLayer(requestedBeforeId)) {
      this._setPersistentLayerStatus(`Layer "${requestedBeforeId}" was not found.`);
      return null;
    }

    if (this._map.getLayer(layerId)) {
      this._map.removeLayer(layerId);
    }

    if (this._map.getSource(sourceId)) {
      this._map.removeSource(sourceId);
    }

    this._map.addSource(sourceId, {
      type: 'raster',
      tiles: [toMapLibreTileUrl(release.itemURL)],
      tileSize: this._options.tileSize,
      maxzoom: this._options.maxZoom,
    });
    this._map.addLayer(
      {
        id: layerId,
        type: 'raster',
        source: sourceId,
      },
      resolvedBeforeId && resolvedBeforeId !== layerId ? resolvedBeforeId : undefined,
    );

    this._setPersistentLayerStatus(`Added persistent layer "${layerId}".`);
    return layerId;
  }

  private async _loadReleases(): Promise<void> {
    this._state = { ...this._state, loading: true, error: null };
    this._renderContent();
    this._emit('statechange');

    try {
      const releases = await getWaybackItems();
      const selectedRelease = findReleaseByNumber(releases, this._options.initialReleaseNum);

      this._state = {
        ...this._state,
        loading: false,
        releases,
        selectedRelease,
      };
      this._applySelectedRelease();
      this._renderContent();
      this._emit('releasechange');
      this._emit('statechange');

      if (this._state.localChangesOnly) {
        void this._loadLocalChanges();
      }
    } catch (error) {
      this._setError(error instanceof Error ? error.message : 'Failed to load Wayback releases.');
    }
  }

  /**
   * Toggle the "only versions with local changes" filter. When enabled, the
   * release timeline is limited to the Wayback versions that introduced visible
   * imagery changes at the current map center and zoom, and it refreshes as the
   * map moves.
   *
   * @param enabled - Whether to restrict the timeline to versions with changes.
   */
  setLocalChangesOnly(enabled: boolean): void {
    if (this._state.localChangesOnly === enabled) {
      return;
    }

    this._state = { ...this._state, localChangesOnly: enabled };

    if (enabled) {
      void this._loadLocalChanges();
    } else {
      // Invalidate and cancel any in-flight change-detection query.
      this._localChangesRequestId++;
      this._localChangesAbort?.abort();
      this._localChangesAbort = null;
      this._state = {
        ...this._state,
        localChanges: null,
        localChangesPoint: null,
        localChangesLoading: false,
      };
      this._renderContent();
      this._emit('localchangeschange');
      this._emit('statechange');
    }
  }

  private async _loadLocalChanges(): Promise<void> {
    if (!this._map || !this._state.releases.length) {
      return;
    }

    const center = this._map.getCenter();
    const point: EsriWaybackPoint = { longitude: center.lng, latitude: center.lat };
    const zoom = Math.round(this._map.getZoom());

    const requestId = ++this._localChangesRequestId;
    this._localChangesAbort?.abort();
    const abortController = new AbortController();
    this._localChangesAbort = abortController;

    this._state = { ...this._state, localChangesLoading: true, error: null };
    this._renderContent();
    this._emit('statechange');

    try {
      const localChanges = await getWaybackItemsWithLocalChanges(point, zoom, abortController);

      if (requestId !== this._localChangesRequestId) {
        return;
      }

      this._localChangesAbort = null;
      this._state = {
        ...this._state,
        localChanges,
        localChangesPoint: point,
        localChangesLoading: false,
      };

      const selectionChanged = this._reconcileSelectionWithLocalChanges();
      this._renderContent();
      this._emit('localchangeschange');
      if (selectionChanged) {
        this._emit('releasechange');
      }
      this._emit('statechange');
    } catch (error) {
      if (requestId !== this._localChangesRequestId || abortController.signal.aborted) {
        return;
      }

      this._localChangesAbort = null;
      this._state = { ...this._state, localChangesLoading: false };
      this._setError(
        error instanceof Error
          ? error.message
          : 'Failed to find Wayback versions with local changes.',
      );
    }
  }

  /**
   * Keep the selected release within the filtered list. If the current
   * selection is missing from the local-changes set, select the newest version
   * that has changes so the slider and the displayed imagery stay in sync.
   *
   * @returns Whether the selected release changed.
   */
  private _reconcileSelectionWithLocalChanges(): boolean {
    if (!this._state.localChangesOnly) {
      return false;
    }

    const localChanges = this._state.localChanges;
    if (!localChanges || !localChanges.length) {
      return false;
    }

    const current = this._state.selectedRelease;
    if (current && localChanges.some((release) => release.releaseNum === current.releaseNum)) {
      return false;
    }

    const chronological = getChronologicalWaybackItems(localChanges);
    const newest = chronological[chronological.length - 1] ?? null;
    if (!newest || newest.releaseNum === current?.releaseNum) {
      return false;
    }

    this._state = {
      ...this._state,
      selectedRelease: newest,
      metadata: null,
      metadataLoading: false,
      selectedPoint: null,
    };
    this._applySelectedRelease();
    return true;
  }

  /**
   * The releases that drive the timeline slider: the local-changes subset when
   * the filter is active and resolved, otherwise the full release list.
   */
  private _getActiveReleases(): EsriWaybackRelease[] {
    if (this._state.localChangesOnly && this._state.localChanges) {
      return this._state.localChanges;
    }

    return this._state.releases;
  }

  private _setError(message: string): void {
    this._state = {
      ...this._state,
      loading: false,
      metadataLoading: false,
      error: message,
    };
    this._renderContent();
    this._emit('error');
    this._emit('statechange');
  }

  private async _queryMetadata(point: EsriWaybackPoint): Promise<void> {
    const release = this._state.selectedRelease;

    if (!release || !this._map) {
      return;
    }

    const requestId = ++this._metadataRequestId;
    this._state = {
      ...this._state,
      selectedPoint: point,
      metadata: null,
      metadataLoading: true,
      error: null,
    };
    this._renderContent();
    this._emit('statechange');

    try {
      const zoom = Math.round(this._map.getZoom());
      const metadata = (await getMetadata(point, zoom, release.releaseNum)) as
        | WaybackMetadata
        | null;

      if (requestId !== this._metadataRequestId) {
        return;
      }

      this._state = {
        ...this._state,
        metadata,
        metadataLoading: false,
      };
      this._renderContent();
      this._emit('metadatachange');
      this._emit('statechange');
    } catch (error) {
      if (requestId !== this._metadataRequestId) {
        return;
      }

      this._state = { ...this._state, metadataLoading: false };
      this._setError(error instanceof Error ? error.message : 'Failed to query Wayback metadata.');
    }
  }

  private _applySelectedRelease(): void {
    const release = this._state.selectedRelease;

    if (!this._map || !release) {
      return;
    }

    if (!this._map.isStyleLoaded()) {
      this._map.once('load', () => this._applySelectedRelease());
      return;
    }

    this._replaceBasemap();
    this._removeWaybackLayer();

    const beforeId = getFirstSymbolLayerId(this._map.getStyle());
    this._map.addSource(this._options.sourceId, {
      type: 'raster',
      tiles: [toMapLibreTileUrl(release.itemURL)],
      tileSize: this._options.tileSize,
      maxzoom: this._options.maxZoom,
    });
    this._map.addLayer(
      {
        id: this._options.layerId,
        type: 'raster',
        source: this._options.sourceId,
      },
      beforeId,
    );
  }

  private _replaceBasemap(): void {
    if (!this._map || this._baseLayerSnapshot) {
      return;
    }

    const hideableLayerIds = getHideableLayerIds(
      this._map.getStyle(),
      this._options.layerId,
    );
    this._baseLayerSnapshot = hideBaseLayers(this._map, hideableLayerIds);
  }

  private _restoreBasemap(): void {
    if (!this._map || !this._baseLayerSnapshot) {
      return;
    }

    restoreLayerVisibilities(this._map, this._baseLayerSnapshot);
    this._baseLayerSnapshot = null;
  }

  private _removeWaybackLayer(): void {
    if (!this._map) {
      return;
    }

    if (this._map.getLayer(this._options.layerId)) {
      this._map.removeLayer(this._options.layerId);
    }

    if (this._map.getSource(this._options.sourceId)) {
      this._map.removeSource(this._options.sourceId);
    }
  }

  private _emit(event: EsriWaybackControlEvent): void {
    const handlers = this._eventHandlers.get(event);

    if (!handlers) {
      return;
    }

    const eventData = { type: event, state: this.getState() };
    handlers.forEach((handler) => handler(eventData));
  }

  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group esri-wayback-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'esri-wayback-control-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.innerHTML = `
      <span class="esri-wayback-control-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="13" r="8"/>
          <path d="M12 9v4l3 2"/>
          <path d="M9 2h6"/>
          <path d="M12 2v3"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.expand());

    container.appendChild(toggleBtn);

    return container;
  }

  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'esri-wayback-control-panel';
    panel.style.width = `${this._options.panelWidth}px`;
    ['dblclick', 'mousedown', 'pointerdown', 'touchstart', 'wheel'].forEach((eventName) => {
      panel.addEventListener(eventName, (event) => event.stopPropagation());
    });

    const header = document.createElement('div');
    header.className = 'esri-wayback-control-header';

    const title = document.createElement('span');
    title.className = 'esri-wayback-control-title';
    title.textContent = this._options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'esri-wayback-control-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.collapse());

    this._content = document.createElement('div');
    this._content.className = 'esri-wayback-control-content';

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(this._content);

    panel.appendChild(this._createResizeHandle('left'));
    panel.appendChild(this._createResizeHandle('right'));

    return panel;
  }

  private _createResizeHandle(side: 'left' | 'right'): HTMLElement {
    const handle = document.createElement('div');
    handle.className = `esri-wayback-control-resize-handle esri-wayback-control-resize-handle-${side}`;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize panel');
    handle.addEventListener('pointerdown', (event) => this._startResize(event, side));
    return handle;
  }

  private _startResize(event: PointerEvent, handleSide: 'left' | 'right'): void {
    if (event.button !== 0 || !this._panel || !this._mapContainer) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // End any drag that is somehow still active before starting a new one.
    this._resizeDragCleanup?.();

    const handle = event.currentTarget as HTMLElement;
    const mapRect = this._mapContainer.getBoundingClientRect();
    const panelRect = this._panel.getBoundingClientRect();
    const position = this._getControlPosition();
    const anchorSide: 'left' | 'right' =
      position === 'top-left' || position === 'bottom-left' ? 'left' : 'right';
    const isAnchoredEdge = handleSide === anchorSide;

    const startX = event.clientX;
    const startWidth = panelRect.width;
    const startAnchorOffset =
      anchorSide === 'right'
        ? mapRect.right - panelRect.right
        : panelRect.left - mapRect.left;

    const margin = 8;
    const minWidth = this._options.minPanelWidth;
    // When dragging the anchored edge the opposite (free) edge stays fixed, so
    // the panel can only grow until the anchor offset is consumed. Otherwise the
    // free edge can grow until it reaches the far side of the map.
    const boundsLimit = isAnchoredEdge
      ? startWidth + startAnchorOffset - margin
      : mapRect.width - startAnchorOffset - margin;
    const maxWidth = Math.max(minWidth, Math.min(this._options.maxPanelWidth, boundsLimit));

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Ignore environments without pointer capture support.
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const widthDelta = handleSide === 'right' ? delta : -delta;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + widthDelta));
      const appliedWidthDelta = newWidth - startWidth;

      this._panel!.style.width = `${newWidth}px`;

      // Keep the non-dragged edge visually fixed when resizing the anchored edge.
      if (isAnchoredEdge) {
        const newAnchorOffset = Math.max(0, startAnchorOffset - appliedWidthDelta);
        this._panel!.style[anchorSide] = `${newAnchorOffset}px`;
      }
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
      this._resizeDragCleanup = null;
    };

    const onPointerUp = () => {
      cleanup();
      const finalWidth = this._panel ? this._panel.getBoundingClientRect().width : startWidth;
      this._state = { ...this._state, panelWidth: Math.round(finalWidth) };
      this._emit('statechange');
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    this._resizeDragCleanup = cleanup;
  }

  private _renderContent(): void {
    if (!this._content) {
      return;
    }

    this._content.replaceChildren();

    if (this._state.loading) {
      this._content.appendChild(this._createStatus('Loading Wayback releases...'));
      return;
    }

    if (this._state.error) {
      this._content.appendChild(this._createStatus(this._state.error, 'error'));
    }

    this._content.appendChild(this._createSelectedSummary());
    this._content.appendChild(this._createLocalChangesToggle());
    this._content.appendChild(this._createTimeSlider());
    this._content.appendChild(this._createPersistentLayerForm());
    this._content.appendChild(this._createMetadataPanel());
  }

  private _createStatus(message: string, tone: 'neutral' | 'error' = 'neutral'): HTMLElement {
    const status = document.createElement('p');
    status.className = `esri-wayback-status esri-wayback-status-${tone}`;
    status.textContent = message;
    return status;
  }

  private _createSelectedSummary(): HTMLElement {
    const summary = document.createElement('section');
    summary.className = 'esri-wayback-summary';

    const label = document.createElement('span');
    label.className = 'esri-wayback-summary-label';
    label.textContent = 'Selected release';

    const value = document.createElement('strong');
    value.className = 'esri-wayback-summary-value';
    value.textContent = this._state.selectedRelease?.releaseDateLabel ?? 'None';

    const detail = document.createElement('span');
    detail.className = 'esri-wayback-summary-detail';
    detail.textContent = this._state.selectedRelease
      ? `Release ${this._state.selectedRelease.releaseNum}`
      : 'No release loaded';

    summary.append(label, value, detail);
    return summary;
  }

  private _createLocalChangesToggle(): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'esri-wayback-local-changes';

    const checkbox = document.createElement('input');
    checkbox.className = 'esri-wayback-local-changes-checkbox';
    checkbox.type = 'checkbox';
    checkbox.checked = this._state.localChangesOnly;
    checkbox.disabled = !this._state.releases.length;
    checkbox.addEventListener('change', () => {
      this.setLocalChangesOnly(checkbox.checked);
    });

    const text = document.createElement('span');
    text.className = 'esri-wayback-local-changes-label';
    text.textContent = 'Only versions with local changes';

    wrapper.append(checkbox, text);

    if (this._state.localChangesOnly && this._state.localChangesLoading) {
      const status = document.createElement('span');
      status.className = 'esri-wayback-local-changes-status';
      status.textContent = 'Checking...';
      wrapper.appendChild(status);
    }

    return wrapper;
  }

  private _createTimeSlider(): HTMLElement {
    const wrapper = document.createElement('section');
    wrapper.className = 'esri-wayback-slider';

    if (this._state.localChangesOnly && this._state.localChangesLoading) {
      wrapper.appendChild(this._createStatus('Finding versions with local changes...'));
      return wrapper;
    }

    const activeReleases = this._getActiveReleases();

    if (!activeReleases.length) {
      const message = this._state.localChangesOnly
        ? 'No versions with local changes at this location.'
        : 'No Wayback releases found.';
      wrapper.appendChild(this._createStatus(message));
      return wrapper;
    }

    const chronologicalReleases = getChronologicalWaybackItems(activeReleases);
    const selectedIndex = getReleaseSliderIndex(activeReleases, this._state.selectedRelease);
    const oldestRelease = chronologicalReleases[0];
    const newestRelease = chronologicalReleases[chronologicalReleases.length - 1];

    const labelRow = document.createElement('div');
    labelRow.className = 'esri-wayback-slider-label-row';

    const label = document.createElement('span');
    label.className = 'esri-wayback-label';
    label.textContent = 'Release timeline';

    const count = document.createElement('span');
    count.className = 'esri-wayback-release-count';
    count.textContent = `${selectedIndex + 1} of ${chronologicalReleases.length}`;

    labelRow.append(label, count);

    const slider = document.createElement('input');
    slider.className = 'esri-wayback-range';
    slider.type = 'range';
    slider.min = '0';
    slider.max = `${chronologicalReleases.length - 1}`;
    slider.step = '1';
    slider.value = `${selectedIndex}`;
    slider.setAttribute('aria-label', 'Select Wayback release by date');
    slider.addEventListener('change', () => {
      this._selectReleaseBySliderIndex(Number(slider.value));
    });

    const endpoints = document.createElement('div');
    endpoints.className = 'esri-wayback-slider-endpoints';

    const oldest = document.createElement('span');
    oldest.textContent = oldestRelease?.releaseDateLabel ?? '';

    const newest = document.createElement('span');
    newest.textContent = newestRelease?.releaseDateLabel ?? '';

    endpoints.append(oldest, newest);

    const controls = document.createElement('div');
    controls.className = 'esri-wayback-slider-controls';

    const olderButton = this._createSliderButton('Older release', '<', selectedIndex - 1);
    olderButton.disabled = selectedIndex <= 0;

    const newerButton = this._createSliderButton('Newer release', '>', selectedIndex + 1);
    newerButton.disabled = selectedIndex >= chronologicalReleases.length - 1;

    controls.append(olderButton, newerButton);
    wrapper.append(labelRow, slider, endpoints, controls);

    return wrapper;
  }

  private _createSliderButton(
    ariaLabel: string,
    text: string,
    targetIndex: number,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'esri-wayback-slider-button';
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', () => this._selectReleaseBySliderIndex(targetIndex));
    return button;
  }

  private _selectReleaseBySliderIndex(sliderIndex: number): void {
    const release = getReleaseBySliderIndex(this._getActiveReleases(), sliderIndex);

    if (release) {
      this.selectRelease(release.releaseNum);
    }
  }

  private _createPersistentLayerForm(): HTMLElement {
    const wrapper = document.createElement('section');
    wrapper.className = 'esri-wayback-persistent';

    const label = document.createElement('label');
    label.className = 'esri-wayback-persistent-label';

    const labelText = document.createElement('span');
    labelText.className = 'esri-wayback-label';
    labelText.textContent = 'Before ID';

    const input = document.createElement('input');
    input.className = 'esri-wayback-input';
    input.type = 'text';
    input.placeholder = 'Optional layer id';
    input.value = this._state.persistentBeforeLayerId;
    input.addEventListener('input', () => {
      this._state = {
        ...this._state,
        persistentBeforeLayerId: input.value,
        persistentLayerStatus: null,
      };
      this._emit('statechange');
    });

    label.append(labelText, input);

    const button = document.createElement('button');
    button.className = 'esri-wayback-add-layer-button';
    button.type = 'button';
    button.textContent = 'Add persistent layer';
    button.disabled = !this._state.selectedRelease;
    button.addEventListener('click', () => {
      this.addSelectedReleaseAsPersistentLayer(this._state.persistentBeforeLayerId);
    });

    wrapper.append(label, button);

    if (this._state.persistentLayerStatus) {
      const status = document.createElement('p');
      status.className = 'esri-wayback-persistent-status';
      status.textContent = this._state.persistentLayerStatus;
      wrapper.appendChild(status);
    }

    return wrapper;
  }

  private _setPersistentLayerStatus(message: string): void {
    this._state = {
      ...this._state,
      persistentLayerStatus: message,
    };
    this._renderContent();
    this._emit('statechange');
  }

  private _createMetadataPanel(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'esri-wayback-metadata';

    const title = document.createElement('h3');
    title.textContent = 'Location metadata';
    panel.appendChild(title);

    if (!this._options.metadataOnClick) {
      panel.appendChild(this._createStatus('Metadata queries are disabled.'));
      return panel;
    }

    if (this._state.metadataLoading) {
      panel.appendChild(this._createStatus('Loading metadata...'));
      return panel;
    }

    if (!this._state.selectedPoint) {
      panel.appendChild(this._createStatus('Click the map to inspect imagery metadata.'));
      return panel;
    }

    if (!this._state.metadata) {
      panel.appendChild(this._createStatus('No metadata found for this location.'));
      return panel;
    }

    const metadata = this._state.metadata;
    const rows: Array<[string, string]> = [
      ['Acquired', formatWaybackDate(metadata.date)],
      ['Provider', metadata.provider || 'Unknown'],
      ['Source', metadata.source || 'Unknown'],
      ['Resolution', this._formatNumber(metadata.resolution, ' m')],
      ['Accuracy', this._formatNumber(metadata.accuracy, ' m')],
    ];

    const dl = document.createElement('dl');
    rows.forEach(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    });
    panel.appendChild(dl);

    return panel;
  }

  private _formatNumber(value: number | undefined, suffix: string): string {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return 'Unknown';
    }

    return `${value}${suffix}`;
  }

  private _setupEventListeners(): void {
    this._resizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    this._mapResizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    this._map?.on('resize', this._mapResizeHandler);

    if (this._options.metadataOnClick) {
      this._mapClickHandler = (event) => {
        void this._queryMetadata({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
        });
      };
      this._map?.on('click', this._mapClickHandler);
    }

    this._mapMoveEndHandler = debounce(() => {
      if (this._state.localChangesOnly) {
        void this._loadLocalChanges();
      }
    }, LOCAL_CHANGES_REFRESH_DELAY);
    this._map?.on('moveend', this._mapMoveEndHandler);
  }

  private _getControlPosition():
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right';

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right';
  }

  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    const button = this._container.querySelector('.esri-wayback-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;
    const panelGap = 5;

    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    switch (position) {
      case 'top-left':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;
      case 'top-right':
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
      case 'bottom-left':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;
      case 'bottom-right':
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
