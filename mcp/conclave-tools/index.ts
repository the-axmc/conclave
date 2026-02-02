import { createHTTPServer } from "@leanmcp/core";

type VerifyInput = {
  sessionId: string;
  planId: string;
  mode: "mock" | "real";
  fixturePath?: string;
  command?: string;
  apiKey?: string;
};

type VerifyOutput = {
  evidenceId: string;
  status: "pass" | "fail" | "skipped" | "error";
  summary: string;
  logs: string[];
  exitCode?: number;
  startedAt: string;
  finishedAt: string;
  reliability: number;
};

const version = "0.1.0";

const buildMockLogs = (planId: string) => {
  const outputs: Record<string, { passed: boolean; summary: string; logs: string[] }> = {
    "plan-a": {
      passed: false,
      summary: "Two tests still failing after change.",
      logs: [
        " RUNS  test/userService.test.ts",
        " FAIL  test/userService.test.ts",
        "  ● UserService › returns default role",
        "    Expected: \"viewer\"",
        "    Received: undefined",
        "",
        "Test Suites: 1 failed, 4 passed, 5 total",
        "Tests:       2 failed, 18 passed, 20 total",
      ],
    },
    "plan-b": {
      passed: true,
      summary: "All tests passing after role fallback fix.",
      logs: [
        " RUNS  test/userService.test.ts",
        " PASS  test/userService.test.ts",
        " PASS  test/roles.test.ts",
        "",
        "Test Suites: 5 passed, 5 total",
        "Tests:       20 passed, 20 total",
      ],
    },
    "plan-c": {
      passed: false,
      summary: "Mocks updated but integration still failing.",
      logs: [
        " RUNS  test/userService.test.ts",
        " FAIL  test/userService.test.ts",
        "  ● UserService › maps roles",
        "    Expected: \"admin\"",
        "    Received: \"viewer\"",
      ],
    },
    "plan-d": {
      passed: false,
      summary: "Input validation changed but tests still failing.",
      logs: [
        " RUNS  test/userService.test.ts",
        " FAIL  test/userService.test.ts",
        "  ● UserService › returns default role",
        "    Expected: \"viewer\"",
        "    Received: \"guest\"",
      ],
    },
  };

  return outputs[planId] ?? outputs["plan-a"];
};

const tools = {
  ping: {
    description: "Health check for conclave-tools.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input: { apiKey?: string }) => {
      if (process.env.MCP_API_KEY && input.apiKey !== process.env.MCP_API_KEY) {
        throw new Error("Unauthorized");
      }

      return {
        ok: true,
        name: "conclave-tools",
        version,
      };
    },
  },
  verify_plan: {
    description: "Run verification and return structured evidence.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        planId: { type: "string" },
        mode: { type: "string", enum: ["mock", "real"] },
        fixturePath: { type: "string" },
        command: { type: "string" },
        apiKey: { type: "string" },
      },
      required: ["sessionId", "planId", "mode"],
      additionalProperties: false,
    },
    handler: async (input: VerifyInput): Promise<VerifyOutput> => {
      if (process.env.MCP_API_KEY && input.apiKey !== process.env.MCP_API_KEY) {
        throw new Error("Unauthorized");
      }

      const startedAt = new Date().toISOString();
      const evidenceId = `evidence-${input.sessionId}-${input.planId}-${Date.now()}`;

      if (input.mode === "real") {
        const finishedAt = new Date().toISOString();
        return {
          evidenceId,
          status: "error",
          summary: "Real verification not implemented yet.",
          logs: [
            "Real verification is not implemented.",
            `fixturePath=${input.fixturePath ?? "unset"}`,
            `command=${input.command ?? "unset"}`,
          ],
          exitCode: 1,
          startedAt,
          finishedAt,
          reliability: 0.2,
        };
      }

      const mock = buildMockLogs(input.planId);
      const finishedAt = new Date().toISOString();
      return {
        evidenceId,
        status: mock.passed ? "pass" : "fail",
        summary: mock.summary,
        logs: mock.logs,
        exitCode: mock.passed ? 0 : 1,
        startedAt,
        finishedAt,
        reliability: mock.passed ? 0.9 : 0.75,
      };
    },
  },
};

const server = createHTTPServer({
  name: "conclave-tools",
  version,
  tools,
});

server.listen(3001, () => {
  console.log("conclave-tools MCP server listening on :3001");
});
