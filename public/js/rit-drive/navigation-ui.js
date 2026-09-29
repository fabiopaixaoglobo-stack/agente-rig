/**
 * RIT DRIVE — Gerenciador de Interface de Navegação (Navigation UI)
 * Atualiza o Top Maneuver Banner, Bottom HUD, botões flutuantes e gavetas sob demanda.
 */

import { getManeuverSvg } from '../../icons/rit-drive/maneuver-icons.js';
import { getIncidentSvg } from '../../icons/rit-drive/incident-icons.js';
import { formatDistance, formatDuration } from './maneuver-parser.js';

export class NavigationUI {
    constructor(stateStore) {
        this.store = stateStore;
        this.elements = {};
        this._cacheDOMElements();
        this._bindStoreEvents();
    }

    _cacheDOMElements() {
        this.elements = {
            topBanner: document.getElementById('nav-top-banner'),
            maneuverIcon: document.getElementById('maneuver-icon-container'),
            maneuverDistance: document.getElementById('maneuver-distance-text'),
            maneuverStreet: document.getElementById('maneuver-street-text'),
            subManeuverRow: document.getElementById('sub-maneuver-row'),
            subManeuverIcon: document.getElementById('sub-maneuver-icon'),
            subManeuverText: document.getElementById('sub-maneuver-text'),

            searchBar: document.getElementById('nav-search-bar'),
            bottomHud: document.getElementById('nav-bottom-hud'),
            hudDuration: document.getElementById('hud-duration-val'),
            hudDistance: document.getElementById('hud-distance-val'),
            hudEta: document.getElementById('hud-eta-val'),
            btnEndRoute: document.getElementById('btn-end-route'),

            btnRecenter: document.getElementById('btn-recenter-floating'),
            btnVoice: document.getElementById('btn-toggle-voice'),
            btnTelemetry: document.getElementById('btn-toggle-telemetry'),
            btnIncidentsPill: document.getElementById('btn-incidents-corridor-pill'),
            incidentsCountBadge: document.getElementById('incidents-corridor-count'),

            drawer: document.getElementById('nav-details-drawer'),
            drawerHandle: document.getElementById('drawer-handle'),
            drawerIncidentsList: document.getElementById('drawer-incidents-list'),
            drawerCamerasList: document.getElementById('drawer-cameras-list'),

            telemetryPanel: document.getElementById('nav-telemetry-panel'),
            telemetrySpeed: document.getElementById('tel-speed-val'),
            telemetryHeading: document.getElementById('tel-heading-val'),
            telemetryBattery: document.getElementById('tel-battery-val'),
            telemetryNetwork: document.getElementById('tel-network-val'),
            telemetryAltitude: document.getElementById('tel-altitude-val'),
            telemetryAccuracy: document.getElementById('tel-accuracy-val'),
            btnCloseTelemetry: document.getElementById('btn-close-telemetry')
        };
    }

    _bindStoreEvents() {
        // 1. Atualização do Top Banner e Passos de Manobra
        this.store.subscribe('currentStepIndex', (stepIdx) => {
            this.updateManeuverBanner(stepIdx);
        });

        // 2. Atualização de Posição / Veículo / HUD Inferior
        this.store.subscribe('vehicle', (veh) => {
            this.updateBottomHud(veh);
            this.updateManeuverDistance(veh);
        });

        // 3. Atualização de Câmera / Botão Recentralizar
        this.store.subscribe('camera', (cam) => {
            if (this.elements.btnRecenter) {
                if (cam.followVehicle) {
                    this.elements.btnRecenter.style.display = 'none';
                } else {
                    this.elements.btnRecenter.style.display = 'flex';
                }
            }
        });

        // 4. Atualização do Estado de Voz
        this.store.subscribe('voice', (voice) => {
            if (this.elements.btnVoice) {
                if (voice.enabled && !voice.muted) {
                    this.elements.btnVoice.classList.add('voice-active');
                    this.elements.btnVoice.setAttribute('aria-label', 'Voz ativada');
                    this.elements.btnVoice.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
                } else {
                    this.elements.btnVoice.classList.remove('voice-active');
                    this.elements.btnVoice.setAttribute('aria-label', 'Voz desativada');
                    this.elements.btnVoice.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
                }
            }
        });

        // 5. Atualização da Telemetria Sob Demanda
        this.store.subscribe('telemetry', (tel) => {
            this.updateTelemetryPanel(tel);
        });

        // 6. Atualização do Modo (idle vs navigating vs arrived)
        this.store.subscribe('mode', (mode) => {
            if (mode === 'navigating') {
                if (this.elements.searchBar) this.elements.searchBar.style.display = 'none';
                if (this.elements.topBanner) this.elements.topBanner.style.display = 'flex';
                if (this.elements.bottomHud) this.elements.bottomHud.style.display = 'flex';
            } else if (mode === 'idle') {
                if (this.elements.searchBar) this.elements.searchBar.style.display = 'block';
                if (this.elements.topBanner) this.elements.topBanner.style.display = 'none';
                if (this.elements.bottomHud) this.elements.bottomHud.style.display = 'none';
            } else if (mode === 'arrived') {
                this.showArrivalBanner();
            }
        });

        // 7. Atualização do Resumo de Ocorrências no Corredor
        this.store.subscribe('incidents', (incidents) => {
            this.updateIncidentsPill(incidents.eligible);
            this.renderDrawerIncidents(incidents.eligible);
        });
    }

    updateManeuverBanner(stepIdx) {
        const state = this.store.getState();
        const steps = state.steps;
        if (!Array.isArray(steps) || steps.length === 0) return;

        const currentStep = steps[stepIdx] || steps[0];
        const nextStep = steps[stepIdx + 1] || null;

        if (this.elements.maneuverIcon) {
            this.elements.maneuverIcon.innerHTML = getManeuverSvg(currentStep.type, '#FFFFFF', 34);
        }
        if (this.elements.maneuverStreet) {
            this.elements.maneuverStreet.textContent = currentStep.streetName || 'Via monitorada';
        }

        // Sub-banner "Em seguida"
        if (this.elements.subManeuverRow) {
            if (nextStep) {
                this.elements.subManeuverRow.style.display = 'flex';
                if (this.elements.subManeuverIcon) {
                    this.elements.subManeuverIcon.innerHTML = getManeuverSvg(nextStep.type, '#94A3B8', 18);
                }
                if (this.elements.subManeuverText) {
                    this.elements.subManeuverText.textContent = `depois, ${nextStep.streetName}`;
                }
            } else {
                this.elements.subManeuverRow.style.display = 'none';
            }
        }
    }

    updateManeuverDistance(veh) {
        const state = this.store.getState();
        const steps = state.steps;
        const currentStep = steps[state.currentStepIndex];
        if (!currentStep) return;

        const progressM = state.routeProgressM || 0;
        const remainingToTurnM = Math.max(0, currentStep.endOffsetM - progressM);

        if (this.elements.maneuverDistance) {
            this.elements.maneuverDistance.textContent = formatDistance(remainingToTurnM);
        }
    }

    updateBottomHud(veh) {
        if (!veh) return;

        if (this.elements.hudDuration) {
            this.elements.hudDuration.textContent = formatDuration(veh.remainingDurationS);
        }
        if (this.elements.hudDistance) {
            this.elements.hudDistance.textContent = formatDistance(veh.remainingDistanceM);
        }
        if (this.elements.hudEta) {
            const now = new Date();
            now.setSeconds(now.getSeconds() + (veh.remainingDurationS || 0));
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            this.elements.hudEta.textContent = `ETA ${hh}:${mm}`;
        }
    }

    updateIncidentsPill(eligibleIncidents) {
        if (!this.elements.btnIncidentsPill || !this.elements.incidentsCountBadge) return;
        const count = Array.isArray(eligibleIncidents) ? eligibleIncidents.length : 0;

        this.elements.incidentsCountBadge.textContent = count;
        if (count > 0) {
            this.elements.btnIncidentsPill.classList.add('has-incidents');
        } else {
            this.elements.btnIncidentsPill.classList.remove('has-incidents');
        }
    }

    renderDrawerIncidents(eligibleIncidents) {
        if (!this.elements.drawerIncidentsList) return;
        if (!Array.isArray(eligibleIncidents) || eligibleIncidents.length === 0) {
            this.elements.drawerIncidentsList.innerHTML = `
                <div style="padding:16px; text-align:center; color:#64748B; font-size:12px;">
                    ✅ Nenhuma ocorrência grave detectada no corredor à frente da corrida.
                </div>
            `;
            return;
        }

        this.elements.drawerIncidentsList.innerHTML = eligibleIncidents.map(inc => `
            <div class="drawer-incident-card severity-${inc.severity.toLowerCase()}">
                <div class="incident-card-icon">
                    ${getIncidentSvg(inc.type, 36)}
                </div>
                <div class="incident-card-details">
                    <div class="incident-card-title">${inc.title}</div>
                    <div class="incident-card-loc">📍 ${inc.locationName}</div>
                    <div class="incident-card-dist">A ${inc.remainingDistanceM} m à frente na sua rota</div>
                </div>
                <div class="incident-card-badge">${inc.severity}</div>
            </div>
        `).join('');
    }

    updateTelemetryPanel(tel) {
        if (!this.elements.telemetryPanel) return;

        if (tel.open) {
            this.elements.telemetryPanel.classList.add('active');
        } else {
            this.elements.telemetryPanel.classList.remove('active');
        }

        if (this.elements.telemetrySpeed) {
            this.elements.telemetrySpeed.textContent = tel.speedKmh ?? '--';
        }
        if (this.elements.telemetryHeading) {
            this.elements.telemetryHeading.textContent = tel.headingDeg != null ? `${tel.headingDeg}°` : '--°';
        }
        if (this.elements.telemetryBattery) {
            this.elements.telemetryBattery.textContent = tel.batteryPercent != null ? `${tel.batteryPercent}%` : '--%';
        }
        if (this.elements.telemetryNetwork) {
            this.elements.telemetryNetwork.textContent = tel.networkType || '--';
        }
        if (this.elements.telemetryAltitude) {
            this.elements.telemetryAltitude.textContent = tel.altitudeM != null ? `${tel.altitudeM} m` : '--';
        }
        if (this.elements.telemetryAccuracy) {
            this.elements.telemetryAccuracy.textContent = tel.accuracyM != null ? `±${tel.accuracyM} m` : '--';
        }
    }

    showArrivalBanner() {
        if (this.elements.maneuverStreet) {
            this.elements.maneuverStreet.textContent = 'Destino alcançado!';
        }
        if (this.elements.maneuverDistance) {
            this.elements.maneuverDistance.textContent = 'Chegou';
        }
        if (this.elements.hudDuration) {
            this.elements.hudDuration.textContent = '0 min';
        }
    }
}
