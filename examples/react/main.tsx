import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { Map } from 'maplibre-gl';
import { EsriWaybackControlReact, useEsriWaybackState } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

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

    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    mapInstance.on('load', () => {
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <EsriWaybackControlReact
          map={map}
          collapsed={state.collapsed}
          panelWidth={320}
          onStateChange={setState}
          onReleaseChange={(release) => console.log('Selected release:', release)}
          onMetadataChange={(metadata) => console.log('Metadata:', metadata)}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
