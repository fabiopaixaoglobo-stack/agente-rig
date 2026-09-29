/**
 * RIT DRIVE — Controlador de Telemetria e Sensores Sob Demanda
 * Coleta dados do dispositivo com feature detection e permanece fechado por padrão.
 */

export class TelemetryController {
    constructor(stateStore) {
        this.store = stateStore;
        this.pingTimer = null;
        this._initSensors();
    }

    _initSensors() {
        if (typeof window === 'undefined') return;

        // 1. Feature Detection: Battery API
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                const updateBat = () => {
                    const pct = Math.round(battery.level * 100);
                    this.store.updateNested('telemetry', {
                        batteryPercent: Math.max(0, Math.min(pct, 100)),
                        batteryCharging: Boolean(battery.charging)
                    });
                };
                updateBat();
                battery.addEventListener('levelchange', updateBat);
                battery.addEventListener('chargingchange', updateBat);
            }).catch(() => {});
        }

        // 2. Feature Detection: Network Information API
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            const updateNet = () => {
                const netType = conn.effectiveType ? conn.effectiveType.toUpperCase() : (conn.type || 'ONLINE');
                this.store.updateNested('telemetry', { networkType: netType });
            };
            updateNet();
            conn.addEventListener('change', updateNet);
        }

        // 3. Feature Detection: DeviceOrientation (Bússola / Giroscópio)
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (e) => {
                const isSimulating = this.store.getState().simulation.running;
                if (isSimulating) return;

                let heading = e.webkitCompassHeading || (360 - e.alpha);
                if (heading != null && !isNaN(heading)) {
                    heading = ((Math.round(heading) % 360) + 360) % 360;
                    this.store.updateNested('telemetry', { headingDeg: heading });
                }
            }, true);
        }

        // 4. Inicia ping periódico de telemetria segura
        this.pingTimer = setInterval(() => this.sendTelemetryPing(), 10000);
    }

    updateFromGps(coords) {
        if (!coords) return;
        const isSimulating = this.store.getState().simulation.running;
        if (isSimulating) return;

        const speedKmh = coords.speed != null ? Math.round(coords.speed * 3.6) : null;
        const altitude = coords.altitude != null ? Math.round(coords.altitude) : null;
        const accuracy = coords.accuracy != null ? Math.round(coords.accuracy) : null;
        const heading = coords.heading != null ? Math.round(coords.heading) : null;

        this.store.updateNested('telemetry', {
            speedKmh: speedKmh != null ? Math.min(speedKmh, 160) : 0,
            altitudeM: altitude,
            accuracyM: accuracy,
            headingDeg: heading != null ? ((heading % 360) + 360) % 360 : this.store.getState().telemetry.headingDeg
        });
    }

    togglePanel() {
        const current = this.store.getState().telemetry.open;
        this.store.updateNested('telemetry', { open: !current });
        return !current;
    }

    closePanel() {
        this.store.updateNested('telemetry', { open: false });
    }

    async sendTelemetryPing() {
        const state = this.store.getState();
        const tel = state.telemetry;
        const veh = state.vehicle;

        // Se inativo e painel fechado, economiza tráfego
        if (state.mode === 'idle' && !tel.open) return;

        try {
            await fetch('/api/telemetria/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    speed: state.simulation.running ? veh.speedKmh : (tel.speedKmh || 0),
                    heading: state.simulation.running ? veh.heading : (tel.headingDeg || 0),
                    battery: tel.batteryPercent,
                    network: tel.networkType,
                    lat: veh.lat,
                    lon: veh.lon,
                    altitude: tel.altitudeM,
                    accuracy: tel.accuracyM
                })
            });
            this.store.updateNested('telemetry', { lastPingTimestamp: new Date().toISOString() });
        } catch (_) {}
    }

    destroy() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
}
