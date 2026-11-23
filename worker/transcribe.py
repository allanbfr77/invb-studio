#!/usr/bin/env python3
"""Transcrição local com faster-whisper. Uso:
  python transcribe.py <audio> --out <saida.json> [--model small] [--device cpu] [--language pt|auto]
Imprime linhas JSON de progresso no stdout: {"type":"progress","pct":N}
Não faz diarização (separação de falantes)."""
import argparse, json, sys


def load_audio(path):
    """O app já entrega o áudio em WAV de 16 kHz, mono, 16 bits: lemos direto, sem depender do PyAV.
    (Versões novas do PyAV quebram a leitura de arquivo do faster-whisper: "unexpected keyword argument 'metadata_errors'".)
    Se o arquivo não estiver nesse formato, devolvemos o caminho e o faster-whisper decodifica como antes."""
    try:
        import wave
        import numpy as np
        with wave.open(path, "rb") as w:
            if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2 or w.getcomptype() != "NONE":
                return path
            raw = w.readframes(w.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    except Exception:  # noqa
        return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--language", default="auto")
    a = ap.parse_args()

    from faster_whisper import WhisperModel

    compute = "int8" if a.device == "cpu" else "float16"
    print(json.dumps({"type": "stage", "stage": "loading_model"}), flush=True)
    model = WhisperModel(a.model, device=a.device, compute_type=compute)
    lang = None if a.language == "auto" else a.language
    segments, info = model.transcribe(
        load_audio(a.audio), language=lang, word_timestamps=True, vad_filter=True,
        beam_size=5, condition_on_previous_text=False,
    )
    dur = float(info.duration or 0) or 1.0
    out = []
    last = -1
    for s in segments:
        words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 3)}
                 for w in (s.words or []) if w.word.strip()]
        out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                    "avg_logprob": round(s.avg_logprob, 3), "words": words})
        pct = min(99, int(s.end / dur * 100))
        if pct != last:
            last = pct
            print(json.dumps({"type": "progress", "pct": pct}), flush=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"language": info.language, "language_probability": round(info.language_probability, 3),
                   "duration": round(dur, 2), "model": a.model, "segments": out}, f, ensure_ascii=False)
    print(json.dumps({"type": "done"}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa
        print(json.dumps({"type": "error", "message": f"{type(e).__name__}: {e}"}), flush=True)
        sys.exit(1)
