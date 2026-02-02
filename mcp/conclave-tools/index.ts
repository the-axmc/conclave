import "reflect-metadata";
import { createHTTPServer, MCPServer, Optional, SchemaConstraint, Tool } from "@leanmcp/core";
import { spawn } from "child_process";
import { access } from "fs/promises";

class PingInput {
  @Optional()
  @SchemaConstraint({ description: "Optional API key" })
  apiKey?: string;
}

class VerifyPlanInput {
  @SchemaConstraint({ description: "Session id" })
  sessionId!: string;

  @SchemaConstraint({ description: "Plan id" })
  planId!: string;

  @SchemaConstraint({ description: "Verification mode", enum: ["mock", "real"] })
  mode!: "mock" | "real";

  @Optional()
  @SchemaConstraint({ description: "Optional fixture path" })
  fixturePath?: string;

  @Optional()
  @SchemaConstraint({ description: "Optional command" })
  command?: string;

  @Optional()
  @SchemaConstraint({ description: "Optional API key" })
  apiKey?: string;
}

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

const requireApiKey = (inputKey?: string) => {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return;
  if (!inputKey || inputKey !== expected) {
    throw new Error("Unauthorized");
  }
};

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

const runCommand = async (cwd: string, command: string, timeoutMs: number) => {
  const startedAt = new Date().toISOString();
  return await new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    startedAt: string;
    finishedAt: string;
    timedOut: boolean;
  }>((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    const limit = 20000;
    const append = (target: "stdout" | "stderr", chunk: string) => {
      if (target === "stdout") {
        stdout = (stdout + chunk).slice(0, limit);
      } else {
        stderr = (stderr + chunk).slice(0, limit);
      }
    };

    child.stdout?.on("data", (data) => append("stdout", data.toString()));
    child.stderr?.on("data", (data) => append("stderr", data.toString()));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : 1,
        startedAt,
        finishedAt: new Date().toISOString(),
        timedOut,
      });
    });
  });
};

class ConclaveToolsService {
  @Tool({ description: "Health check for conclave-tools.", inputClass: PingInput })
  async ping(input: PingInput) {
    requireApiKey(input.apiKey);
    return { ok: true, name: "conclave-tools", version };
  }

  @Tool({ description: "Run verification and return structured evidence.", inputClass: VerifyPlanInput })
  async verify_plan(input: VerifyPlanInput): Promise<VerifyOutput> {
    requireApiKey(input.apiKey);
    const startedAt = new Date().toISOString();
    const evidenceId = `evidence-${input.sessionId}-${input.planId}-${Date.now()}`;

    if (input.mode === "real") {
      const fixturePath = input.fixturePath ?? process.env.DAYTONA_FIXTURE_PATH ?? "./fixtures/daytona-fixture";
      const command = input.command ?? process.env.DAYTONA_COMMAND ?? "npm test";
      const timeoutMs = Number(process.env.DAYTONA_TIMEOUT_MS || 90000);

      try {
        await access(fixturePath);
      } catch {
        const finishedAt = new Date().toISOString();
        return {
          evidenceId,
          status: "error",
          summary: "Fixture path not found for real verification.",
          logs: [
            "Fixture path is missing or unreadable.",
            `fixturePath=${fixturePath}`,
            `command=${command}`,
          ],
          exitCode: 1,
          startedAt,
          finishedAt,
          reliability: 0.2,
        };
      }

      const result = await runCommand(fixturePath, command, timeoutMs);
      const status = result.timedOut ? "error" : result.exitCode === 0 ? "pass" : "fail";
      const summary = result.timedOut
        ? "Verification timed out."
        : result.exitCode === 0
          ? "Verification passed."
          : "Verification failed.";

      return {
        evidenceId,
        status,
        summary,
        logs: [
          `[daytona] fixturePath=${fixturePath}`,
          `[daytona] command=${command}`,
          ...(result.stdout ? [`--- stdout ---\n${result.stdout}`] : []),
          ...(result.stderr ? [`--- stderr ---\n${result.stderr}`] : []),
        ],
        exitCode: result.exitCode,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        reliability: status === "pass" ? 0.9 : status === "fail" ? 0.75 : 0.2,
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
  }
}

const serverFactory = () => {
  const server = new MCPServer({ name: "conclave-tools", version, logging: true });
  server.registerService(new ConclaveToolsService());
  return server.getServer();
};

await createHTTPServer(serverFactory, { port: 3001, cors: true, logging: true });
console.log("conclave-tools MCP server listening on :3001");
