/**
 * Browser Web Audio adapter for 16 kHz mono 16-bit PCM microphone capture
 * (20 ms / 640-byte frames with RMS & peak telemetry) and 16 kHz PCM playback.
 *
 * Uses the hardware default AudioContext sample rate so createMediaStreamSource()
 * works cleanly across Chrome, Firefox, and Safari, downsampling mic frames to
 * exact 16 kHz 20 ms chunks.
 */

const DEFAULT_ROBOT_AUDIO_SAMPLE_RATE = 16000;
const DEFAULT_ROBOT_AUDIO_FRAME_BYTES = 640;
const SAMPLES_PER_FRAME = DEFAULT_ROBOT_AUDIO_FRAME_BYTES / 2;

export class BrowserRobotAudioAdapter {
	#audioContext: AudioContext | undefined;
	#gainNode: GainNode | undefined;
	#nextPlayTime = 0;

	#micStream: MediaStream | undefined;
	#micSource: MediaStreamAudioSourceNode | undefined;
	#micProcessor: ScriptProcessorNode | undefined;
	#micSilentSink: GainNode | undefined;
	#micActive = false;
	#micCounter = 0;
	#micCarry: number[] = [];

	get micActive(): boolean {
		return this.#micActive;
	}

	get micSupported(): boolean {
		return (
			typeof navigator !== "undefined" &&
			Boolean(navigator.mediaDevices?.getUserMedia)
		);
	}

	async unlock(): Promise<void> {
		const ctx = this.#ensureContext();
		if (ctx && ctx.state === "suspended") {
			try {
				await ctx.resume();
			} catch {
				// Browser autoplay policies may defer resume until a user gesture.
			}
		}
	}

	#ensureContext(): AudioContext | undefined {
		if (this.#audioContext) {
			return this.#audioContext;
		}
		if (typeof AudioContext === "undefined") {
			return undefined;
		}
		const ctx = new AudioContext();
		const gain = ctx.createGain();
		gain.gain.value = 0.85;
		gain.connect(ctx.destination);
		this.#audioContext = ctx;
		this.#gainNode = gain;
		this.#nextPlayTime = 0;
		return ctx;
	}

	playSpeakerPcm(pcmBytes: Uint8Array, volumePercent = 80): void {
		const ctx = this.#ensureContext();
		if (!ctx || !this.#gainNode || pcmBytes.byteLength < 2) {
			return;
		}
		if (ctx.state === "suspended") {
			void ctx.resume().catch(() => {});
		}
		this.#gainNode.gain.value = Math.max(0, Math.min(1, volumePercent / 100));

		const sampleCount = pcmBytes.byteLength >> 1;
		const buffer = ctx.createBuffer(
			1,
			sampleCount,
			DEFAULT_ROBOT_AUDIO_SAMPLE_RATE,
		);
		const channel = buffer.getChannelData(0);
		const view = new DataView(
			pcmBytes.buffer,
			pcmBytes.byteOffset,
			pcmBytes.byteLength,
		);
		for (let i = 0; i < sampleCount; i += 1) {
			channel[i] = view.getInt16(i * 2, true) / 32768;
		}

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(this.#gainNode);

		const now = ctx.currentTime;
		const startAt = Math.max(now + 0.015, this.#nextPlayTime);
		source.start(startAt);
		this.#nextPlayTime = startAt + buffer.duration;
	}

	stopSpeaker(): void {
		this.#nextPlayTime = 0;
	}

	async startMicrophone(
		onFrame: (
			counter: number,
			pcm: Uint8Array,
			rms: number,
			peak: number,
		) => void,
	): Promise<boolean> {
		if (this.#micActive) {
			return true;
		}
		if (
			typeof navigator === "undefined" ||
			!navigator.mediaDevices?.getUserMedia
		) {
			return false;
		}
		const ctx = this.#ensureContext();
		if (!ctx) {
			return false;
		}
		await this.unlock();

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
			video: false,
		});

		const source = ctx.createMediaStreamSource(stream);
		const processor = ctx.createScriptProcessor(1024, 1, 1);
		const silentSink = ctx.createGain();
		silentSink.gain.value = 0;
		const ratio = ctx.sampleRate / DEFAULT_ROBOT_AUDIO_SAMPLE_RATE;

		processor.onaudioprocess = (event) => {
			if (!this.#micActive) {
				return;
			}
			const input = event.inputBuffer.getChannelData(0);
			if (Math.abs(ratio - 1) < 0.01) {
				for (let i = 0; i < input.length; i += 1) {
					this.#micCarry.push(input[i] ?? 0);
				}
			} else {
				const outCount = Math.floor(input.length / ratio);
				for (let i = 0; i < outCount; i += 1) {
					const srcIdx = i * ratio;
					const i0 = Math.floor(srcIdx);
					const i1 = Math.min(input.length - 1, i0 + 1);
					const frac = srcIdx - i0;
					this.#micCarry.push(
						(input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac,
					);
				}
			}

			while (this.#micCarry.length >= SAMPLES_PER_FRAME) {
				const frameSamples = this.#micCarry.splice(0, SAMPLES_PER_FRAME);
				const pcm = new Uint8Array(DEFAULT_ROBOT_AUDIO_FRAME_BYTES);
				const view = new DataView(pcm.buffer);
				let sumSq = 0;
				let peak = 0;
				for (let i = 0; i < SAMPLES_PER_FRAME; i += 1) {
					const clamped = Math.max(-1, Math.min(1, frameSamples[i] ?? 0));
					const absVal = Math.abs(clamped);
					if (absVal > peak) {
						peak = absVal;
					}
					sumSq += clamped * clamped;
					view.setInt16(i * 2, Math.round(clamped * 32767), true);
				}
				const rms = Math.sqrt(sumSq / SAMPLES_PER_FRAME);
				const counter = this.#micCounter;
				this.#micCounter = (this.#micCounter + 1) >>> 0;
				onFrame(counter, pcm, rms, peak);
			}
		};

		source.connect(processor);
		processor.connect(silentSink);
		silentSink.connect(ctx.destination);

		this.#micStream = stream;
		this.#micSource = source;
		this.#micProcessor = processor;
		this.#micSilentSink = silentSink;
		this.#micActive = true;
		this.#micCarry = [];
		return true;
	}

	stopMicrophone(): void {
		this.#micActive = false;
		this.#micCarry = [];
		if (this.#micProcessor) {
			this.#micProcessor.onaudioprocess = null;
			this.#micProcessor.disconnect();
			this.#micProcessor = undefined;
		}
		if (this.#micSource) {
			this.#micSource.disconnect();
			this.#micSource = undefined;
		}
		if (this.#micSilentSink) {
			this.#micSilentSink.disconnect();
			this.#micSilentSink = undefined;
		}
		if (this.#micStream) {
			for (const track of this.#micStream.getTracks()) {
				track.stop();
			}
			this.#micStream = undefined;
		}
	}

	dispose(): void {
		this.stopMicrophone();
		this.stopSpeaker();
		if (this.#audioContext) {
			void this.#audioContext.close().catch(() => {});
			this.#audioContext = undefined;
			this.#gainNode = undefined;
		}
	}
}
