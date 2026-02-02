import { DebateRunRequest, DebateRunResponse, DebateSession } from "./probability-parliament-types";

export async function runDebate(
  scenario: string,
  weights?: { planner: number; skeptic: number; security: number; cost: number; synthesizer: number },
  runVerification?: boolean,
  llmProvider?: "ollama" | "groq"
): Promise<DebateSession> {
  const response = await fetch("/api/debate/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scenario, weights, runVerification, llmProvider } as DebateRunRequest),
  });

  if (!response.ok) {
    throw new Error(`Failed to run debate: ${response.statusText}`);
  }

  const data = (await response.json()) as DebateRunResponse;
  return data.session;
}

export async function getLatestDebate(): Promise<DebateSession | null> {
  try {
    const response = await fetch("/api/debate/latest");
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch latest debate: ${response.statusText}`);
    }
    const data = (await response.json()) as DebateRunResponse;
    return data.session;
  } catch (error) {
    console.warn("Failed to fetch latest debate", error);
    return null;
  }
}
