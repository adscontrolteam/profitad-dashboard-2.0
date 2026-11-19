"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { BRIEF_UI, type BriefLang } from "@/lib/brief/questions";

/* Minimal typing for the Web Speech API (not in lib.dom for every browser). */
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

const noop = () => () => undefined;

const SPEECH_LANG: Record<BriefLang, string> = { ru: "ru-RU", uk: "uk-UA", en: "en-US" };

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Microphone button next to an answer: speech is turned into text by the browser (Chrome, Edge, Safari)
 * and appended to what is already typed. Hidden where the browser has no speech recognition.
 */
export function DictateButton({
  lang,
  value,
  onText,
  onDone,
}: {
  lang: BriefLang;
  value: string;
  onText: (value: string) => void;
  onDone: () => void;
}) {
  const ui = BRIEF_UI[lang];
  const supported = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(false);
  const rec = useRef<Recognition | null>(null);
  // Text before dictation started plus phrases already recognised as final.
  const base = useRef("");
  const latest = useRef({ onText, onDone });
  useEffect(() => {
    latest.current = { onText, onDone };
  });
  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  const join = (a: string, b: string) => (a && b ? `${a.replace(/\s+$/, "")}${/[\n]$/.test(a) ? "" : " "}${b.trim()}` : a || b.trim());

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.continuous = true;
    r.interimResults = true;
    base.current = value;
    setError(false);
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) base.current = join(base.current, res[0].transcript);
        else interim += res[0].transcript;
      }
      latest.current.onText(join(base.current, interim));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") setError(true);
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      latest.current.onText(base.current);
      latest.current.onDone();
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (listening ? rec.current?.stop() : start())}
        aria-pressed={listening}
        title={listening ? ui.dictateStop : ui.dictate}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          listening ? "border-transparent bg-negative text-white" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {listening ? (
          <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden />
        ) : (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
        {listening ? ui.dictateStop : ui.dictate}
      </button>
      {(listening || error) && (
        <span className={cn("text-xs", error ? "text-negative" : "text-muted-foreground")} aria-live="polite">
          {error ? ui.dictateError : ui.dictating}
        </span>
      )}
    </div>
  );
}
