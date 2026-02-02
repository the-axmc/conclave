import type {
  DebateAdapter,
  VerificationResult,
} from "./adapters/types";
import { mockAdapter } from "./adapters/mock-adapter";
import { callMcpTool } from "./mcp-client";
import { classifyPrompt, generateAgentProposal, generateFinalResponse, generateFinalSolution, getLlmConfig, type LlmProvider } from "./adapters/llm-adapter";
import type {
  DebateAgent,
  DebateDiff,
  DebateMessage,
  DebatePlan,
  DebateSession,
  DebateTimelineEvent,
  DebateWeights,
  EvidenceLedgerEntry,
  ProbabilityEntry,
  ProbabilitySnapshot,
} from "../../src/lib/probability-parliament-types";

const agents: DebateAgent[] = [
  {
    id: "agent-planner",
    name: "Planner",
    role: "planner",
    goal: "Propose concrete recovery plans for the scenario.",
  },
  {
    id: "agent-skeptic",
    name: "Skeptic",
    role: "skeptic",
    goal: "Challenge assumptions and stress-test plans.",
  },
  {
    id: "agent-security",
    name: "Security",
    role: "security",
    goal: "Identify security risks and validation gaps.",
  },
  {
    id: "agent-cost",
    name: "Cost",
    role: "cost",
    goal: "Estimate effort and operational impact.",
  },
  {
    id: "agent-synthesizer",
    name: "Synthesizer",
    role: "synthesizer",
    goal: "Converge on the most likely fix with evidence.",
  },
];

const defaultScenario = "Fix failing test";

const basePlans: DebatePlan[] = [
  {
    id: "plan-a",
    title: "Backfill role default in userService",
    summary: "Add a default role when user role is missing.",
    steps: [
      "Inspect userService mapping for undefined role cases.",
      "Add fallback to \"viewer\" when role is undefined.",
      "Update unit tests to reflect default role behavior.",
    ],
    risks: ["May mask upstream data issues if role is missing."],
  },
  {
    id: "plan-b",
    title: "Fix role mapping from auth payload",
    summary: "Ensure auth payload is normalized before mapping roles.",
    steps: [
      "Normalize auth payload into consistent structure.",
      "Map missing roles to default values in mapper.",
      "Add regression test for empty role list.",
    ],
    risks: ["Requires touching shared auth parsing logic."],
  },
  {
    id: "plan-c",
    title: "Update mocks to include role fixture",
    summary: "Adjust fixtures so tests include expected role values.",
    steps: [
      "Inspect failing test fixtures for role omissions.",
      "Update mock payloads to include role field.",
      "Re-run test suite to confirm stability.",
    ],
    risks: ["If production code is wrong, mocks may hide issue."],
  },
  {
    id: "plan-d",
    title: "Adjust validation for legacy role values",
    summary: "Allow legacy role values in validation logic.",
    steps: [
      "Check validation rules for role enum.",
      "Add legacy alias mapping for \"guest\" role.",
      "Update snapshot tests for legacy role support.",
    ],
    risks: ["Could introduce inconsistent role semantics."],
  },
];

const DAMPING_FACTOR = 0.08;

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const clampWeight = (value: number) => Math.min(1, Math.max(0, value));

const normalizeEntries = (entries: ProbabilityEntry[]): ProbabilityEntry[] => {
  const total = entries.reduce((sum, entry) => sum + entry.probability, 0);
  if (total === 0) {
    const uniform = 1 / entries.length;
    return entries.map((entry) => ({ ...entry, probability: uniform }));
  }
  return entries.map((entry) => ({
    ...entry,
    probability: entry.probability / total,
  }));
};

const dampAndNormalize = (entries: ProbabilityEntry[]): ProbabilityEntry[] => {
  const normalized = normalizeEntries(entries);
  const uniform = 1 / normalized.length;
  return normalized.map((entry) => ({
    ...entry,
    probability:
      (1 - DAMPING_FACTOR) * entry.probability + DAMPING_FACTOR * uniform,
  }));
};

const toTimestamp = (base: Date, offsetMinutes: number) =>
  new Date(base.getTime() + offsetMinutes * 60000).toISOString();

const recordSnapshot = (
  timestamp: string,
  note: string,
  entries: ProbabilityEntry[],
): ProbabilitySnapshot => ({
  timestamp,
  note,
  entries,
});

const applyWeightedUpdate = (
  previous: ProbabilityEntry[],
  update: { planId: string; probability: number; updatedBy: string; rationale: string },
  timestamp: string,
  weight: number,
): ProbabilityEntry[] => {
  return previous.map((entry) => {
    if (entry.planId !== update.planId) {
      return entry;
    }
    const weighted = entry.probability * (1 - weight) + update.probability * weight;
    return {
      ...entry,
      probability: clampUnit(weighted),
      updatedBy: update.updatedBy as ProbabilityEntry["updatedBy"],
      rationale: update.rationale,
      timestamp,
    };
  });
};

const selectAdapter = (): DebateAdapter => {
  return mockAdapter;
};

const defaultWeights: DebateWeights = {
  planner: 0.35,
  skeptic: 0.45,
  security: 0.5,
  cost: 0.4,
  synthesizer: 0.6,
};

const resolveWeights = (overrides?: DebateWeights): DebateWeights => ({
  planner: clampWeight(overrides?.planner ?? defaultWeights.planner),
  skeptic: clampWeight(overrides?.skeptic ?? defaultWeights.skeptic),
  security: clampWeight(overrides?.security ?? defaultWeights.security),
  cost: clampWeight(overrides?.cost ?? defaultWeights.cost),
  synthesizer: clampWeight(overrides?.synthesizer ?? defaultWeights.synthesizer),
});

const buildDiff = (): DebateDiff => ({
  summary: "Example patch output (fixture).",
  diff: [
    "diff --git a/src/services/userService.ts b/src/services/userService.ts",
    "index 1b233d1..56c92fa 100644",
    "--- a/src/services/userService.ts",
    "+++ b/src/services/userService.ts",
    "@@ -14,7 +14,12 @@ export const mapUser = (payload: AuthPayload): User => {",
    "-  const role = payload.role;",
    "+  const role = payload.role ?? \"viewer\";",
    "   return {",
    "     id: payload.id,",
    "-    role,",
    "+    role,",
    "     name: payload.name,",
    "   };",
    " };",
  ].join("\n"),
});


const buildTranscriptFromProposals = (
  baseTime: Date,
  scenario: string,
  proposals: Array<{ agent: DebateAgent["role"]; proposal: string; summary: string; risk: string; riskSeverity: number; rationale: string[]; confidence: number }>,
  finalSolution?: { summary: string; steps: string[]; risks: string[] },
): DebateMessage[] => {
  const baseTimestamp = baseTime.getTime();
  const byAgent = new Map(proposals.map((proposal) => [proposal.agent, proposal]));
  const planForRole: Record<DebateAgent["role"], string> = {
    planner: "plan-a",
    skeptic: "plan-b",
    security: "plan-c",
    cost: "plan-d",
    synthesizer: "plan-b",
  };
  const messages: DebateMessage[] = [];

  agents.forEach((agent, index) => {
    if (agent.role === "synthesizer") {
      if (!finalSolution) return;
      messages.push({
        id: "msg-synthesizer",
        agent: "synthesizer",
        content: `Final recommendation for "${scenario}": ${finalSolution.summary}`,
        preferredPlanId: planForRole.synthesizer,
        confidence: 0.7,
        reasons: finalSolution.steps.length
          ? finalSolution.steps.slice(0, 3).map((step) => `Step: ${step}`)
          : ["Synthesized from agent proposals."],
        disconfirmingTest: finalSolution.risks[0] || "Key risk invalidates the recommended path.",
        references: [],
        timestamp: new Date(baseTimestamp + index * 180000).toISOString(),
      });
      return;
    }

    const proposal = byAgent.get(agent.role);
    if (!proposal) return;
    messages.push({
      id: `msg-${agent.role}`,
      agent: agent.role,
      content: `${proposal.summary}\n${proposal.proposal}\nRisk: ${proposal.risk} (severity ${proposal.riskSeverity})`,
      preferredPlanId: planForRole[agent.role],
      confidence: proposal.confidence,
      reasons: proposal.rationale,
      disconfirmingTest: `Validate this proposal for "${scenario}" with a targeted test.`,
      references: [],
      timestamp: new Date(baseTimestamp + index * 180000).toISOString(),
    });
  });

  return messages;
};


const plansFromProposals = (
  proposals: Array<{ agent: DebateAgent["role"]; proposal: string; rationale: string[]; confidence: number }>,
): DebatePlan[] => {
  const order: DebateAgent["role"][] = ["planner", "skeptic", "security", "cost"];
  return order.map((role, index) => {
    const proposal = proposals.find((item) => item.agent === role);
    return {
      id: `plan-${String.fromCharCode(97 + index)}`,
      title: proposal ? `${role} proposal` : `Plan ${index + 1}`,
      summary: proposal?.proposal ?? "No proposal available.",
      steps: proposal?.rationale?.length ? proposal.rationale : ["Gather details", "Draft approach", "Validate outcome"],
      risks: ["Requires validation against real-world constraints."],
    };
  });
};

const initialProbabilitiesForPlans = (
  baseTime: Date,
  plans: DebatePlan[],
): ProbabilityEntry[] => {
  const timestamp = toTimestamp(baseTime, 1);
  return plans.map((plan) => ({
    planId: plan.id,
    probability: 0.25,
    updatedBy: "planner",
    rationale: "Initial prior assigned by Planner.",
    timestamp,
  }));
};

const evaluateVerification = (
  previous: ProbabilityEntry[],
  verification: VerificationResult,
  planId: string,
  baseTime: Date,
  weight: number,
): ProbabilityEntry[] => {
  const timestamp = toTimestamp(baseTime, 16);
  const reliability = verification.reliability ?? (verification.passed ? 0.9 : 0.75);
  const effectiveWeight = clampWeight(weight * reliability);
  const targetProbability = verification.passed ? 0.82 : 0.18;
  const updated = applyWeightedUpdate(
    previous,
    {
      planId,
      probability: targetProbability,
      updatedBy: "synthesizer",
      rationale: verification.passed
        ? "Verification passed; confidence boosted with damping."
        : "Verification failed; confidence reduced with damping.",
    },
    timestamp,
    effectiveWeight,
  );
  return dampAndNormalize(updated.map((entry) => ({ ...entry, timestamp })));
};

const reviseFromAgent = (
  previous: ProbabilityEntry[],
  agent: ProbabilityEntry["updatedBy"],
  updates: Array<{ planId: string; probability: number; rationale: string }>,
  baseTime: Date,
  offset: number,
  weight = 0.4,
): ProbabilityEntry[] => {
  const timestamp = toTimestamp(baseTime, offset);
  let result = previous;
  updates.forEach((update) => {
    result = applyWeightedUpdate(
      result,
      { planId: update.planId, probability: update.probability, updatedBy: agent, rationale: update.rationale },
      timestamp,
      weight,
    );
  });
  return dampAndNormalize(result.map((entry) => ({ ...entry, timestamp })));
};

const buildTimeline = (
  baseTime: Date,
  adapterName: string,
  runVerification: boolean,
): DebateTimelineEvent[] => [
  {
    id: "timeline-plans",
    label: "Plans proposed",
    timestamp: toTimestamp(baseTime, 0),
    details: "Planner proposed four candidate plans.",
  },
  {
    id: "timeline-debate",
    label: "Debate round",
    timestamp: toTimestamp(baseTime, 9),
    details: "Skeptic, Security, and Cost reviewed the plan set.",
  },
  {
    id: "timeline-verification",
    label: "Verification run",
    timestamp: toTimestamp(baseTime, 15),
    details: runVerification
      ? `Verification run executed via ${adapterName} adapter.`
      : "Verification skipped for this run; evidence based on debate only.",
  },
  {
    id: "timeline-synthesis",
    label: "Synthesized outcome",
    timestamp: toTimestamp(baseTime, 18),
    details: "Synthesizer produced final recommendation and patch.",
  },
];

const buildEvidence = (
  baseTime: Date,
  verification: VerificationResult,
  planId: string,
  runVerification: boolean,
  generationWarnings: string[],
  plans: DebatePlan[],
  includePatch: boolean,
): EvidenceLedgerEntry[] => {
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedSummary = selectedPlan?.summary ?? "Selected plan summary unavailable.";
  const selectedRisk = selectedPlan?.risks?.[0] ?? "Primary risk not specified.";
  const verificationEntry: EvidenceLedgerEntry = runVerification
    ? {
        id: "evidence-verification",
        planId,
        agent: "synthesizer",
        type: "test",
        summary: verification.summary,
        details: verification.output,
        reliability: verification.reliability ?? (verification.passed ? 0.9 : 0.75),
        timestamp: toTimestamp(baseTime, 16),
      }
    : {
        id: "evidence-verification",
        planId,
        agent: "synthesizer",
        type: "analysis",
        summary: "Verification skipped.",
        details: "Verification was skipped for this run; evidence relies on agent debate.",
        reliability: 0.55,
        timestamp: toTimestamp(baseTime, 16),
      };

  const warningEntries = generationWarnings.map((warning, index) => ({
    id: `evidence-generation-warning-${index}`,
    planId,
    agent: "synthesizer",
    type: "log" as const,
    summary: "Generation warning",
    details: warning,
    reliability: 0.35,
    timestamp: toTimestamp(baseTime, 5 + index),
  }));

  const entries: EvidenceLedgerEntry[] = [
    {
      id: "evidence-planner",
      planId,
      agent: "planner",
      type: "analysis",
      summary: "Planner rationale captured for selected plan.",
      details: selectedSummary,
      reliability: 0.62,
      timestamp: toTimestamp(baseTime, 2),
    },
    {
      id: "evidence-security",
      planId,
      agent: "security",
      type: "analysis",
      summary: "Security flagged key risk for selected plan.",
      details: selectedRisk,
      reliability: 0.7,
      timestamp: toTimestamp(baseTime, 7),
    },
    ...warningEntries,
    verificationEntry,
    ...(verification.warning
      ? [
          {
            id: "evidence-warning",
            planId,
            agent: "synthesizer",
            type: "log",
            summary: "Verification warning",
            details: verification.warning,
            reliability: 0.4,
            timestamp: toTimestamp(baseTime, 17),
          },
        ]
      : []),
  ];

  if (includePatch) {
    entries.push({
      id: "evidence-patch",
      planId,
      agent: "synthesizer",
      type: "patch",
      summary: "Example patch output.",
      details: buildDiff().diff,
      reliability: 0.8,
      timestamp: toTimestamp(baseTime, 18),
    });
  }

  return entries;
};

const buildUncertaintySummary = (
  plans: DebatePlan[],
  entries: ProbabilityEntry[],
  runVerification: boolean,
): string => {
  const sorted = [...entries].sort((a, b) => b.probability - a.probability);
  const leading = sorted[0];
  const leadingPlan = plans.find((plan) => plan.id === leading.planId);
  const leadingTitle = leadingPlan?.title ?? leading.planId;
  const remaining = Math.max(0, 1 - leading.probability);
  const verificationNote = runVerification ? "after verification" : "without verification";

  return `${leadingTitle} leads at ${leading.probability.toFixed(2)} ${verificationNote}; remaining uncertainty is ${remaining.toFixed(2)} across other plans.`;
};

export const runDebate = async (
  scenario?: string,
  options?: { weights?: DebateWeights; runVerification?: boolean; llmProvider?: LlmProvider },
): Promise<DebateSession> => {
  const adapter = selectAdapter();
  const baseTime = new Date();
  const weights = resolveWeights(options?.weights);
  const scenarioText = scenario ?? defaultScenario;
  const runVerificationRequested = options?.runVerification ?? true;
  const providerOverride = options?.llmProvider;
  const isCodeScenario = (text: string) => {
    const lowered = text.toLowerCase();
    return [
      "code",
      "bug",
      "error",
      "stack",
      "test",
      "build",
      "deploy",
      "api",
      "repo",
      "typescript",
      "javascript",
      "python",
      "rust",
      "java",
      "compile",
      "runtime",
      "exception",
    ].some((word) => lowered.includes(word));
  };
  const codeScenario = isCodeScenario(scenarioText);
  const runVerification = codeScenario ? (runVerificationRequested || codeScenario) : false;
  const llmConfig = getLlmConfig(providerOverride);
  let plans = basePlans;
  const generationWarnings: string[] = [];
  if (!llmConfig.enabled) {
    throw new Error(
      "LLM provider is not configured. Check GROQ_API_KEY/GROQ_MODEL or OLLAMA_URL/OLLAMA_MODEL.",
    );
  }
  let promptCategory: string | undefined;
  try {
    promptCategory = await classifyPrompt({ scenario: scenarioText, providerOverride });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown prompt classification error.";
    generationWarnings.push(`Prompt classification failed; defaulting to reasoning-analysis. ${message}`);
    promptCategory = "reasoning-analysis";
  }

  let verification: VerificationResult = {
    passed: true,
    output: "Verification skipped.",
    durationMs: 0,
    summary: "Verification skipped.",
    adapterName: adapter.name,
  };
  let evidenceForAgents: { summary: string; output: string } | undefined;

  if (codeScenario && !runVerificationRequested) {
    generationWarnings.push("Verification was auto-enabled for code-related scenarios.");
  }

  let proposals: Array<{ agent: DebateAgent["role"]; proposal: string; summary: string; risk: string; riskSeverity: number; rationale: string[]; confidence: number }> = [];
  let finalSolution: { summary: string; steps: string[]; risks: string[]; assumptions: string[] } | undefined;
  let transcript: DebateMessage[] = [];
  let finalResponse: string | undefined;
  let transcriptModel = llmConfig.model;
  let transcriptPromptVersion = llmConfig.promptVersion;

  if (llmConfig.enabled) {
    for (const agent of agents) {
      if (agent.role === "synthesizer") continue;
      try {
        const draft = await generateAgentProposal({
          agent,
          scenario: scenarioText,
          weights,
          evidence: evidenceForAgents,
          promptCategory,
          providerOverride,
        });
        proposals.push({
          agent: agent.role,
          proposal: draft.proposal,
          summary: draft.summary,
          risk: draft.risk,
          riskSeverity: draft.riskSeverity,
          rationale: draft.rationale,
          confidence: draft.confidence,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown proposal error.";
        generationWarnings.push(`[${agent.role}] Proposal generation failed. ${message}`);
      }
    }

    transcript = buildTranscriptFromProposals(baseTime, scenarioText, proposals, finalSolution);
  }

  if (proposals.length === 0) {
    throw new Error("LLM proposal generation failed for all agents.");
  }

  if (proposals.length > 0) {
    plans = plansFromProposals(proposals);
  }

  if (runVerification) {
    try {
      const proposalPlanMap = new Map<DebateAgent["role"], string>([
        ["planner", "plan-a"],
        ["skeptic", "plan-b"],
        ["security", "plan-c"],
        ["cost", "plan-d"],
      ]);
      const ranked = proposals
        .map((proposal) => ({
          planId: proposalPlanMap.get(proposal.agent) ?? "plan-a",
          confidence: proposal.confidence,
        }))
        .sort((a, b) => b.confidence - a.confidence);
      const targetPlanId = ranked[0]?.planId ?? plans[0]?.id ?? "plan-a";
      const targetPlan = plans.find((plan) => plan.id === targetPlanId) ?? plans[0];

      const verificationMode = (process.env.VERIFICATION_MODE ?? "auto").toLowerCase();
      const mode =
        verificationMode === "real"
          ? "real"
          : verificationMode === "mock"
            ? "mock"
            : codeScenario
              ? "real"
              : "mock";
      const result = await callMcpTool("verify_plan", {
        sessionId: `session-${baseTime.getTime()}`,
        planId: targetPlanId,
        mode,
        fixturePath: process.env.VERIFICATION_FIXTURE_PATH,
        command: process.env.VERIFICATION_COMMAND,
      });
      verification = {
        passed: result.status === "pass",
        output: result.logs.join("\n"),
        durationMs: new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime(),
        summary: result.summary,
        reliability: result.reliability,
        adapterName: "mcp",
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        warning: result.status === "error" ? "MCP verification error; falling back to mock." : undefined,
      };

      if (result.status === "error") {
        const fallback = await mockAdapter.runVerification({
          scenario: scenarioText,
          plan: targetPlan ?? plans[1],
        });
        verification = {
          ...fallback,
          warning: "MCP verification failed; fell back to mock.",
          adapterName: "mock",
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown verification error.";
      generationWarnings.push(`MCP verification failed; fell back to mock. ${message}`);
      const fallback = await mockAdapter.runVerification({
        scenario: scenarioText,
        plan: plans[1],
      });
      verification = {
        ...fallback,
        warning: "MCP verification failed; fell back to mock.",
        adapterName: "mock",
      };
    }
  }

  evidenceForAgents =
    runVerification && codeScenario
      ? {
          summary: verification.summary,
          output: verification.output,
        }
      : undefined;

  try {
    if (proposals.length > 0) {
      finalSolution = await generateFinalSolution({
        scenario: scenarioText,
        proposals: proposals.map((proposal) => ({
          proposal: proposal.proposal,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
        })),
        evidence: evidenceForAgents,
        providerOverride,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown final solution error.";
    generationWarnings.push(`Final solution generation failed. ${message}`);
  }

  try {
    if (finalSolution && proposals.length > 0) {
      finalResponse = await generateFinalResponse({
        scenario: scenarioText,
        promptCategory,
        finalSolution,
        proposals: proposals.map((proposal) => ({
          proposal: proposal.proposal,
          rationale: proposal.rationale,
          confidence: proposal.confidence,
        })),
        evidence: evidenceForAgents,
        codeScenario,
        providerOverride,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown final response error.";
    generationWarnings.push(`Final response generation failed. ${message}`);
  }

  if (!finalSolution && plans[1]) {
    finalSolution = {
      summary: plans[1].summary,
      steps: plans[1].steps,
      risks: plans[1].risks,
      assumptions: ["Assumptions not explicitly generated; use caution."],
    };
  }
  if (!finalResponse) {
    finalResponse = finalSolution?.summary ?? plans[1]?.summary ?? "No response generated.";
  }
  const probabilities: ProbabilitySnapshot[] = [];

  const initial = dampAndNormalize(initialProbabilitiesForPlans(baseTime, plans));
  probabilities.push(recordSnapshot(toTimestamp(baseTime, 1), "Initial priors.", initial));

  const proposalOrder: DebateAgent["role"][] = ["planner", "skeptic", "security", "cost"];
  const proposalPlanMap = new Map<DebateAgent["role"], string>([
    ["planner", "plan-a"],
    ["skeptic", "plan-b"],
    ["security", "plan-c"],
    ["cost", "plan-d"],
  ]);

  let current = initial;
  if (proposals.length > 0) {
    proposalOrder.forEach((role, index) => {
      const proposal = proposals.find((item) => item.agent === role);
      if (!proposal) return;
      const planId = proposalPlanMap.get(role) ?? "plan-a";
      const agentWeight = weights[role];
      current = reviseFromAgent(
        current,
        role,
        [
          {
            planId,
            probability: proposal.confidence,
            rationale: proposal.rationale[0] ?? "Agent proposal applied.",
          },
        ],
        baseTime,
        2 + index * 2,
        agentWeight,
      );
      probabilities.push(
        recordSnapshot(
          toTimestamp(baseTime, 2 + index * 2),
          `${role} proposal applied.`,
          current,
        ),
      );
    });
  }

  let verified = current;
  const pickFinalPlanId = () => {
    const sorted = [...verified].sort((a, b) => b.probability - a.probability);
    return sorted[0]?.planId ?? "plan-a";
  };

  if (runVerification) {
    const targetPlanId = pickFinalPlanId();
    verified = evaluateVerification(
      current,
      verification,
      targetPlanId,
      baseTime,
      weights.synthesizer,
    );
    probabilities.push(
      recordSnapshot(
        toTimestamp(baseTime, 16),
        "Verification results applied.",
        verified,
      ),
    );
  } else if (proposals.length > 0) {
    const targetPlanId = pickFinalPlanId();
    const skipped = reviseFromAgent(
      current,
      "synthesizer",
      [
        {
          planId: targetPlanId,
          probability: Math.min(0.7, (current.find((entry) => entry.planId === targetPlanId)?.probability ?? 0.5) + 0.05),
          rationale: "Synthesizer tempered confidence without verification.",
        },
      ],
      baseTime,
      16,
      weights.synthesizer,
    );
    verified = skipped;
    probabilities.push(
      recordSnapshot(
        toTimestamp(baseTime, 16),
        "Verification skipped; synthesizer adjusted confidence.",
        verified,
      ),
    );
  }

  const adapterName = verification.adapterName ?? adapter.name;
  const finalDiff = buildDiff();
  const finalPlanId = [...verified].sort((a, b) => b.probability - a.probability)[0]?.planId ?? "plan-a";
  const timeline = buildTimeline(baseTime, adapterName, runVerification);
  const evidenceLedger =
    runVerification && codeScenario
      ? buildEvidence(
          baseTime,
          verification,
          finalPlanId,
          runVerification,
          generationWarnings,
          plans,
          true,
        )
      : [];
  const uncertaintySummary = buildUncertaintySummary(plans, verified, runVerification);
  const finalSnapshot = verified;
  const finalPlan = plans.find((plan) => plan.id === finalPlanId);
  const finalEntry = finalSnapshot.find((entry) => entry.planId === finalPlanId);
  const probability = finalEntry?.probability ?? 0;
  const variance =
    probability >= 0.66 ? "low" : probability >= 0.5 ? "medium" : "high";
  const daytonaNote = codeScenario
    ? "Daytona verification included in the reasoning."
    : undefined;
  const beliefStatement = finalSolution
    ? (daytonaNote ? `${finalSolution.summary} ${daytonaNote}` : finalSolution.summary)
    : finalPlan
      ? `Most likely plan to address the scenario is \"${finalPlan.title}\".`
      : "Most likely plan identified.";
  const actionRecommendation = finalSolution
    ? (daytonaNote ? `${finalSolution.summary} ${daytonaNote}` : finalSolution.summary)
    : finalPlan
      ? `If the assumptions hold, proceed with \"${finalPlan.title}\".`
      : "Proceed with the selected plan if assumptions hold.";
  const actionAssumptions = finalSolution?.assumptions ?? [
    runVerification ? "Verification evidence available." : "Verification skipped; theoretical run.",
    codeScenario ? "Code scenario detected; verification prioritized." : "Scenario is non-code.",
  ];

  return {
    id: `session-${baseTime.getTime()}`,
    scenario: scenarioText,
    createdAt: baseTime.toISOString(),
    agents,
    plans,
    transcript,
    probabilities,
    evidenceLedger,
    timeline,
    finalPlanId,
    finalDiff,
    adapter: adapterName,
    weights,
    runVerification,
    uncertaintySummary,
    model: transcriptModel,
    promptVersion: transcriptPromptVersion,
    generationWarnings,
    proposals,
    finalSolution,
    promptCategory,
    winningAgent: proposalOrder.find((role) => proposalPlanMap.get(role) === finalPlanId),
    codeScenario,
    daytonaOutput: runVerification && codeScenario ? verification.output : undefined,
    belief: {
      statement: beliefStatement,
      probability,
      variance,
    },
    action: {
      recommendation: actionRecommendation,
      assumptions: actionAssumptions,
      response: finalResponse,
    },
  };
};
