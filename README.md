# GjShSh Avatar (prototype)

A local prototype of an Albanian Sign Language avatar. It is free to run on your machine. It is not a checked dictionary and it is not a replacement for an interpreter.

The avatar is a CC0 sample from the [TalkingHead](https://github.com/met4citizen/TalkingHead) project (MPFB). Movement is estimated from video with MediaPipe, so handshapes are approximate.

## Run

```bash
make api    # http://127.0.0.1:8010
make web    # http://127.0.0.1:5173
```

Open the web app and try Alfabeti, Gërmëzim, Fjalori, and Përkthe.

Alphabet clips are extracted with:

```bash
cd backend && PYTHONPATH=src uv run signapp-pipeline extract ../data/videos/gjshsh/alphabet
```

Videos stay in `data/` and are not committed. They came from gjshsh.al and are only for private testing. Do not publish them. Anything public needs permission from ANAD, or signs you record yourself in Studio.

## Tests

```bash
make test
```

## What you can do

- Watch the realistic avatar fingerspell the Albanian alphabet.
- Type any word and have it spelled, including digraphs such as `dh`, `sh`, and `xh`.
- Search a small test dictionary. Words with no recording fall back to fingerspelling. `spitalit` finds `spital`.
- Record a sign with the webcam, or import a video, in Studio.
- Type or speak a short Albanian sentence. Known words play as signs. The rest is spelled.
- Hear Albanian speech from the keyboard. The server uses `edge-tts` when it can reach the network. If that fails, the browser speaks the text.

The optional Ollama reorder on the translate page is off by default. Word order is not real GjShSh grammar.

The longer product plan is in `docs/AVATAR_SIGN_LANGUAGE_PLAN.md`.
