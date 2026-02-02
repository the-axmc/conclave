export type AgentRole = "planner" | "skeptic" | "security" | "cost" | "synthesizer";

export type DebateAgent = {
  id: string;
  name: string;
  role: AgentRole;
  goal: string;
};

export type DebatePlan = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  risks: string[];
};

export type ProbabilityEntry = {
  planId: string;
  probability: number;
  updatedBy: AgentRole;
  rationale: string;
  timestamp: string;
};

export type ProbabilitySnapshot = {
  timestamp: string;
  entries: ProbabilityEntry[];
  note: string;
};

export type EvidenceLedgerEntry = {
  id: string;
  planId: string;
  agent: AgentRole;
  type: "test" | "log" | "analysis" | "patch";
  summary: string;
  details: string;
  reliability: number;
  timestamp: string;
};

export type DebateMessage = {
  id: string;
  agent: AgentRole;
  content: string;
  preferredPlanId: string;
  confidence: number;
  reasons: string[];
  disconfirmingTest: string;
  references: string[];
  timestamp: string;
};

export type DebateTimelineEvent = {
  id: string;
  label: string;
  timestamp: string;
  details: string;
};

export type DebateDiff = {
  summary: string;
  diff: string;
};

export type DebateWeights = {
  planner: number;
  skeptic: number;
  security: number;
  cost: number;
  synthesizer: number;
};

export type DebateSession = {
  id: string;
  scenario: string;
  createdAt: string;
  agents: DebateAgent[];
  plans: DebatePlan[];
  transcript: DebateMessage[];
  probabilities: ProbabilitySnapshot[];
  evidenceLedger: EvidenceLedgerEntry[];
  timeline: DebateTimelineEvent[];
  finalPlanId: string;
  finalDiff: DebateDiff;
  adapter: string;
  weights: DebateWeights;
  runVerification: boolean;
  uncertaintySummary: string;
  model?: string;
  promptVersion?: string;
  generationWarnings?: string[];
  belief?: {
    statement: string;
    probability: number;
    variance: "low" | "medium" | "high";
  };
  action?: {
    recommendation: string;
    assumptions: string[];
    response?: string;
  };
  proposals?: Array<{
    agent: AgentRole;
    proposal: string;
    summary: string;
    risk: string;
    riskSeverity: number;
    rationale: string[];
    confidence: number;
  }>;
  finalSolution?: {
    summary: string;
    steps: string[];
    risks: string[];
    assumptions?: string[];
  };
  promptCategory?: string;
  winningAgent?: AgentRole;
  codeScenario?: boolean;
  daytonaOutput?: string;
};

export type DebateRunRequest = {
  scenario?: string;
  weights?: DebateWeights;
  runVerification?: boolean;
  llmProvider?: "ollama" | "groq";
};

export type DebateRunResponse = {
  session: DebateSession;
};
