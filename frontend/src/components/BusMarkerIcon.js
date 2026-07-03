import L from 'leaflet';

export const busMarkerIcon = L.divIcon({
  className: 'bus-marker-shell',
  html: '<div class="bus-marker"><span>BUS</span></div>',
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  popupAnchor: [0, -20]
});
