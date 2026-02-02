import type { DebateAdapter, VerificationRequest, VerificationResult } from "./types";
import { mockAdapter } from "./mock-adapter";

type McpCallResult = {
  content?: Array<{ type: string; text?: string }>;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  sandboxId?: string;
};

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const callMcpTool = async (toolName: string, args: Record<string, unknown>) => {
  const mcpUrl = requireEnv("MCP_URL");
  const apiKey = requireEnv("DAYTONA_API_KEY");

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as { result?: McpCallResult; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message || "MCP tool call failed.");
  }

  return payload.result ?? {};
};

const parseToolResult = (result: McpCallResult | string | undefined) => {
  if (!result) return {};
  if (typeof result === "string") {
    return { stdout: result };
  }
  if (Array.isArray(result.content)) {
    const text = result.content
      .map((item) => item.text)
      .filter(Boolean)
      .join("\n");
    if (text) return { stdout: text };
  }
  return result;
};

const buildOutput = (payload: {
  toolName: string;
  command: string;
  repoPath: string;
  startedAt: string;
  finishedAt: string;
  sandboxId?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) => {
  const lines = [
    `[daytona] tool=${payload.toolName}`,
    `repo: ${payload.repoPath}`,
    `command: ${payload.command}`,
    `startedAt: ${payload.startedAt}`,
    `finishedAt: ${payload.finishedAt}`,
    `exitCode: ${payload.exitCode ?? "unknown"}`,
  ];
  if (payload.sandboxId) lines.push(`sandboxId: ${payload.sandboxId}`);
  if (payload.stdout) lines.push("\n--- stdout ---\n" + payload.stdout);
  if (payload.stderr) lines.push("\n--- stderr ---\n" + payload.stderr);
  return lines.join("\n");
};

const runDaytonaVerification = async (request: VerificationRequest): Promise<VerificationResult> => {
  const toolName = process.env.DAYTONA_TOOL || "daytona.run";
  const repoPath = process.env.DAYTONA_FIXTURE_PATH || "./fixtures/daytona-fixture";
  const command = process.env.DAYTONA_COMMAND || "npm test";
  const timeoutMs = Number(process.env.DAYTONA_TIMEOUT_MS || 90000);
  const cpu = Number(process.env.DAYTONA_CPU || 1);
  const memoryMb = Number(process.env.DAYTONA_MEMORY_MB || 1024);

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const rawResult = await callMcpTool(toolName, {
    scenario: request.scenario,
    plan: request.plan,
    repoPath,
    command,
    timeoutMs,
    resources: { cpu, memoryMb },
  });

  const parsed = parseToolResult(rawResult);
  const finishedAt = parsed.finishedAt || new Date().toISOString();
  const durationMs = parsed.durationMs ?? Date.now() - startedMs;
  const exitCode = parsed.exitCode ?? (parsed.stderr ? 1 : 0);
  const passed = exitCode === 0;

  return {
    passed,
    output: buildOutput({
      toolName,
      repoPath,
      command,
      startedAt,
      finishedAt,
      sandboxId: parsed.sandboxId,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
      exitCode,
    }),
    durationMs,
    summary: passed ? "Daytona verification succeeded." : "Daytona verification failed.",
    reliability: passed ? 0.9 : 0.75,
    adapterName: "real",
  };
};

export const realAdapter: DebateAdapter = {
  name: "real",
  runVerification: async (request) => {
    try {
      return await runDaytonaVerification(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown real adapter error.";
      const fallback = await mockAdapter.runVerification(request);
      return {
        ...fallback,
        warning: `Real adapter failed; fell back to mock. ${message}`,
        adapterName: "mock",
      };
    }
  },
};
