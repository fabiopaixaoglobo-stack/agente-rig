import { CONFIG } from './config.js';

export class MapService {
    constructor(elementId) {
        const el = document.getElementById(elementId);
        if (!el) {
            throw new Error(`MapService: elemento #${elementId} não encontrado no DOM.`);
        }
        
        let center = CONFIG.DEFAULT_CENTER;
        if (Array.isArray(center)) {
            center = { lat: center[0], lng: center[1] };
        }

        this.map = new google.maps.Map(el, {
            center: center,
            zoom: CONFIG.DEFAULT_ZOOM,
            mapTypeId: 'roadmap',
            disableDefaultUI: true,
            zoomControl: true
        });

        // Add Traffic Layer
        this.trafficLayer = new google.maps.TrafficLayer();
        this.trafficLayer.setMap(this.map);

        this.markers = [];
        this.routeOverlays = [];
    }

    clearMarkers() {
        this.markers.forEach(m => m.setMap(null));
        this.markers = [];
    }

    clearRouteOverlay() {
        this.routeOverlays.forEach(o => o.setMap(null));
        this.routeOverlays = [];
    }

    addMarker(lat, lng, popupContent, icon = null) {
        if (lat && lng) {
            const markerOptions = {
                position: { lat: parseFloat(lat), lng: parseFloat(lng) },
                map: this.map
            };
            if (icon) {
                markerOptions.icon = icon;
                markerOptions.label = icon.label || null;
            }
            const marker = new google.maps.Marker(markerOptions);
            
            if (popupContent) {
                const infoWindow = new google.maps.InfoWindow({
                    content: popupContent
                });
                marker.addListener('click', () => {
                    infoWindow.open(this.map, marker);
                });
            }
            this.markers.push(marker);
            return marker;
        }
    }

    invalidateSize() {
        // google.maps automatically handles resize events better,
        // but we can trigger a resize event to be sure
        setTimeout(() => {
            google.maps.event.trigger(this.map, 'resize');
        }, 300);
    }

    setView(center, zoom) {
        let c = center;
        if (Array.isArray(c)) {
            c = { lat: c[0], lng: c[1] };
        }
        this.map.setCenter(c);
        this.map.setZoom(zoom);
    }

    fitBounds(boundsArray) {
        const bounds = new google.maps.LatLngBounds();
        boundsArray.forEach(point => {
            if (Array.isArray(point)) {
                bounds.extend({ lat: point[0], lng: point[1] });
            }
        });
        this.map.fitBounds(bounds);
    }

    addPolyline(coordsArray, color = '#f5a623', weight = 6) {
        const path = coordsArray.map(c => ({ lat: c[0], lng: c[1] }));
        const polyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: weight,
            map: this.map
        });
        this.routeOverlays.push(polyline);
    }
}
