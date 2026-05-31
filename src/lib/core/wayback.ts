import type { Map as MapLibreMap } from 'maplibre-gl';
import type { WaybackItem } from '@esri/wayback-core';

export const DEFAULT_SOURCE_ID = 'esri-wayback-source';
export const DEFAULT_LAYER_ID = 'esri-wayback-layer';
export const PERSISTENT_LAYER_PREFIX = 'esri-wayback-release';

export interface WaybackStyleLayer {
  id: string;
  type?: string;
  layout?: {
    visibility?: unknown;
  };
}

export interface WaybackStyle {
  layers?: WaybackStyleLayer[];
}

export type LayerVisibilitySnapshot = Record<string, string | undefined>;

export function toMapLibreTileUrl(itemURL: string): string {
  return itemURL
    .replace(/\{level\}/g, '{z}')
    .replace(/\{row\}/g, '{y}')
    .replace(/\{col\}/g, '{x}');
}

export function toLayerIdPart(value: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue || 'unknown-date';
}

export function getPersistentWaybackLayerId(release: Pick<WaybackItem, 'releaseDateLabel'>): string {
  return `${PERSISTENT_LAYER_PREFIX}-${toLayerIdPart(release.releaseDateLabel)}`;
}

export function getPersistentWaybackSourceId(release: Pick<WaybackItem, 'releaseDateLabel'>): string {
  return `${getPersistentWaybackLayerId(release)}-source`;
}

export function findReleaseByNumber(
  releases: WaybackItem[],
  releaseNum: number | undefined,
): WaybackItem | null {
  if (releaseNum === undefined) {
    return releases[0] ?? null;
  }

  return releases.find((release) => release.releaseNum === releaseNum) ?? releases[0] ?? null;
}

export function getChronologicalWaybackItems(releases: WaybackItem[]): WaybackItem[] {
  return [...releases].sort((a, b) => a.releaseDatetime - b.releaseDatetime);
}

export function getReleaseSliderIndex(
  releases: WaybackItem[],
  selectedRelease: WaybackItem | null,
): number {
  const chronologicalReleases = getChronologicalWaybackItems(releases);

  if (!chronologicalReleases.length || !selectedRelease) {
    return Math.max(chronologicalReleases.length - 1, 0);
  }

  const selectedIndex = chronologicalReleases.findIndex((release) => {
    return release.releaseNum === selectedRelease.releaseNum;
  });

  return selectedIndex >= 0 ? selectedIndex : Math.max(chronologicalReleases.length - 1, 0);
}

export function getReleaseBySliderIndex(
  releases: WaybackItem[],
  sliderIndex: number,
): WaybackItem | null {
  const chronologicalReleases = getChronologicalWaybackItems(releases);

  if (!chronologicalReleases.length) {
    return null;
  }

  const boundedIndex = Math.min(
    Math.max(Math.round(sliderIndex), 0),
    chronologicalReleases.length - 1,
  );

  return chronologicalReleases[boundedIndex];
}

export function getFirstSymbolLayerId(style: WaybackStyle): string | undefined {
  return style.layers?.find((layer) => layer.type === 'symbol')?.id;
}

export function getHideableLayerIds(
  style: WaybackStyle,
  waybackLayerId: string,
): string[] {
  return (
    style.layers
      ?.filter((layer) => {
        return (
          layer.id !== waybackLayerId &&
          layer.type !== 'symbol' &&
          layer.type !== 'background'
        );
      })
      .map((layer) => layer.id) ?? []
  );
}

export function hideBaseLayers(
  map: MapLibreMap,
  layerIds: string[],
): LayerVisibilitySnapshot {
  const snapshot: LayerVisibilitySnapshot = {};

  layerIds.forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }

    snapshot[layerId] = map.getLayoutProperty(layerId, 'visibility') as string | undefined;
    map.setLayoutProperty(layerId, 'visibility', 'none');
  });

  return snapshot;
}

export function restoreLayerVisibilities(
  map: MapLibreMap,
  snapshot: LayerVisibilitySnapshot,
): void {
  Object.entries(snapshot).forEach(([layerId, visibility]) => {
    if (!map.getLayer(layerId)) {
      return;
    }

    map.setLayoutProperty(layerId, 'visibility', visibility ?? 'visible');
  });
}

export function formatWaybackDate(timestamp: number | undefined): string {
  if (!timestamp) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}
