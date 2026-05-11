import { CONFIG } from './config.js';

export class MapService {
    constructor(elementId) {
        this.map = L.map(elementId, { 
            center: CONFIG.DEFAULT_CENTER, 
            zoom: CONFIG.DEFAULT_ZOOM 
        });
        L.tileLayer(CONFIG.MAP_TILE_LAYER, { 
            attribution: CONFIG.MAP_ATTRIBUTION 
        }).addTo(this.map);
        this.layerGroup = L.layerGroup().addTo(this.map);
        this.routeOverlay = L.layerGroup().addTo(this.map);
    }

    clearMarkers() {
        this.layerGroup.clearLayers();
    }

    clearRouteOverlay() {
        this.routeOverlay.clearLayers();
    }

    addMarker(lat, lng, popupContent) {
        if (lat && lng) {
            L.marker([lat, lng]).addTo(this.layerGroup).bindPopup(popupContent);
        }
    }

    invalidateSize() {
        setTimeout(() => this.map.invalidateSize(), 300);
    }

    setView(center, zoom) {
        this.map.setView(center, zoom);
    }
}
