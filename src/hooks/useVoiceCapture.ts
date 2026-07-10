import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceCaptureState = "idle" | "recording" | "transcribing";

type Options = {
  /** When true, keeps the mic open and auto-submits on silence (hands-free). */
  autoStop?: boolean;
  /** ms of silence after speech before we auto-submit. */
  silenceMs?: number;
  /** RMS amplitude below which we consider it silence. */
  silenceThreshold?: number;
};

export function useVoiceCapture(
  onTranscript: (text: string) => void,
  options: Options = {},
) {
  const { autoStop = true, silenceMs = 1500, silenceThreshold = 0.06 } = options;
  const [state, setState] = useState<VoiceCaptureState>("idle");
  const [amplitude, setAmplitude] = useState(0);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const spokeRef = useRef(false);
  const lastVoiceAtRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopEverything() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    if (mediaRef.current) {
      mediaRef.current.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }

  const start = useCallback(async () => {
    if (state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Aggressive DSP so background noise, keyboard clicks, and echo
          // from Kaalu's own TTS don't get picked up as user speech.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        } as MediaTrackConstraints,
      });
      mediaRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        setState("transcribing");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        stopEverything();
        // If no voice was detected, silently return to idle without hitting STT.
        if (blob.size < 1200 || !spokeRef.current) {
          setState("idle");
          return;
        }
        const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "mp4" : "webm";
        const form = new FormData();
        form.append("file", blob, `recording.${ext}`);
        try {
          const res = await fetch("/api/voice/stt", { method: "POST", body: form });
          if (!res.ok) throw new Error(await res.text());
          const json = (await res.json()) as { text?: string };
          if (json.text?.trim()) onTranscript(json.text.trim());
        } catch (e) {
          console.error("STT failed", e);
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recorderRef.current = rec;
      spokeRef.current = false;
      lastVoiceAtRef.current = 0;

      // Setup analyser for amplitude
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const startedAt = performance.now();
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setAmplitude(Math.min(1, rms * 4));
        const now = performance.now();
        if (rms > silenceThreshold) {
          spokeRef.current = true;
          lastVoiceAtRef.current = now;
        }
        if (
          autoStop &&
          spokeRef.current &&
          now - lastVoiceAtRef.current > silenceMs &&
          now - startedAt > 700
        ) {
          // Auto-submit after silence.
          if (recorderRef.current && recorderRef.current.state === "recording") {
            try {
              recorderRef.current.stop();
            } catch {
              // ignore
            }
          }
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setState("recording");
    } catch (e) {
      console.error(e);
      setState("idle");
    }
  }, [onTranscript, state, autoStop, silenceMs, silenceThreshold]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") start();
  }, [state, start, stop]);

  return { state, amplitude, start, stop, toggle };
}