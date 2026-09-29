/**
 * RIT DRIVE — Módulo Bootstrap de Inicialização Modular
 * Orquestra todos os serviços, controladores e eventos da aplicação de navegação.
 */

import { StateStore } from './state-store.js';
import { MapController } from './map-controller.js';
import { getAuthoritativeRoute } from './route-service.js';
import { VehicleSimulator } from './vehicle-simulator.js';
import { VoiceGuidance } from './voice-guidance.js';
import { TelemetryController } from './telemetry-controller.js';
import { NavigationUI } from './navigation-ui.js';
import { filterCorridorIncidents } from './incident-corridor.js';

export async function bootstrapRitDrive() {
    console.log('🚀 [RIT DRIVE] Inicializando arquitetura modular Map-First...');

    // 1. Instanciação do Barramento de Estado
    const store = new StateStore();

    // 2. Controlador de Mapa Leaflet
    const mapController = new MapController('mapMobile', store, window.L);

    // 3. UI, Voz, Telemetria e Simulador
    const ui = new NavigationUI(store);
    const voice = new VoiceGuidance(store);
    const telemetry = new TelemetryController(store);
    const simulator = new VehicleSimulator(store);

    // 4. Integração do Loop de Simulação com Mapa, Voz e Filtro de Corredor
    simulator.onProgress(({ progressM, position, speedKmh, stepIndex, remainingDistM }) => {
        // Atualiza posição do veículo e orientação do marcador no Leaflet
        mapController.updateVehicle(position.lat, position.lon, position.heading);

        // Atualiza telemetria no painel
        store.updateNested('telemetry', {
            speedKmh,
            headingDeg: position.heading
        });

        // Avalia gatilhos de voz da próxima manobra
        const currentStep = store.getState().steps[stepIndex];
        if (currentStep) {
            const remStepDist = Math.max(0, currentStep.endOffsetM - progressM);
            voice.checkManeuverTriggers(currentStep, remStepDist);
        }

        // Filtra e re-ordena ocorrências do corredor baseando-se na nova posição do carro
        const rawIncidents = store.getState().incidents.rawList;
        const route = store.getState().route;
        if (route && rawIncidents.length > 0) {
            const eligible = filterCorridorIncidents(
                rawIncidents,
                route.coordinates,
                store.getState().cumulativeDistances,
                progressM,
                { corridorRadiusM: store.getState().incidents.corridorRadiusM }
            );

            store.updateNested('incidents', { eligible });
            mapController.renderIncidents(eligible);
            voice.checkIncidentTriggers(eligible);
        }
    });

    // 5. Tratamento de Eventos da Interface do Usuário
    const btnRecenter = document.getElementById('btn-recenter-floating');
    if (btnRecenter) {
        btnRecenter.addEventListener('click', () => mapController.recenterVehicle());
    }

    const btnVoice = document.getElementById('btn-toggle-voice');
    if (btnVoice) {
        btnVoice.addEventListener('click', () => voice.toggle());
    }

    const btnTel = document.getElementById('btn-toggle-telemetry');
    if (btnTel) {
        btnTel.addEventListener('click', () => telemetry.togglePanel());
    }

    const btnCloseTel = document.getElementById('btn-close-telemetry');
    if (btnCloseTel) {
        btnCloseTel.addEventListener('click', () => telemetry.closePanel());
    }

    const btnEndRoute = document.getElementById('btn-end-route');
    if (btnEndRoute) {
        btnEndRoute.addEventListener('click', () => {
            simulator.pause();
            store.resetNavigation();
            mapController.routeLayer.clearLayers();
            mapController.incidentsLayer.clearLayers();
        });
    }

    const btnSimToggle = document.getElementById('btn-sim-toggle');
    if (btnSimToggle) {
        btnSimToggle.addEventListener('click', () => {
            const isRunning = store.getState().simulation.running;
            if (isRunning) {
                simulator.pause();
                btnSimToggle.innerHTML = '<i class="fa-solid fa-play"></i> Simular';
            } else {
                simulator.start(store.getState().simulation.multiplier || 1);
                btnSimToggle.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
            }
        });
    }

    const selSimSpeed = document.getElementById('sim-speed-select');
    if (selSimSpeed) {
        selSimSpeed.addEventListener('change', (e) => {
            const mult = Number(e.target.value) || 1;
            simulator.setMultiplier(mult);
        });
    }

    // Gaveta de Detalhes
    const drawerHandle = document.getElementById('drawer-handle');
    const drawer = document.getElementById('nav-details-drawer');
    if (drawerHandle && drawer) {
        drawerHandle.addEventListener('click', () => {
            drawer.classList.toggle('expanded');
            setTimeout(() => mapController.invalidateSize(), 300);
        });
    }

    // Botões Rápidos de Destino
    document.querySelectorAll('.quick-dest-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const target = btn.dataset.target;
            await loadStrategicRoute(target, store, mapController, simulator);
        });
    });

    // 6. Carregamento de Ocorrências Autorizadas da Cidade
    loadOccurrences(store, mapController);

    // 7. Auto-inicialização com Rota de Boas-Vindas Autorizada (Projac ➔ SDU)
    setTimeout(async () => {
        await loadStrategicRoute('globo_projac_sdu', store, mapController, simulator);
    }, 600);

    // 8. Geolocalização Nativa com Fallback Gracioso
    initNativeGeolocation(store, telemetry);

    // Salva referência global segura para testes e depuração
    window.__RIT_DRIVE__ = {
        store,
        mapController,
        simulator,
        voice,
        telemetry,
        ui
    };

    return window.__RIT_DRIVE__;
}

async function loadStrategicRoute(targetId, store, mapController, simulator) {
    try {
        let origin = { lat: -22.9754, lon: -43.4116, label: 'Estúdios Globo (Projac)' };
        let dest = { lat: -22.9105, lon: -43.1631, label: 'Aeroporto Santos Dumont (SDU)' };

        if (targetId === 'barra_galeao') {
            origin = { lat: -23.0004, lon: -43.3659, label: 'Barra da Tijuca (Alvorada)' };
            dest = { lat: -22.8134, lon: -43.2494, label: 'Aeroporto Tom Jobim (Galeão)' };
        }

        const routeData = await getAuthoritativeRoute(origin, dest);

        store.setState({
            mode: 'navigating',
            route: routeData,
            cumulativeDistances: routeData.cumulativeDistances,
            steps: routeData.steps,
            routeProgressM: 0,
            currentStepIndex: 0,
            vehicle: {
                lat: routeData.coordinates[0][0],
                lon: routeData.coordinates[0][1],
                heading: 90,
                speedKmh: 0,
                remainingDistanceM: routeData.totalDistanceM,
                remainingDurationS: routeData.totalDurationS
            }
        });

        mapController.renderRoute(routeData.coordinates);
        mapController.updateVehicle(routeData.coordinates[0][0], routeData.coordinates[0][1], 90);

        // Dispara primeiro filtro de incidentes
        const rawIncidents = store.getState().incidents.rawList;
        if (rawIncidents.length > 0) {
            const eligible = filterCorridorIncidents(
                rawIncidents,
                routeData.coordinates,
                routeData.cumulativeDistances,
                0,
                { corridorRadiusM: store.getState().incidents.corridorRadiusM }
            );
            store.updateNested('incidents', { eligible });
            mapController.renderIncidents(eligible);
        }
    } catch (err) {
        console.warn('[RIT DRIVE] Falha ao carregar rota autorizada:', err.message);
    }
}

async function loadOccurrences(store, mapController) {
    try {
        const res = await fetch('/api/seguranca/ocorrencias?state=RJ&source=all');
        let occurrences = [];
        if (res.ok) {
            const data = await res.json();
            occurrences = data.ocorrencias || data.items || [];
        }

        // Fixtures de incidentes com base nas vias reais do Rio (se banco estiver sem eventos no dia)
        if (occurrences.length === 0) {
            occurrences = [
                {
                    id: 'inc_linha_amarela_delcastilho',
                    tipo: 'Acidente de Trânsito',
                    titulo: 'Acidente na Linha Amarela',
                    local: 'Linha Amarela, Saída 6 (Del Castilho)',
                    lat: -22.9072,
                    lon: -43.3089,
                    severidade: 'MODERADA'
                },
                {
                    id: 'inc_linha_vermelha_mare',
                    tipo: 'Alagamento',
                    titulo: 'Bolsão d\'Água',
                    local: 'Linha Vermelha, próx. Maré',
                    lat: -22.8680,
                    lon: -43.2350,
                    severidade: 'ALTA'
                },
                {
                    id: 'inc_av_brasil_benfica',
                    tipo: 'Blitz Policial',
                    titulo: 'Operação de Fiscalização',
                    local: 'Av. Brasil, pista lateral Benfica',
                    lat: -22.8920,
                    lon: -43.2410,
                    severidade: 'BAIXA'
                }
            ];
        }

        store.updateNested('incidents', { rawList: occurrences });
    } catch (e) {
        console.warn('[RIT DRIVE] Ocorrências offline, utilizando catálogo interno de segurança.');
    }
}

function initNativeGeolocation(store, telemetry) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            telemetry.updateFromGps(pos.coords);
        },
        (err) => {
            console.warn('[GPS] Permissão não concedida ou timeout (modo degradado seguro):', err.message);
        },
        { enableHighAccuracy: true, timeout: 6000 }
    );
}
