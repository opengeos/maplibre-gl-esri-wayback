import maplibregl from 'maplibre-gl';
import { EsriWaybackControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-100.05, 35.1],
  zoom: 4,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  const waybackControl = new EsriWaybackControl({
    collapsed: false,
    panelWidth: 320,
  });

  map.addControl(waybackControl, 'top-right');

  waybackControl.on('releasechange', (event) => {
    console.log('Selected Wayback release:', event.state.selectedRelease);
  });

  waybackControl.on('metadatachange', (event) => {
    console.log('Wayback metadata:', event.state.metadata);
  });
});
