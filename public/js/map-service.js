import { CONFIG } from './config.js';

export class MapService {
    constructor(elementId) {
        const el = document.getElementById(elementId);
        if (!el) {
            throw new Error(`MapService: elemento #${elementId} não encontrado no DOM.`);
        }
        
        let center = CONFIG.DEFAULT_CENTER; // Array [lat, lng]
        if (!Array.isArray(center)) {
            center = [-22.9068, -43.1729];
        }

        // Inicializa o mapa com Leaflet
        this.map = L.map(elementId, {
            zoomControl: true,
            attributionControl: false
        }).setView(center, CONFIG.DEFAULT_ZOOM);

        // Define os Provedores de Mapa gratuitos e de alto desempenho
        this.tileLayers = {
            mapa: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }),
            satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19
            }),
            terreno: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19
            })
        };

        // Adiciona a camada padrão (Mapa)
        this.tileLayers.mapa.addTo(this.map);

        this.markers = [];
        this.routeOverlays = [];
    }

    clearMarkers() {
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers = [];
    }

    clearRouteOverlay() {
        this.routeOverlays.forEach(o => this.map.removeLayer(o));
        this.routeOverlays = [];
    }

    addMarker(lat, lng, popupContent, iconOptions = null) {
        if (lat && lng) {
            let markerOptions = {};
            
            // Traduz a opção de cor/símbolo para o DivIcon do Leaflet
            if (iconOptions) {
                if (iconOptions.html) {
                    markerOptions.icon = L.divIcon({
                        className: 'leaflet-custom-marker',
                        html: iconOptions.html,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                    });
                } else {
                    const color = iconOptions.fillColor || '#EF4444';
                    const size = (iconOptions.scale || 7) * 2;
                    
                    markerOptions.icon = L.divIcon({
                        className: 'leaflet-custom-marker',
                        html: `<div style="background-color:${color}; width:${size}px; height:${size}px; border-radius:50%; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
                        iconSize: [size, size],
                        iconAnchor: [size / 2, size / 2]
                    });
                }
            }

            const marker = L.marker([parseFloat(lat), parseFloat(lng)], markerOptions).addTo(this.map);
            
            if (popupContent) {
                marker.bindPopup(popupContent, {
                    autoClose: false,
                    closeOnClick: false
                });
            }
            
            this.markers.push(marker);
            return marker;
        }
    }

    invalidateSize() {
        setTimeout(() => {
            this.map.invalidateSize();
        }, 300);
    }

    setView(center, zoom) {
        let c = center;
        if (!Array.isArray(c)) {
            c = [c.lat, c.lng];
        }
        this.map.setView(c, zoom);
    }

    fitBounds(boundsArray) {
        if (boundsArray && boundsArray.length > 0) {
            this.map.fitBounds(boundsArray);
        }
    }

    addPolyline(coordsArray, color = '#f5a623', weight = 6) {
        const polyline = L.polyline(coordsArray, {
            color: color,
            weight: weight,
            opacity: 0.85
        }).addTo(this.map);
        this.routeOverlays.push(polyline);
    }

    setMapType(type) {
        // Remove as outras camadas
        Object.values(this.tileLayers).forEach(layer => this.map.removeLayer(layer));
        
        // Adiciona a selecionada
        if (this.tileLayers[type]) {
            this.tileLayers[type].addTo(this.map);
        }
    }
}
