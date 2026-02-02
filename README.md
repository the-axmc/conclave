# Conclave

Conclave is a multi‑agent decision engine that runs structured debates between specialized agents (Planner, Skeptic, Security, Cost, Synthesizer). Instead of returning one answer, it produces competing proposals, a probability distribution over them, and a final response synthesized from the debate. When a prompt involves code, Conclave can attach verification evidence from a local MCP tool chain.

## What it does
- Generates distinct agent proposals and a ranked probability distribution (never 0%/100%).
- Shows explicit disagreement, risks, and assumptions.
- Produces a final response (not just a recommendation), derived from the debate.
- Optionally runs verification for code prompts and surfaces evidence logs.

## Architecture
- Vite + React UI for debate inputs, weights, and outputs.
- Lightweight Node server (`/server`) orchestrates debate runs and persists sessions.
- LeanMCP server (`/mcp/conclave-tools`) exposes verification tools (`ping`, `verify_plan`).
- LLM providers: Local (Ollama) or API (Groq), selectable in the UI.

## Run locally
1) Copy `.env.example` to `.env`.
2) Set LLM provider vars:
   - Ollama: `LLM_PROVIDER=ollama`, `OLLAMA_URL`, `OLLAMA_MODEL`
   - Groq: `LLM_PROVIDER=groq`, `GROQ_URL`, `GROQ_API_KEY`, `GROQ_MODEL`
3) Start MCP tools: `npm run dev:mcp`
4) Start API: `npm run dev:server`
5) Start UI: `npm run dev`
6) Or run all: `npm run dev:full`

## Verification behavior
- Verification runs only for code prompts.
- If MCP is unreachable, the server falls back to mock verification and records a warning.
- The UI notes when verification is skipped for non‑code prompts.

## Notes
- The “Final Diff” is a demo artifact (not a real patch).
- Evidence entries are ordered by the final probabilities.

