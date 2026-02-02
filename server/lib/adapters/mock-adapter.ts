import type { DebateAdapter, VerificationRequest, VerificationResult } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const outputs = [
  {
    planId: "plan-a",
    passed: false,
    summary: "Two tests still failing after change.",
    output: [
      " RUNS  test/userService.test.ts",
      " FAIL  test/userService.test.ts",
      "  ● UserService › returns default role",
      "    Expected: \"viewer\"",
      "    Received: undefined",
      "  ● UserService › maps roles",
      "    TypeError: cannot read properties of undefined (reading 'role')",
      "", 
      "Test Suites: 1 failed, 4 passed, 5 total",
      "Tests:       2 failed, 18 passed, 20 total",
      "Snapshots:   0 total",
      "Time:        4.21 s",
    ].join("\n"),
  },
  {
    planId: "plan-b",
    passed: true,
    summary: "All tests passing after role fallback fix.",
    output: [
      " RUNS  test/userService.test.ts",
      " PASS  test/userService.test.ts",
      " PASS  test/roles.test.ts",
      "", 
      "Test Suites: 5 passed, 5 total",
      "Tests:       20 passed, 20 total",
      "Snapshots:   0 total",
      "Time:        3.97 s",
    ].join("\n"),
  },
  {
    planId: "plan-c",
    passed: false,
    summary: "Mocks updated but integration still failing.",
    output: [
      " RUNS  test/userService.test.ts",
      " FAIL  test/userService.test.ts",
      "  ● UserService › maps roles",
      "    Expected: \"admin\"",
      "    Received: \"viewer\"",
      "", 
      "Test Suites: 1 failed, 4 passed, 5 total",
      "Tests:       1 failed, 19 passed, 20 total",
      "Snapshots:   0 total",
      "Time:        4.02 s",
    ].join("\n"),
  },
  {
    planId: "plan-d",
    passed: false,
    summary: "Input validation changed but tests still failing.",
    output: [
      " RUNS  test/userService.test.ts",
      " FAIL  test/userService.test.ts",
      "  ● UserService › returns default role",
      "    Expected: \"viewer\"",
      "    Received: \"guest\"",
      "", 
      "Test Suites: 1 failed, 4 passed, 5 total",
      "Tests:       1 failed, 19 passed, 20 total",
      "Snapshots:   0 total",
      "Time:        4.08 s",
    ].join("\n"),
  },
];

const selectOutput = (request: VerificationRequest): VerificationResult => {
  const match = outputs.find((item) => item.planId === request.plan.id) ?? outputs[0];
  return {
    passed: match.passed,
    output: match.output,
    durationMs: 3500 + Math.floor(Math.random() * 900),
    summary: match.summary,
    reliability: match.passed ? 0.9 : 0.75,
    adapterName: "mock",
  };
};

export const mockAdapter: DebateAdapter = {
  name: "mock",
  runVerification: async (request) => {
    await sleep(400 + Math.floor(Math.random() * 300));
    return selectOutput(request);
  },
};
