type McpToolResult = {
  evidenceId: string;
  status: "pass" | "fail" | "skipped" | "error";
  summary: string;
  logs: string[];
  exitCode?: number;
  startedAt: string;
  finishedAt: string;
  reliability: number;
};

type McpResponse = {
  result?: McpToolResult;
  error?: { message?: string };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promise;
  } finally {
    clearTimeout(timeout);
  }
};

export const callMcpTool = async (
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 15000,
): Promise<McpToolResult> => {
  const url = process.env.MCP_URL;
  if (!url) {
    throw new Error("MCP_URL is not configured.");
  }

  const apiKey = process.env.MCP_API_KEY;
  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: {
            ...args,
            ...(apiKey ? { apiKey } : {}),
          },
        },
      }),
    }),
    timeoutMs,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as McpResponse;
  if (payload.error) {
    throw new Error(payload.error.message || "MCP tool call failed.");
  }
  if (!payload.result) {
    throw new Error("MCP tool response missing result.");
  }
  return payload.result;
};
