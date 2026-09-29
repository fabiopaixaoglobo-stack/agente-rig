/**
 * RIT DRIVE — Assistente de Voz Veicular (Web Speech API)
 * Síntese de voz com consentimento explícito, fila prioritária e antirrepetição.
 */

export class VoiceGuidance {
    constructor(stateStore) {
        this.store = stateStore;
        this.isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
        this.synth = this.isSupported ? window.speechSynthesis : null;
        this.selectedVoice = null;
        this.speechQueue = [];
        this.isSpeaking = false;
        this.lastSpeakTime = 0;
        this.cooldownMs = 2500;

        if (this.isSupported) {
            this._initVoices();
        }
    }

    _initVoices() {
        const load = () => {
            const voices = this.synth.getVoices();
            this.selectedVoice = voices.find(v => v.lang === 'pt-BR') ||
                                 voices.find(v => v.lang.startsWith('pt')) ||
                                 voices[0] || null;
        };

        load();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = load;
        }
    }

    enable() {
        if (!this.isSupported) return false;
        this.store.updateNested('voice', { enabled: true, muted: false });
        this.speak('Navegação por voz do RIT Drive ativada.', { priority: true });
        return true;
    }

    disable() {
        this.cancel();
        this.store.updateNested('voice', { enabled: false });
    }

    toggle() {
        const state = this.store.getState().voice;
        if (state.enabled) {
            this.disable();
            return false;
        } else {
            return this.enable();
        }
    }

    cancel() {
        if (this.synth) {
            this.synth.cancel();
        }
        this.speechQueue = [];
        this.isSpeaking = false;
    }

    /**
     * Fala uma instrução com controle de prioridade e fila.
     */
    speak(text, options = {}) {
        const voiceState = this.store.getState().voice;
        if (!this.isSupported || !voiceState.enabled || voiceState.muted) return;
        if (!text || typeof text !== 'string') return;

        const { priority = false, cancelCurrent = false } = options;

        if (cancelCurrent) {
            this.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) utterance.voice = this.selectedVoice;
        utterance.lang = 'pt-BR';
        utterance.rate = 1.05; // Leve aceleração para clareza veicular
        utterance.pitch = 1.0;

        utterance.onend = () => {
            this.isSpeaking = false;
            this.lastSpeakTime = Date.now();
            this._processQueue();
        };

        utterance.onerror = (e) => {
            console.warn('[VOICE] Erro na síntese de voz:', e.error);
            this.isSpeaking = false;
            this._processQueue();
        };

        if (priority) {
            this.speechQueue.unshift(utterance);
        } else {
            this.speechQueue.push(utterance);
        }

        if (!this.isSpeaking) {
            this._processQueue();
        }
    }

    _processQueue() {
        if (this.isSpeaking || this.speechQueue.length === 0) return;

        const item = this.speechQueue.shift();
        this.isSpeaking = true;
        try {
            this.synth.speak(item);
        } catch (err) {
            console.warn('[VOICE] Falha ao disparar fala:', err.message);
            this.isSpeaking = false;
        }
    }

    /**
     * Avalia progresso da rota e dispara anúncios nos gatilhos (500m, 150m, curva).
     */
    checkManeuverTriggers(currentStep, remainingStepDistM) {
        if (!currentStep) return;
        const voiceState = this.store.getState().voice;
        const stepIdx = currentStep.stepIndex;

        // Gatilho 1: 500m
        if (remainingStepDistM <= 520 && remainingStepDistM > 420) {
            const key = `step_${stepIdx}_500`;
            if (!voiceState.announcedManeuverKeys.has(key)) {
                voiceState.announcedManeuverKeys.add(key);
                this.speak(`Em quinhentos metros, ${currentStep.instruction}.`);
            }
        }
        // Gatilho 2: 150m
        else if (remainingStepDistM <= 180 && remainingStepDistM > 100) {
            const key = `step_${stepIdx}_150`;
            if (!voiceState.announcedManeuverKeys.has(key)) {
                voiceState.announcedManeuverKeys.add(key);
                this.speak(`Em cento e cinquenta metros, ${currentStep.instruction}.`);
            }
        }
        // Gatilho 3: Imediato (< 40m)
        else if (remainingStepDistM <= 40 && remainingStepDistM > 10) {
            const key = `step_${stepIdx}_now`;
            if (!voiceState.announcedManeuverKeys.has(key)) {
                voiceState.announcedManeuverKeys.add(key);
                this.speak(`Agora, ${currentStep.instruction}.`);
            }
        }
    }

    /**
     * Avalia incidentes elegíveis à frente e anuncia alertas críticos.
     */
    checkIncidentTriggers(eligibleIncidents) {
        if (!Array.isArray(eligibleIncidents) || eligibleIncidents.length === 0) return;
        const voiceState = this.store.getState().voice;

        for (const inc of eligibleIncidents) {
            // Alerta sonoro disparado quando o carro está entre 150m e 400m do incidente
            if (inc.remainingDistanceM <= 400 && inc.remainingDistanceM >= 100) {
                if (!voiceState.announcedIncidentIds.has(inc.incidentId)) {
                    voiceState.announcedIncidentIds.add(inc.incidentId);

                    const alertMsg = `Atenção: ${inc.title} reportado a ${inc.remainingDistanceM} metros.`;
                    this.speak(alertMsg, { priority: true });
                    break;
                }
            }
        }
    }
}
