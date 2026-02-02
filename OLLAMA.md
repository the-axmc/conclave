# Ollama Setup (Local LLM for Probability Parliament)

This guide sets up Ollama on macOS and wires it into this project.

## 1) Install Ollama

Download and install:
- https://ollama.com

After installation, make sure the daemon is running. You can check with:

```
ollama --version
```

## 2) Download a quality model


```
ollama pull qwen2.5:14b
```

## 3) Configure this app

Copy `.env.example` to `.env` and set these:

```
LLM_PROVIDER=ollama
LLM_URL=http://localhost:11434
LLM_MODEL=qwen2.5:14b
LLM_TEMPERATURE=0.2
LLM_AGENT_TEMPERATURE=0.6
LLM_MAX_TOKENS=400
```

## 4) Verify Ollama is responding

Quick health check:

```
curl http://localhost:11434/api/tags
```

You should see your model in the list.

## 5) Run the app

Start the backend server in one terminal:

```
npx tsx server/index.ts
```

Start the UI in another terminal:

```
npm run dev
```

Run a debate and the transcript should be LLM‑generated. If the LLM call fails, it will fall back to scripted text and log a warning in the evidence ledger.

## Troubleshooting

- Slow responses: switch model or reduce `LLM_MAX_TOKENS`.
- Connection errors: make sure Ollama is running and `LLM_URL` is correct.
- JSON parse errors: some models may ignore the “JSON only” instruction; try a different model or lower temperature.

## Using Ollama for other apps

Any local app can call Ollama at `http://localhost:11434/api/chat` or `http://localhost:11434/api/generate`.
You can reuse the same model across tools without re‑downloading.
