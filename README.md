# MapLibre GL Esri Wayback

A MapLibre GL JS control for visualizing Esri World Imagery Wayback releases with a compact time slider.

[![npm version](https://img.shields.io/npm/v/maplibre-gl-esri-wayback.svg)](https://www.npmjs.com/package/maplibre-gl-esri-wayback)
[![npm downloads](https://img.shields.io/npm/dm/maplibre-gl-esri-wayback.svg)](https://www.npmjs.com/package/maplibre-gl-esri-wayback)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-esri-wayback)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-esri-wayback)

## Features

- MapLibre `IControl` implementation with a collapsible 29x29 control button.
- Chronological Esri World Imagery Wayback time slider powered by `@esri/wayback-core`.
- Older and newer release buttons for precise one-release stepping.
- Basemap replacement behavior that keeps symbol layers visible as labels.
- Add the selected Wayback image as a persistent raster layer with an optional before-layer ID.
- Click-to-query imagery metadata for the selected release and location.
- TypeScript types, Vite library build, and React wrapper.

## Installation

```bash
npm install maplibre-gl-esri-wayback maplibre-gl
```

## Quick Start

### Vanilla TypeScript

```typescript
import maplibregl from 'maplibre-gl';
import { EsriWaybackControl } from 'maplibre-gl-esri-wayback';
import 'maplibre-gl-esri-wayback/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-100.05, 35.1],
  zoom: 4,
});

map.on('load', () => {
  const control = new EsriWaybackControl({
    collapsed: false,
    panelWidth: 320,
  });

  map.addControl(control, 'top-right');
});
```

### React

```tsx
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import {
  EsriWaybackControlReact,
  useEsriWaybackState,
} from 'maplibre-gl-esri-wayback/react';
import 'maplibre-gl-esri-wayback/style.css';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const { state, setState } = useEsriWaybackState({ collapsed: false });

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-100.05, 35.1],
      zoom: 4,
    });

    mapInstance.on('load', () => setMap(mapInstance));
    return () => mapInstance.remove();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <EsriWaybackControlReact
          map={map}
          collapsed={state.collapsed}
          onStateChange={setState}
        />
      )}
    </div>
  );
}
```

## API

### EsriWaybackControl

The main control class implementing MapLibre's `IControl` interface.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `collapsed` | `boolean` | `true` | Whether the panel starts collapsed |
| `position` | `string` | `'top-right'` | Control position on the map |
| `title` | `string` | `'Esri Wayback'` | Panel title |
| `panelWidth` | `number` | `320` | Floating panel width in pixels |
| `className` | `string` | `''` | Custom CSS class for the button container |
| `initialReleaseNum` | `number` | newest release | Release number to select after loading |
| `sourceId` | `string` | `'esri-wayback-source'` | Raster source id |
| `layerId` | `string` | `'esri-wayback-layer'` | Raster layer id |
| `tileSize` | `number` | `256` | Raster tile size |
| `maxZoom` | `number` | `23` | Raster source max zoom |
| `metadataOnClick` | `boolean` | `true` | Query metadata when the map is clicked |

Methods:

- `toggle()`, `expand()`, `collapse()`
- `selectRelease(releaseNum)`
- `addSelectedReleaseAsPersistentLayer(beforeLayerId?)`
- `getState()`
- `setState(state)`
- `on(event, handler)`, `off(event, handler)`
- `getMap()`, `getContainer()`

Events:

- `collapse`
- `expand`
- `statechange`
- `releasechange`
- `metadatachange`
- `error`

### EsriWaybackControlReact

React wrapper component for `EsriWaybackControl`.

Props include all control options plus:

| Prop | Type | Description |
|------|------|-------------|
| `map` | `Map` | MapLibre GL map instance |
| `onStateChange` | `function` | Callback fired when state changes |
| `onReleaseChange` | `function` | Callback fired when the selected release changes |
| `onMetadataChange` | `function` | Callback fired when metadata changes |
| `onError` | `function` | Callback fired when an error is reported |

## Development

```bash
npm install
npm run dev
```

Available scripts:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build the library |
| `npm run build:examples` | Build examples for deployment |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |

Example routes:

- `http://localhost:5173/examples/basic/`
- `http://localhost:5173/examples/react/`

## Docker

```bash
docker build -t maplibre-gl-esri-wayback .
docker run -p 8080:80 maplibre-gl-esri-wayback
```

Open `http://localhost:8080/maplibre-gl-esri-wayback/`.

## Attribution

This plugin uses `@esri/wayback-core` to retrieve Esri World Imagery Wayback releases and metadata. The imagery is subject to Esri's applicable terms of use.
