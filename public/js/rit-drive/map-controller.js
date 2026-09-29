/**
 * RIT DRIVE — Controlador do Mapa Leaflet
 * Gerencia renderização 100vw x 100dvh, camadas de rota, marcador veicular com heading
 * e modo perseguição suave (auto-follow) com desativação por gesto.
 */

import { createVehicleLeafletIcon } from '../../icons/rit-drive/vehicle-marker.js';
import { createLeafletIncidentIcon } from '../../icons/rit-drive/incident-icons.js';

export class MapController {
    constructor(containerId, stateStore, L) {
        this.containerId = containerId;
        this.store = stateStore;
        this.L = L;
        this.map = null;

        this.routeLayer = null;
        this.vehicleMarker = null;
        this.incidentsLayer = null;
        this.camerasLayer = null;

        this._initMap();
    }

    _initMap() {
        const defaultRio = [-22.9400, -43.2800];

        this.map = this.L.map(this.containerId, {
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true
        }).setView(defaultRio, 13);

        // Camada Base Dark Operations CICC (Esri Dark Canvas)
        const darkBase = this.L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19 }
        );
        const darkLabels = this.L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19 }
        );
        this.L.layerGroup([darkBase, darkLabels]).addTo(this.map);

        // Grupos de Camadas
        this.routeLayer = this.L.layerGroup().addTo(this.map);
        this.incidentsLayer = this.L.layerGroup().addTo(this.map);
        this.camerasLayer = this.L.layerGroup().addTo(this.map);

        // Desativa auto-follow se o usuário interagir com o mapa
        this.map.on('dragstart', () => {
            this.store.setState({ camera: { followVehicle: false, userMovedMap: true } });
        });
        this.map.on('zoomstart', () => {
            this.store.setState({ camera: { followVehicle: false, userMovedMap: true } });
        });

        // Invalidate size inicial
        setTimeout(() => this.invalidateSize(), 200);
    }

    invalidateSize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    renderRoute(routeCoords) {
        this.routeLayer.clearLayers();
        if (!routeCoords || routeCoords.length < 2) return;

        // Glow Layer de fundo (efeito neon ciano)
        this.L.polyline(routeCoords, {
            color: '#00D1FF',
            weight: 9,
            opacity: 0.35,
            lineCap: 'round'
        }).addTo(this.routeLayer);

        // Linha principal da via
        const mainLine = this.L.polyline(routeCoords, {
            color: '#38BDF8',
            weight: 5,
            opacity: 0.95,
            lineCap: 'round'
        }).addTo(this.routeLayer);

        // Marcador Ponto A (Partida)
        const startIcon = this.L.divIcon({
            className: 'rit-point-a',
            html: `<div style="background:#10B981; border:2px solid #FFF; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#FFF; font-weight:900; font-size:11px; box-shadow:0 0 8px #10B981;">A</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
        this.L.marker(routeCoords[0], { icon: startIcon }).addTo(this.routeLayer);

        // Marcador Ponto B (Destino)
        const endIcon = this.L.divIcon({
            className: 'rit-point-b',
            html: `<div style="background:#EF4444; border:2px solid #FFF; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#FFF; font-weight:900; font-size:11px; box-shadow:0 0 8px #EF4444;">B</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
        this.L.marker(routeCoords[routeCoords.length - 1], { icon: endIcon }).addTo(this.routeLayer);

        this.map.fitBounds(mainLine.getBounds(), { padding: [80, 80] });
    }

    updateVehicle(lat, lon, heading) {
        if (!lat || !lon) return;

        if (!this.vehicleMarker) {
            const icon = createVehicleLeafletIcon(this.L, heading);
            this.vehicleMarker = this.L.marker([lat, lon], {
                icon,
                zIndexOffset: 1200
            }).addTo(this.map);
        } else {
            this.vehicleMarker.setLatLng([lat, lon]);
            this.vehicleMarker.setIcon(createVehicleLeafletIcon(this.L, heading));
        }

        const cam = this.store.getState().camera;
        if (cam.followVehicle) {
            this.map.panTo([lat, lon], { animate: true, duration: 0.25 });
        }
    }

    recenterVehicle() {
        const veh = this.store.getState().vehicle;
        if (veh.lat && veh.lon) {
            this.store.setState({ camera: { followVehicle: true, userMovedMap: false } });
            this.map.setView([veh.lat, veh.lon], 16, { animate: true });
        }
    }

    renderIncidents(incidents) {
        this.incidentsLayer.clearLayers();
        if (!Array.isArray(incidents) || incidents.length === 0) return;

        incidents.forEach(inc => {
            const icon = createLeafletIncidentIcon(this.L, inc.type, 38);
            const marker = this.L.marker(inc.coordinate, {
                icon,
                zIndexOffset: 800
            }).addTo(this.incidentsLayer);

            marker.bindPopup(`
                <div style="font-family:'Outfit',sans-serif; color:#0F172A; min-width:180px;">
                    <div style="font-weight:800; font-size:13px; color:#EF4444; margin-bottom:4px;">
                        ⚠️ ${inc.title}
                    </div>
                    <div style="font-size:11.5px; color:#475569; margin-bottom:4px;">
                        📍 ${inc.locationName}
                    </div>
                    <div style="font-size:11px; font-weight:700; color:#0284C7;">
                        A ${inc.remainingDistanceM} m à frente na rota
                    </div>
                </div>
            `);
        });
    }

    renderCameras(cameras) {
        this.camerasLayer.clearLayers();
        if (!Array.isArray(cameras) || cameras.length === 0) return;

        cameras.forEach(cam => {
            if (!cam.latitude || !cam.longitude) return;

            const icon = this.L.divIcon({
                className: 'rit-camera-pin',
                html: `
                    <div style="background:#0284C7; border:1px solid #38BDF8; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; box-shadow:0 0 8px rgba(56,189,248,0.7); cursor:pointer;">
                        📹
                    </div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });

            this.L.marker([cam.latitude, cam.longitude], { icon }).addTo(this.camerasLayer)
                .bindPopup(`
                    <div style="font-family:'Outfit',sans-serif;">
                        <b style="color:#0284C7;">📹 ${cam.nome || 'Câmera COR Rio'}</b><br/>
                        <span style="font-size:11px; color:#64748B;">${cam.bairro || 'Via expressa'}</span>
                    </div>
                `);
        });
    }
}
