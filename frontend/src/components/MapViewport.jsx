import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapViewport({ focus }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) {
      return;
    }

    map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), 14), {
      animate: true,
      duration: 1.2
    });
  }, [focus, map]);

  return null;
}
