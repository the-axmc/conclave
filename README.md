# Conclave

Probability Parliament demo app (Vite + React + Node server).

Note: The transcript is a simulation of a multi-agent debate loop for demo purposes.
The "Final Diff" is an example patch output.

To enable real agent text generation (Phase 1), set `LLM_PROVIDER` and the provider variables:
- `LLM_PROVIDER=ollama` with `OLLAMA_URL` + `OLLAMA_MODEL`
- `LLM_PROVIDER=groq` with `GROQ_URL` + `GROQ_API_KEY` + `GROQ_MODEL`

## Run with real Daytona
1) Copy `.env.example` to `.env` and set `DAYTONA_API_KEY` + `MCP_URL` (set `ADAPTER_MODE=real` to force real adapter, or `auto` to use real only when configured).
2) Ensure the fixture repo exists at `DAYTONA_FIXTURE_PATH` (default `./fixtures/daytona-fixture`).
3) Start the server in one terminal: `node server/index.ts` (or your existing server script).
4) Start the UI in another terminal: `bun run dev`.
5) Toggle “Verification Mode” on and run a debate.

## Run locally (MCP)
1) Copy `.env.example` to `.env` and set `MCP_URL` + LLM provider keys.
2) Start MCP tools: `npm run dev:mcp`
3) Start API: `npm run dev:server`
4) Start UI: `npm run dev`
5) Or run all: `npm run dev:full`
