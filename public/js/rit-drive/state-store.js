/**
 * RIT DRIVE — Gerenciador de Estado Centralizado (State Store)
 * Barramento reativo de estado para a navegação veicular e ambiente de testes.
 */

export class StateStore {
    constructor(customInitialState = {}) {
        this.listeners = new Map();

        this.state = {
            mode: 'idle', // 'idle' | 'navigating' | 'arrived'
            route: null,
            cumulativeDistances: [],
            steps: [],
            routeProgressM: 0,
            currentStepIndex: 0,
            vehicle: {
                lat: null,
                lon: null,
                heading: 0,
                speedKmh: 0,
                remainingDistanceM: 0,
                remainingDurationS: 0
            },
            camera: {
                followVehicle: true,
                userMovedMap: false
            },
            voice: {
                enabled: false,
                supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
                muted: false,
                announcedManeuverKeys: new Set(),
                announcedIncidentIds: new Set()
            },
            telemetry: {
                open: false,
                speedKmh: 0,
                headingDeg: 0,
                batteryPercent: null,
                batteryCharging: false,
                networkType: 'Online',
                altitudeM: null,
                accuracyM: null,
                lastPingTimestamp: null
            },
            incidents: {
                corridorRadiusM: 200,
                rawList: [],
                eligible: [],
                highestSeverity: 'BAIXA'
            },
            messages: {
                unreadCount: 0,
                list: [
                    {
                        id: 'msg_welcome',
                        time: 'Hoje',
                        sender: 'CICC / Agente RIT',
                        text: 'Monitoramento tático de rotas ativo. Boa viagem.'
                    }
                ]
            },
            simulation: {
                running: false,
                multiplier: 1,
                lastTickTime: 0
            },
            ...customInitialState
        };
    }

    getState() {
        return this.state;
    }

    setState(partialState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...partialState };

        for (const [key, value] of Object.entries(partialState)) {
            if (this.listeners.has(key)) {
                this.listeners.get(key).forEach(cb => cb(value, prevState[key], this.state));
            }
        }

        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => cb(this.state, prevState));
        }
    }

    updateNested(key, partialNested) {
        const current = this.state[key] || {};
        this.setState({
            [key]: { ...current, ...partialNested }
        });
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);

        return () => {
            if (this.listeners.has(key)) {
                this.listeners.get(key).delete(callback);
            }
        };
    }

    resetNavigation() {
        this.setState({
            mode: 'idle',
            routeProgressM: 0,
            currentStepIndex: 0,
            camera: { followVehicle: true, userMovedMap: false },
            voice: {
                ...this.state.voice,
                announcedManeuverKeys: new Set(),
                announcedIncidentIds: new Set()
            },
            simulation: {
                running: false,
                multiplier: 1,
                lastTickTime: 0
            }
        });
    }
}
