"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-only voice: Web Speech API SpeechRecognition for dictation and
// speechSynthesis for spoken replies. No paid services; audio stays in the browser
// (note: Chrome's recognizer may use Google's speech service under the hood).

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export const VOICE_LANGUAGES = [
  { code: "en-NG", label: "English (Nigeria)" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "fr-FR", label: "Français" },
  { code: "es-ES", label: "Español" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "yo-NG", label: "Yorùbá" },
  { code: "ha-NG", label: "Hausa" },
  { code: "sw-KE", label: "Kiswahili" },
];

export function useVoice(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState({ stt: false, tts: false });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState("en-NG");
  const [error, setError] = useState<string>();
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported({ stt: !!(w.SpeechRecognition || w.webkitSpeechRecognition), tts: "speechSynthesis" in window });
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError("Voice input isn't supported in this browser. Try Chrome on Android/desktop or Safari on iOS, or type instead."); return; }
    if (listening) return;
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    r.lang = lang; r.interimResults = true; r.continuous = true;
    finalText.current = ""; setInterim(""); setError(undefined);
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript + " "; else live += res[0].transcript;
      }
      setInterim((finalText.current + live).trim());
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission was blocked. Allow it in the browser to dictate." : `Voice input error: ${e.error}`);
    r.onend = () => {
      setListening(false);
      const text = finalText.current.trim();
      if (text) onFinal(text);
      setInterim("");
    };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setError("Could not start the microphone."); }
  }, [lang, listening, onFinal]);

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
    u.lang = lang;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang) ?? window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [lang]);

  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);

  return { supported, listening, interim, lang, setLang, error, start, stop, speak, speaking, stopSpeaking };
}
