import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  findReleaseByNumber,
  getChronologicalWaybackItems,
  getFirstSymbolLayerId,
  getHideableLayerIds,
  getReleaseBySliderIndex,
  getReleaseSliderIndex,
  hideBaseLayers,
  restoreLayerVisibilities,
  toLayerIdPart,
  toMapLibreTileUrl,
} from '../src/lib/core/wayback';
import type { EsriWaybackRelease } from '../src/lib/core/types';

const releases: EsriWaybackRelease[] = [
  {
    itemID: 'newest',
    itemTitle: 'World Imagery (Wayback 2024-01-15)',
    itemURL: 'https://example.com/tile/1/{level}/{row}/{col}',
    metadataLayerItemID: 'metadata-newest',
    metadataLayerUrl: 'https://example.com/metadata/newest',
    layerIdentifier: 'WB_2024_R01',
    releaseNum: 1,
    releaseDateLabel: '2024-01-15',
    releaseDatetime: 1705276800000,
  },
  {
    itemID: 'older',
    itemTitle: 'World Imagery (Wayback 2020-06-01)',
    itemURL: 'https://example.com/tile/80/{level}/{row}/{col}',
    metadataLayerItemID: 'metadata-older',
    metadataLayerUrl: 'https://example.com/metadata/older',
    layerIdentifier: 'WB_2020_R02',
    releaseNum: 80,
    releaseDateLabel: '2020-06-01',
    releaseDatetime: 1590969600000,
  },
];

describe('wayback helpers', () => {
  it('converts Esri tile placeholders to MapLibre placeholders', () => {
    expect(toMapLibreTileUrl('https://example.com/{level}/{row}/{col}')).toBe(
      'https://example.com/{z}/{y}/{x}',
    );
  });

  it('normalizes date labels for layer ids', () => {
    expect(toLayerIdPart('2024-01-15')).toBe('2024-01-15');
    expect(toLayerIdPart('Jan 15, 2024')).toBe('jan-15-2024');
  });

  it('orders releases chronologically for the slider', () => {
    expect(getChronologicalWaybackItems(releases)).toEqual([releases[1], releases[0]]);
  });

  it('selects a requested release or falls back to the newest release', () => {
    expect(findReleaseByNumber(releases, 80)).toEqual(releases[1]);
    expect(findReleaseByNumber(releases, 99)).toEqual(releases[0]);
    expect(findReleaseByNumber(releases, undefined)).toEqual(releases[0]);
  });

  it('maps slider indexes to releases and selected release indexes', () => {
    expect(getReleaseSliderIndex(releases, releases[1])).toBe(0);
    expect(getReleaseSliderIndex(releases, releases[0])).toBe(1);
    expect(getReleaseBySliderIndex(releases, 0)).toEqual(releases[1]);
    expect(getReleaseBySliderIndex(releases, 1)).toEqual(releases[0]);
    expect(getReleaseBySliderIndex(releases, 99)).toEqual(releases[0]);
  });

  it('finds the first symbol layer and hideable basemap layers', () => {
    const style = {
      layers: [
        { id: 'background', type: 'background' },
        { id: 'imagery', type: 'raster' },
        { id: 'roads', type: 'line' },
        { id: 'labels', type: 'symbol' },
      ],
    };

    expect(getFirstSymbolLayerId(style)).toBe('labels');
    expect(getHideableLayerIds(style, 'esri-wayback-layer')).toEqual([
      'imagery',
      'roads',
    ]);
  });

  it('preserves and restores layer visibility values', () => {
    const layers = new Map<string, { visibility?: string }>([
      ['imagery', { visibility: undefined }],
      ['roads', { visibility: 'visible' }],
    ]);
    const map = {
      getLayer: vi.fn((id: string) => layers.get(id)),
      getLayoutProperty: vi.fn((id: string) => layers.get(id)?.visibility),
      setLayoutProperty: vi.fn((id: string, _property: string, value: string) => {
        const layer = layers.get(id);
        if (layer) {
          layer.visibility = value;
        }
      }),
    } as unknown as MapLibreMap;

    const snapshot = hideBaseLayers(map, ['imagery', 'roads']);

    expect(snapshot).toEqual({ imagery: undefined, roads: 'visible' });
    expect(layers.get('imagery')?.visibility).toBe('none');
    expect(layers.get('roads')?.visibility).toBe('none');

    restoreLayerVisibilities(map, snapshot);

    expect(layers.get('imagery')?.visibility).toBe('visible');
    expect(layers.get('roads')?.visibility).toBe('visible');
  });
});
