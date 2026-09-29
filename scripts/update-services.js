const fs = require('fs');
const path = require('path');

// 1. Update caravan-projection-service.js
const projFile = path.join(__dirname, '../server/traffic-alert/engine/caravan-projection-service.js');
let projContent = fs.readFileSync(projFile, 'utf8');

// Add id and isPublic to COR_RIO_CAMERAS_CATALOG
projContent = projContent.replace("cameraId: 'CAM-COR-0512',", "id: 'CAM-TRANSOLIMPICA-01',\n        cameraId: 'CAM-COR-0512',");
projContent = projContent.replaceAll("provider: 'COR_RIO'", "provider: 'COR_RIO',\n        isPublic: true");
projContent = projContent.replaceAll("provider: 'LAMSA'", "provider: 'LAMSA',\n        isPublic: true");
projContent = projContent.replaceAll("provider: 'LAMSA / COR-Rio'", "provider: 'LAMSA / COR-Rio',\n        isPublic: true");
projContent = projContent.replaceAll("provider: 'CCR RioSP'", "provider: 'CCR RioSP',\n        isPublic: true");
projContent = projContent.replaceAll("provider: 'EcoPonte'", "provider: 'EcoPonte',\n        isPublic: true");

// Add routeColor in createCaravanProjectionDTO call
projContent = projContent.replace(
    "operationalNotes: caravanPlan.operationalNotes || '',",
    "operationalNotes: caravanPlan.operationalNotes || '',\n            routeColor: caravanPlan.routeColor || '#00d1ff',"
);

// Add googleQuotaNotice and wazeConsultativeUrl in trafficComparison
projContent = projContent.replace(
    "googleNotes: 'Integração Google Routes API",
    "googleQuotaNotice: 'Integração Google Routes API desativada localmente (requer quota corporativa aprovada).',\n            googleNotes: 'Integração Google Routes API"
);
projContent = projContent.replace(
    /wazeLink: `https:\/\/www\.waze\.com\/ul\?ll=\${destinationCoords \? destinationCoords\[0\] : -22\.9550},\${destinationCoords \? destinationCoords\[1\] : -43\.4100}&navigate=yes`,/,
    "wazeLink: `https://www.waze.com/ul?ll=${destinationCoords ? destinationCoords[0] : -22.9550},${destinationCoords ? destinationCoords[1] : -43.4100}&navigate=yes`,\n            wazeConsultativeUrl: `https://www.waze.com/ul?ll=${destinationCoords ? destinationCoords[0] : -22.9550},${destinationCoords ? destinationCoords[1] : -43.4100}&navigate=yes`,"
);

// Update alternativeRoute
projContent = projContent.replace(
    /alternativeRoute = {[\r\n\s]+corridorName:/,
    "alternativeRoute = {\n                isConsultativeOnly: true,\n                summary: 'Desvio consultivo via Transolímpica evitando trecho de lentidão crítica.',\n                geometry: [\n                    routeGeometry[0] || [-22.8090, -43.3640],\n                    [-22.8400, -43.3700],\n                    [-22.8700, -43.3850],\n                    [-22.9200, -43.4000],\n                    destinationCoords || [-22.9550, -43.4100]\n                ],\n                corridorName:"
);

// Add getNearbyCameras method to CaravanRouteProjectionService
const getNearbyMethod = `
    getNearbyCameras(routeGeometry = [], maxDistanceMeters = 2500) {
        const nearbyCameras = [];
        if (!Array.isArray(routeGeometry) || routeGeometry.length < 2) return nearbyCameras;
        for (const cam of COR_RIO_CAMERAS_CATALOG) {
            const { minDistance } = minDistanceToRouteMeters(cam.latitude, cam.longitude, routeGeometry);
            if (minDistance <= maxDistanceMeters) {
                nearbyCameras.push({
                    ...cam,
                    distanceMeters: Math.round(minDistance),
                    distanceToRouteMeters: Math.round(minDistance),
                    streamStatus: cam.status === 'DISPONÍVEL' ? 'OPERACIONAL' : 'SINAL_DISPONIVEL',
                    lastImageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
                });
            }
        }
        return nearbyCameras.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }
`;

if (!projContent.includes('getNearbyCameras(')) {
    projContent = projContent.replace(
        /const COR_RIO_CAMERAS_CATALOG = \[/,
        getNearbyMethod.trim() + '\n}\n\nconst COR_RIO_CAMERAS_CATALOG = ['
    );
}

fs.writeFileSync(projFile, projContent, 'utf8');
console.log('✅ Updated caravan-projection-service.js');

// 2. Update caravan-store.js
const storeFile = path.join(__dirname, '../server/traffic-alert/store/caravan-store.js');
let storeContent = fs.readFileSync(storeFile, 'utf8');

// Add routeColor to each base caravan
storeContent = storeContent.replace(
    "caravanId: 'caravan-01',",
    "caravanId: 'caravan-01',\n            routeColor: '#00d1ff',"
);
storeContent = storeContent.replace(
    "caravanId: 'caravan-02',",
    "caravanId: 'caravan-02',\n            routeColor: '#f5a623',"
);
storeContent = storeContent.replace(
    "caravanId: 'caravan-03',",
    "caravanId: 'caravan-03',\n            routeColor: '#10b981',"
);
storeContent = storeContent.replace(
    "caravanId: 'caravan-04',",
    "caravanId: 'caravan-04',\n            routeColor: '#d946ef',"
);

// Add routeColor in addCaravan
storeContent = storeContent.replace(
    "companyName: data.companyName || 'Log Rio',",
    "companyName: data.companyName || 'Log Rio',\n            routeColor: data.routeColor || '#00d1ff',"
);

// Update recalculateAll to update lastCalculatedAt
storeContent = storeContent.replace(
    "recalculateAll(publicIncidents = []) {\n        return this.getAll(publicIncidents);\n    }",
    `recalculateAll(publicIncidents = []) {
        this.lastCalculatedAt = new Date().toISOString();
        return this.getAll(publicIncidents).map(c => ({
            ...c,
            lastCalculatedAt: this.lastCalculatedAt
        }));
    }`
);

fs.writeFileSync(storeFile, storeContent, 'utf8');
console.log('✅ Updated caravan-store.js');

// 3. Update dashboard.html for tab-btn-monitoramento
const dashFile = path.join(__dirname, '../public/dashboard.html');
let dashContent = fs.readFileSync(dashFile, 'utf8');
dashContent = dashContent.replace(
    '<button class="tabBtn" data-tab="tab-monitoramento" id="tab-btn-monitoramento">',
    '<button class="tabBtn cursor-not-allowed opacity-60" data-tab="tab-monitoramento" id="tab-btn-monitoramento" disabled title="Módulo desativado por governança e privacidade">'
);
fs.writeFileSync(dashFile, dashContent, 'utf8');
console.log('✅ Updated dashboard.html');
