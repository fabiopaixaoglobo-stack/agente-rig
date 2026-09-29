/**
 * RIT DRIVE — Test Harness Script (Diagnóstico & Simulação)
 * Reutiliza 100% dos módulos oficiais de navegação sem duplicar motores.
 */

import { bootstrapRitDrive } from '../rit-drive/bootstrap.js';
import { interpolatePositionAtDistance } from '../rit-drive/route-progress.js';
import { filterCorridorIncidents } from '../rit-drive/incident-corridor.js';

let ritInstance = null;
const eventLogs = [];

function logEvent(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const line = `[${timestamp}] ${msg}`;
    eventLogs.push(line);
    if (eventLogs.length > 30) eventLogs.shift();

    const term = document.getElementById('test-events-log');
    if (term) {
        term.innerHTML = eventLogs.map(l => `<div class="log-line">${l}</div>`).join('');
        term.scrollTop = term.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    logEvent('Inicializando RIT Drive Test Harness...', 'info');

    // 1. Inicializa o aplicativo completo dentro do container isolado
    ritInstance = await bootstrapRitDrive();
    logEvent('Módulos principais (Map, Store, Sim, Voice) instanciados.');

    // 2. Seletor de Viewport Presets
    const container = document.getElementById('test-canvas-container');
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const w = btn.dataset.w;
            const h = btn.dataset.h;
            container.style.width = w;
            container.style.height = h;

            logEvent(`Viewport alterada para ${w} x ${h}`);
            setTimeout(() => {
                if (ritInstance && ritInstance.mapController) {
                    ritInstance.mapController.invalidateSize();
                }
            }, 350);
        });
    });

    // 3. Controles do Motor de Simulação
    const btnSimToggle = document.getElementById('btn-test-sim-toggle');
    if (btnSimToggle) {
        btnSimToggle.addEventListener('click', () => {
            const isRunning = ritInstance.store.getState().simulation.running;
            if (isRunning) {
                ritInstance.simulator.pause();
                btnSimToggle.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar';
                logEvent('Simulação pausada.');
            } else {
                ritInstance.simulator.start(ritInstance.store.getState().simulation.multiplier || 5);
                btnSimToggle.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
                logEvent('Simulação iniciada em ' + ritInstance.store.getState().simulation.multiplier + 'x');
            }
        });
    }

    const btnSimStep = document.getElementById('btn-test-sim-step');
    if (btnSimStep) {
        btnSimStep.addEventListener('click', () => {
            ritInstance.simulator.stepForward(300);
            logEvent('Avançado passo manual +300m.');
        });
    }

    const btnSimRestart = document.getElementById('btn-test-sim-restart');
    if (btnSimRestart) {
        btnSimRestart.addEventListener('click', () => {
            ritInstance.simulator.restart();
            if (btnSimToggle) btnSimToggle.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar';
            logEvent('Simulação reiniciada para o km 0.');
        });
    }

    document.querySelectorAll('.speed-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.speed-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const mult = Number(chip.dataset.speed) || 1;
            ritInstance.simulator.setMultiplier(mult);
            logEvent(`Velocidade de simulação ajustada para ${mult}x`);
        });
    });

    // 4. Injetor de Ocorrências Sintéticas (source: 'test')
    document.querySelectorAll('.btn-inject').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const pos = btn.dataset.pos;
            injectSyntheticIncident(type, pos);
        });
    });

    // 5. Teste de Voz
    const btnSpeech = document.getElementById('btn-test-speech');
    if (btnSpeech) {
        btnSpeech.addEventListener('click', () => {
            ritInstance.voice.enable();
            ritInstance.voice.speak('Atenção: Em duzentos metros, vire à direita na Linha Amarela.', { priority: true });
            logEvent('Disparado teste de fala sintética pt-BR.');
        });
    }
});

function injectSyntheticIncident(type, positionType) {
    const state = ritInstance.store.getState();
    const route = state.route;
    if (!route) {
        logEvent('Nenhuma rota ativa para injetar incidente.', 'warn');
        return;
    }

    const currentOffset = state.routeProgressM || 0;
    const cum = state.cumulativeDistances;
    let targetOffset = currentOffset;
    let latOffset = 0;
    let lonOffset = 0;

    if (positionType === 'ahead') {
        targetOffset = Math.min(route.totalDistanceM - 100, currentOffset + 450);
    } else if (positionType === 'behind') {
        targetOffset = Math.max(0, currentOffset - 400);
    } else if (positionType === 'lateral') {
        targetOffset = currentOffset + 300;
        latOffset = 0.008; // ~880 metros fora do corredor
    }

    const pos = interpolatePositionAtDistance(targetOffset, route.coordinates, cum);
    const incidentLat = pos.lat + latOffset;
    const incidentLon = pos.lon + lonOffset;

    const testIncident = {
        id: `test_inc_${Date.now()}`,
        tipo: type,
        titulo: `[TESTE] ${type.toUpperCase()}`,
        local: 'Pista de Teste Simulado',
        lat: incidentLat,
        lon: incidentLon,
        source: 'test', // Explicitamente marcado como teste
        severidade: type === 'tiroteio' ? 'ALTA' : 'MODERADA'
    };

    const currentList = state.incidents.rawList;
    const updatedList = [testIncident, ...currentList];
    ritInstance.store.updateNested('incidents', { rawList: updatedList });

    // Avalia elegibilidade
    const eligible = filterCorridorIncidents(
        updatedList,
        route.coordinates,
        cum,
        currentOffset,
        { corridorRadiusM: state.incidents.corridorRadiusM }
    );

    const isAccepted = eligible.some(e => e.incidentId === testIncident.id);

    if (isAccepted) {
        logEvent(`[INJEÇÃO] ${testIncident.titulo} aprovado no corredor (+${Math.round(targetOffset - currentOffset)}m).`);
    } else {
        logEvent(`[INJEÇÃO] ${testIncident.titulo} REJEITADO pelo filtro (${positionType === 'behind' ? 'atrás do veículo' : 'fora do raio'}).`);
    }

    ritInstance.store.updateNested('incidents', { eligible });
    ritInstance.mapController.renderIncidents(eligible);
}
