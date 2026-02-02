import type { DebatePlan } from "../../../src/lib/probability-parliament-types";

export type VerificationRequest = {
  scenario: string;
  plan: DebatePlan;
};

export type VerificationResult = {
  passed: boolean;
  output: string;
  durationMs: number;
  summary: string;
  reliability?: number;
  warning?: string;
  adapterName?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type DebateAdapter = {
  name: string;
  runVerification: (request: VerificationRequest) => Promise<VerificationResult>;
};
