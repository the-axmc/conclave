# Specs: Product Upgrade with LLM Agents

This document defines the upgraded app behavior now that LLM‑generated debate is available. Scope is focused on a clear “debate → plans → verdict” flow and a UI optimized for that story.

## Goals
- Use real LLM agents to generate debate content.
- Surface proposed plans up front, summarize the debate, and present a final verdict.
- Keep existing API contracts (`/api/debate/run`, `/api/debate/latest`) intact.

## Non‑Goals
- No new agents, auth, or multi‑user features.
- No broad backend refactor beyond LLM + UI view layer.
- No changes to evidence/verification semantics beyond what already exists.

---

## Phase A: LLM Debate (Backend + Data)

### Functional Requirements
1) **LLM‑Generated Transcript**
   - Each agent (planner, skeptic, security, cost, synthesizer) produces a structured response.
   - Required fields: `content`, `preferredPlanId`, `confidence`, `reasons`, `disconfirmingTest`.
   - Scenario and plan context included in the prompt.

2) **Determinism + Auditability**
   - Default low temperature (0.2).
   - Persist `model`, `promptVersion`, and `generationWarnings` in `DebateSession`.

3) **Fallback Behavior**
   - If LLM generation fails, use scripted fallback per‑agent.
   - Add a warning entry to the evidence ledger when fallback occurs.

### Data Requirements
- `DebateSession` includes:
  - `model?: string`
  - `promptVersion?: string`
  - `generationWarnings?: string[]`

### Acceptance Criteria
- For configured LLM runs, transcript content is LLM‑generated and scenario‑specific.
- If LLM is unavailable, the run completes with warnings and fallback text.

---

## Phase B: UI Upgrade (Plans → Debate Summary → Final Verdict)

### UI Goals
- Reduce cognitive load: user should understand the proposed plans, how agents debated, and the final verdict in one screen.

### Layout Requirements
1) **Plans Panel (Top Priority)**
   - Show the full list of proposed plans immediately after a run.
   - Each plan card shows title, summary, and key risks.
   - Highlight the plan currently favored by the final verdict.

2) **Debate Summary Panel**
   - Provide a synthesized summary (1–3 bullets) of the debate.
   - Include top 2 reasons and 1 key risk from the selected plan.
   - If evidence exists, add a “Updated after evidence” badge.

3) **Final Verdict Panel**
   - Clear statement of the selected plan and its confidence.
   - Show belief delta (initial → final) for the winning plan.
   - Include a concise “Why this plan” sentence.

4) **Transcript (Secondary)**
   - Full transcript remains accessible but is de‑emphasized.
   - Label as “LLM debate transcript” with timestamps and confidence.

### Acceptance Criteria
- A user can read the top of the page and understand: the options, the debate outcome, and the final verdict without scrolling.
- The verdict reflects the `finalPlanId` and probability trace.
- The UI stays functional when verification is off (show “theoretical run” tag).

---

## Risks
- LLM outputs may be malformed; must robustly parse or fallback.
- UI can become cluttered if plans, transcript, and evidence all compete for attention.
