/**
 * RIT DRIVE — Simulador de Navegação Veicular Dinâmica
 * Utiliza relógio monotônico com performance.now() para progressão determinística independente de FPS.
 */

import { interpolatePositionAtDistance } from './route-progress.js';

export class VehicleSimulator {
    constructor(stateStore, options = {}) {
        this.store = stateStore;
        this.options = {
            baseSpeedKmh: 48,
            ...options
        };

        this.animFrameId = null;
        this.lastTimestamp = null;
        this.onProgressCallbacks = new Set();
    }

    onProgress(callback) {
        this.onProgressCallbacks.add(callback);
        return () => this.onProgressCallbacks.delete(callback);
    }

    start(multiplier = 1) {
        const state = this.store.getState();
        if (!state.route || !state.cumulativeDistances || state.cumulativeDistances.length < 2) {
            console.warn('[SIMULATOR] Nenhuma rota ativa para simular.');
            return false;
        }

        this.store.setState({
            mode: 'navigating',
            simulation: {
                running: true,
                multiplier: Math.max(1, Math.min(multiplier, 20)),
                lastTickTime: performance.now()
            }
        });

        this.lastTimestamp = performance.now();
        this._loop();
        return true;
    }

    pause() {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
        this.lastTimestamp = null;

        this.store.updateNested('simulation', { running: false });
    }

    setMultiplier(mult) {
        const validMult = Math.max(1, Math.min(Number(mult) || 1, 20));
        this.store.updateNested('simulation', { multiplier: validMult });
    }

    restart() {
        this.pause();
        const state = this.store.getState();
        const route = state.route;

        if (route && route.coordinates && route.coordinates.length > 0) {
            const firstPt = route.coordinates[0];
            const initialHeading = route.coordinates.length > 1
                ? Math.round(state.vehicle.heading || 0)
                : 0;

            this.store.setState({
                mode: 'idle',
                routeProgressM: 0,
                currentStepIndex: 0,
                vehicle: {
                    lat: firstPt[0],
                    lon: firstPt[1],
                    heading: initialHeading,
                    speedKmh: 0,
                    remainingDistanceM: route.totalDistanceM,
                    remainingDurationS: route.totalDurationS
                },
                camera: { followVehicle: true, userMovedMap: false },
                voice: {
                    ...state.voice,
                    announcedManeuverKeys: new Set(),
                    announcedIncidentIds: new Set()
                },
                simulation: {
                    running: false,
                    multiplier: state.simulation.multiplier || 1,
                    lastTickTime: 0
                }
            });
        }
    }

    stepForward(deltaMeters = 300) {
        const state = this.store.getState();
        if (!state.route) return;

        const totalDist = state.route.totalDistanceM;
        const nextProgress = Math.min(totalDist, (state.routeProgressM || 0) + deltaMeters);
        this._applyProgress(nextProgress, state.simulation.multiplier || 1);
    }

    _loop() {
        const state = this.store.getState();
        if (!state.simulation.running) return;

        const now = performance.now();
        if (!this.lastTimestamp) this.lastTimestamp = now;

        const deltaSeconds = Math.min(0.2, (now - this.lastTimestamp) / 1000);
        this.lastTimestamp = now;

        // Velocidade base em m/s multiplicada pelo fator de aceleração
        const speedMps = (this.options.baseSpeedKmh / 3.6) * state.simulation.multiplier;
        const deltaMeters = speedMps * deltaSeconds;

        const nextProgress = (state.routeProgressM || 0) + deltaMeters;
        this._applyProgress(nextProgress, state.simulation.multiplier);

        if (nextProgress < state.route.totalDistanceM) {
            this.animFrameId = requestAnimationFrame(() => this._loop());
        } else {
            this._onArrival();
        }
    }

    _applyProgress(currentProgressM, multiplier) {
        const state = this.store.getState();
        const route = state.route;
        const cumDist = state.cumulativeDistances;

        const totalDist = route.totalDistanceM;
        const clampedProgress = Math.min(totalDist, currentProgressM);

        const pos = interpolatePositionAtDistance(clampedProgress, route.coordinates, cumDist);

        // Flutuação realista de velocidade (ex: 42 a 62 km/h ajustada)
        const simSpeed = Math.round(this.options.baseSpeedKmh * (0.95 + Math.sin(clampedProgress / 800) * 0.15));

        // Atualiza passo da manobra ativa
        const currentStepIndex = this._determineCurrentStep(clampedProgress, state.steps);

        const remainingDist = Math.max(0, totalDist - clampedProgress);
        const remainingDurationS = Math.round((remainingDist / (this.options.baseSpeedKmh / 3.6)));

        this.store.setState({
            routeProgressM: clampedProgress,
            currentStepIndex,
            vehicle: {
                lat: pos.lat,
                lon: pos.lon,
                heading: pos.heading,
                speedKmh: simSpeed,
                remainingDistanceM: remainingDist,
                remainingDurationS
            }
        });

        this.onProgressCallbacks.forEach(cb => cb({
            progressM: clampedProgress,
            position: pos,
            speedKmh: simSpeed,
            stepIndex: currentStepIndex,
            remainingDistM: remainingDist
        }));
    }

    _determineCurrentStep(progressM, steps) {
        if (!Array.isArray(steps) || steps.length === 0) return 0;
        for (let i = 0; i < steps.length; i++) {
            if (progressM >= steps[i].startOffsetM && progressM < steps[i].endOffsetM) {
                return i;
            }
        }
        return steps.length - 1;
    }

    _onArrival() {
        this.pause();
        this.store.setState({
            mode: 'arrived',
            routeProgressM: this.store.getState().route.totalDistanceM,
            vehicle: {
                ...this.store.getState().vehicle,
                speedKmh: 0,
                remainingDistanceM: 0,
                remainingDurationS: 0
            }
        });
    }
}
