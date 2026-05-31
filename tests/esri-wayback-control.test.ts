import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  getMetadata,
  getWaybackItems,
  type WaybackItem,
} from '@esri/wayback-core';
import { EsriWaybackControl } from '../src/lib/core/EsriWaybackControl';

vi.mock('@esri/wayback-core', () => ({
  getWaybackItems: vi.fn(),
  getMetadata: vi.fn(),
}));

type Handler = (event?: { lngLat: { lng: number; lat: number } }) => void;

interface FakeLayer {
  id: string;
  type: string;
  source?: string;
  layout?: {
    visibility?: string;
  };
}

function createRelease(releaseNum: number, releaseDateLabel: string): WaybackItem {
  return {
    itemID: `item-${releaseNum}`,
    itemTitle: `World Imagery (Wayback ${releaseDateLabel})`,
    itemURL: `https://example.com/tile/${releaseNum}/{level}/{row}/{col}`,
    metadataLayerItemID: `metadata-${releaseNum}`,
    metadataLayerUrl: `https://example.com/metadata/${releaseNum}`,
    layerIdentifier: `WB_${releaseNum}`,
    releaseNum,
    releaseDateLabel,
    releaseDatetime: new Date(releaseDateLabel).getTime(),
  };
}

function createFakeMap() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const layers: FakeLayer[] = [
    { id: 'background', type: 'background' },
    { id: 'imagery', type: 'raster', layout: {} },
    { id: 'roads', type: 'line', layout: { visibility: 'visible' } },
    { id: 'labels', type: 'symbol' },
  ];
  const sources = new Map<string, Record<string, unknown>>();
  const handlers = new Map<string, Set<Handler>>();

  const on = vi.fn((event: string, handler: Handler) => {
    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event)!.add(handler);
  });

  const off = vi.fn((event: string, handler: Handler) => {
    handlers.get(event)?.delete(handler);
  });

  const map = {
    getContainer: vi.fn(() => container),
    getStyle: vi.fn(() => ({ layers })),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn((event: string, handler: Handler) => on(event, handler)),
    on,
    off,
    getZoom: vi.fn(() => 15),
    getLayer: vi.fn((id: string) => layers.find((layer) => layer.id === id)),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, source: Record<string, unknown>) => {
      sources.set(id, source);
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    addLayer: vi.fn((layer: FakeLayer, beforeId?: string) => {
      const beforeIndex = beforeId
        ? layers.findIndex((existingLayer) => existingLayer.id === beforeId)
        : -1;
      if (beforeIndex >= 0) {
        layers.splice(beforeIndex, 0, layer);
      } else {
        layers.push(layer);
      }
    }),
    removeLayer: vi.fn((id: string) => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index >= 0) {
        layers.splice(index, 1);
      }
    }),
    getLayoutProperty: vi.fn((id: string, property: string) => {
      if (property !== 'visibility') return undefined;
      return layers.find((layer) => layer.id === id)?.layout?.visibility;
    }),
    setLayoutProperty: vi.fn((id: string, property: string, value: string) => {
      if (property !== 'visibility') return;
      const layer = layers.find((existingLayer) => existingLayer.id === id);
      if (!layer) return;
      layer.layout = { ...layer.layout, visibility: value };
    }),
  };

  return {
    container,
    layers,
    sources,
    map: map as unknown as MapLibreMap,
    emit(event: string, payload: { lngLat: { lng: number; lat: number } }) {
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
  };
}

const releases = [
  createRelease(102, '2024-01-15'),
  createRelease(80, '2020-06-01'),
];

describe('EsriWaybackControl', () => {
  beforeEach(() => {
    vi.mocked(getWaybackItems).mockResolvedValue(releases);
    vi.mocked(getMetadata).mockResolvedValue(null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('loads releases, renders the slider, and applies the newest imagery', async () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    const controlContainer = control.onAdd(fakeMap.map);
    document.body.appendChild(controlContainer);

    await waitFor(() => {
      expect(document.querySelector<HTMLInputElement>('.esri-wayback-range')).toBeTruthy();
    });

    expect(document.body.textContent).toContain('2024-01-15');
    expect(document.body.textContent).toContain('2020-06-01');
    expect(document.querySelector<HTMLInputElement>('.esri-wayback-range')?.value).toBe('1');
    expect(fakeMap.sources.get('esri-wayback-source')?.tiles).toEqual([
      'https://example.com/tile/102/{z}/{y}/{x}',
    ]);
    expect(fakeMap.layers.find((layer) => layer.id === 'imagery')?.layout?.visibility).toBe(
      'none',
    );
    expect(fakeMap.layers.find((layer) => layer.id === 'roads')?.layout?.visibility).toBe(
      'none',
    );
  });

  it('selects a release from the time slider and emits releasechange', async () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    const onReleaseChange = vi.fn();
    control.on('releasechange', onReleaseChange);
    document.body.appendChild(control.onAdd(fakeMap.map));

    await waitFor(() => {
      expect(document.querySelector<HTMLInputElement>('.esri-wayback-range')).toBeTruthy();
    });

    const slider = document.querySelector<HTMLInputElement>('.esri-wayback-range');

    expect(slider).toBeDefined();
    fireEvent.change(slider!, { target: { value: '0' } });

    expect(control.getState().selectedRelease?.releaseNum).toBe(80);
    expect(fakeMap.sources.get('esri-wayback-source')?.tiles).toEqual([
      'https://example.com/tile/80/{z}/{y}/{x}',
    ]);
    expect(onReleaseChange).toHaveBeenCalled();
  });

  it('adds the selected release as a persistent layer before a provided layer id', async () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    document.body.appendChild(control.onAdd(fakeMap.map));

    await waitFor(() => {
      expect(control.getState().selectedRelease?.releaseNum).toBe(102);
    });

    const beforeInput = document.querySelector<HTMLInputElement>('.esri-wayback-input');
    const addButton = document.querySelector<HTMLButtonElement>(
      '.esri-wayback-add-layer-button',
    );

    expect(beforeInput).toBeDefined();
    expect(addButton).toBeDefined();
    fireEvent.input(beforeInput!, { target: { value: 'labels' } });
    fireEvent.click(addButton!);

    expect(fakeMap.sources.get('esri-wayback-release-2024-01-15-source')?.tiles).toEqual([
      'https://example.com/tile/102/{z}/{y}/{x}',
    ]);

    const persistentIndex = fakeMap.layers.findIndex((layer) => {
      return layer.id === 'esri-wayback-release-2024-01-15';
    });
    const labelsIndex = fakeMap.layers.findIndex((layer) => layer.id === 'labels');

    expect(persistentIndex).toBeGreaterThanOrEqual(0);
    expect(persistentIndex).toBeLessThan(labelsIndex);
    expect(document.body.textContent).toContain(
      'Added persistent layer "esri-wayback-release-2024-01-15".',
    );

    control.onRemove();

    expect(fakeMap.sources.has('esri-wayback-release-2024-01-15-source')).toBe(true);
    expect(
      fakeMap.layers.some((layer) => layer.id === 'esri-wayback-release-2024-01-15'),
    ).toBe(true);
  });

  it('keeps the panel open until the close button is clicked', () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: true });
    const controlContainer = control.onAdd(fakeMap.map);
    document.body.appendChild(controlContainer);

    const toggle = controlContainer.querySelector<HTMLButtonElement>(
      '.esri-wayback-control-toggle',
    );
    const panel = document.querySelector('.esri-wayback-control-panel');
    const close = document.querySelector<HTMLButtonElement>('.esri-wayback-control-close');

    expect(panel?.classList.contains('expanded')).toBe(false);
    fireEvent.click(toggle!);
    expect(panel?.classList.contains('expanded')).toBe(true);
    fireEvent.click(document.body);
    expect(panel?.classList.contains('expanded')).toBe(true);
    fireEvent.click(toggle!);
    expect(panel?.classList.contains('expanded')).toBe(true);
    fireEvent.click(close!);
    expect(panel?.classList.contains('expanded')).toBe(false);
  });

  it('keeps panel pointer gestures from bubbling to the map container', () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    const mapGestureHandler = vi.fn();
    fakeMap.container.addEventListener('pointerdown', mapGestureHandler);
    document.body.appendChild(control.onAdd(fakeMap.map));

    const panel = document.querySelector('.esri-wayback-control-panel');
    panel?.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(mapGestureHandler).not.toHaveBeenCalled();
  });

  it('queries metadata when the map is clicked', async () => {
    const fakeMap = createFakeMap();
    vi.mocked(getMetadata).mockResolvedValue({
      date: 1704067200000,
      provider: 'Maxar',
      source: 'WV03',
      resolution: 0.3,
      accuracy: 5,
    });
    const control = new EsriWaybackControl({ collapsed: false });
    document.body.appendChild(control.onAdd(fakeMap.map));

    await waitFor(() => {
      expect(control.getState().selectedRelease?.releaseNum).toBe(102);
    });

    fakeMap.emit('click', { lngLat: { lng: -100.05, lat: 35.1 } });

    await waitFor(() => {
      expect(document.body.textContent).toContain('Maxar');
    });
    expect(getMetadata).toHaveBeenCalledWith(
      { longitude: -100.05, latitude: 35.1 },
      15,
      102,
    );
  });

  it('renders an error state when releases fail to load', async () => {
    vi.mocked(getWaybackItems).mockRejectedValueOnce(new Error('Wayback unavailable'));
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    const onError = vi.fn();
    control.on('error', onError);
    document.body.appendChild(control.onAdd(fakeMap.map));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Wayback unavailable');
    });
    expect(onError).toHaveBeenCalled();
  });

  it('restores hidden basemap layers on removal', async () => {
    const fakeMap = createFakeMap();
    const control = new EsriWaybackControl({ collapsed: false });
    const controlContainer = control.onAdd(fakeMap.map);
    document.body.appendChild(controlContainer);

    await waitFor(() => {
      expect(fakeMap.layers.find((layer) => layer.id === 'roads')?.layout?.visibility).toBe(
        'none',
      );
    });

    control.onRemove();

    expect(fakeMap.layers.find((layer) => layer.id === 'imagery')?.layout?.visibility).toBe(
      'visible',
    );
    expect(fakeMap.layers.find((layer) => layer.id === 'roads')?.layout?.visibility).toBe(
      'visible',
    );
    expect(fakeMap.sources.has('esri-wayback-source')).toBe(false);
  });
});
