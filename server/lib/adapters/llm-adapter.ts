import type { DebateAgent, DebateWeights } from "../../../src/lib/probability-parliament-types";

export type LlmProvider = "groq" | "ollama";

type LlmConfig = {
  enabled: boolean;
  url?: string;
  apiKey?: string;
  model?: string;
  provider: LlmProvider;
  temperature: number;
  agentTemperature: number;
  maxTokens: number;
  promptVersion: string;
};

export const getLlmConfig = (providerOverride?: LlmProvider): LlmConfig => {
  const providerRaw = providerOverride ?? process.env.LLM_PROVIDER ?? "groq";
  const provider = providerRaw === "ollama" ? "ollama" : "groq";
  const url =
    provider === "ollama"
      ? process.env.OLLAMA_URL ?? process.env.LLM_URL
      : process.env.GROQ_URL ?? process.env.LLM_URL ?? "https://api.groq.com/openai/v1/chat/completions";
  const apiKey =
    provider === "groq"
      ? process.env.GROQ_API_KEY ?? process.env.LLM_API_KEY
      : process.env.LLM_API_KEY;
  const model =
    provider === "ollama"
      ? process.env.OLLAMA_MODEL ?? process.env.LLM_MODEL
      : process.env.GROQ_MODEL ?? process.env.LLM_MODEL ?? "llama-3.1-70b-versatile";
  const temperature = Number(process.env.LLM_TEMPERATURE ?? 0.2);
  const agentTemperature = Number(process.env.LLM_AGENT_TEMPERATURE ?? 0.6);
  const maxTokens = Number(process.env.LLM_MAX_TOKENS ?? 400);
  const promptVersion = process.env.LLM_PROMPT_VERSION ?? "v1";

  return {
    enabled: Boolean(
      model &&
        (provider === "ollama" ? (url ?? "http://localhost:11434") : url && apiKey),
    ),
    url: url || (provider === "ollama" ? "http://localhost:11434" : undefined),
    apiKey,
    model,
    provider,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    agentTemperature: Number.isFinite(agentTemperature) ? agentTemperature : 0.6,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 400,
    promptVersion,
  };
};

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const ensureArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
};

const extractJson = (text: string) => {
  const fencedMatch = text.match(/```json\\s*([\\s\\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return trimmed;
};

const parseJsonWithRepair = <T>(raw: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Repair: strip common wrappers and re-extract JSON.
    const repaired = extractJson(raw);
    return JSON.parse(repaired) as T;
  }
};

const detailTier = (weight: number) => {
  if (weight >= 0.7) return "high";
  if (weight >= 0.45) return "medium";
  return "low";
};

const reasonsTarget = (weight: number) => {
  if (weight >= 0.7) return 4;
  if (weight >= 0.5) return 3;
  if (weight >= 0.3) return 2;
  return 1;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickStyleCue = (scenario: string, role: DebateAgent["role"]) => {
  const styles = [
    "concise and structured",
    "pragmatic and action-oriented",
    "analytical and risk-aware",
    "creative but grounded",
    "skeptical with counterexamples",
  ];
  const index = hashString(`${scenario}:${role}`) % styles.length;
  return styles[index];
};

const focusAreasForRole = (role: DebateAgent["role"]) => {
  switch (role) {
    case "planner":
      return ["steps", "dependencies", "milestones", "resources", "risks"];
    case "skeptic":
      return ["assumptions", "edge cases", "failure modes", "counterexamples", "trade-offs"];
    case "security":
      return ["attack surface", "data handling", "privilege", "compliance", "abuse cases"];
    case "cost":
      return ["engineering effort", "operational cost", "timeline", "maintenance", "scope"];
    case "synthesizer":
      return ["decision", "trade-offs", "next step", "constraints", "confidence"];
    default:
      return [];
  }
};

const pickFocusAreas = (scenario: string, role: DebateAgent["role"], weight: number) => {
  const pool = focusAreasForRole(role);
  if (pool.length === 0) return [];
  const count = weight >= 0.7 ? 3 : weight >= 0.4 ? 2 : 1;
  const start = hashString(`${scenario}:${role}:focus`) % pool.length;
  return Array.from({ length: count }, (_, idx) => pool[(start + idx) % pool.length]);
};

export type AgentProposalDraft = {
  proposal: string;
  summary: string;
  risk: string;
  riskSeverity: number;
  rationale: string[];
  confidence: number;
};

export type FinalSolutionDraft = {
  summary: string;
  steps: string[];
  risks: string[];
  assumptions: string[];
};

export type PromptCategory =
  | "information-seeking"
  | "reasoning-analysis"
  | "instruction-following"
  | "creative-generation"
  | "transformation"
  | "decision-support"
  | "exploratory-ideation"
  | "critique-adversarial"
  | "meta-prompt"
  | "simulation-roleplay"
  | "tool-using-agentic"
  | "alignment-constraint"
  | "learning-tutoring"
  | "reflective-sensemaking";

const validateProposal = (draft: AgentProposalDraft, minReasons: number) => {
  if (!draft.proposal || !draft.summary || !draft.risk) {
    throw new Error("Proposal missing.");
  }
  draft.rationale = ensureArray(draft.rationale);
  if (draft.rationale.length < minReasons) {
    throw new Error("Proposal missing required rationale.");
  }
  const riskSeverity = Number(draft.riskSeverity ?? 3);
  draft.riskSeverity = Math.min(5, Math.max(1, Math.round(riskSeverity)));
  draft.confidence = clampUnit(draft.confidence ?? 0.5);
  return draft;
};

const validateFinalSolution = (draft: FinalSolutionDraft) => {
  if (!draft.summary) {
    throw new Error("Final solution missing summary.");
  }
  draft.steps = ensureArray(draft.steps);
  draft.risks = ensureArray(draft.risks);
  draft.assumptions = ensureArray(draft.assumptions);
  if (draft.steps.length < 2) {
    throw new Error("Final solution missing steps.");
  }
  if (draft.risks.length < 1) {
    throw new Error("Final solution missing risks.");
  }
  if (draft.assumptions.length < 1) {
    throw new Error("Final solution missing assumptions.");
  }
  return draft;
};

const postChat = async (config: LlmConfig, body: Record<string, unknown>) => {
  const response = await fetch(
    config.provider === "ollama" ? `${config.url}/api/chat` : config.url ?? "",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.provider === "groq" && config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content =
    config.provider === "ollama" ? payload.message?.content : payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response missing content.");
  }
  return content;
};

export const generateAgentProposal = async (input: {
  agent: DebateAgent;
  scenario: string;
  weights: DebateWeights;
  evidence?: { summary: string; output: string };
  promptCategory?: string;
  providerOverride?: LlmProvider;
}): Promise<AgentProposalDraft> => {
  const config = getLlmConfig(input.providerOverride);
  if (!config.enabled || !config.url || !config.model) {
    throw new Error("LLM is not configured.");
  }

  const weight = input.weights[input.agent.role];
  const minReasons = reasonsTarget(weight);
  const tier = detailTier(weight);
  const styleCue = pickStyleCue(input.scenario, input.agent.role);
  const focusAreas = pickFocusAreas(input.scenario, input.agent.role, weight);
  const evidenceBlock = input.evidence
    ? [
        "Evidence summary:",
        input.evidence.summary,
        "Evidence excerpt:",
        input.evidence.output.length > 600 ? `${input.evidence.output.slice(0, 600)}...` : input.evidence.output,
      ].join("\n")
    : "No evidence available.";

  const messages = [
    {
      role: "system",
      content:
        "Return ONLY JSON: {\"summary\":\"\",\"proposal\":\"\",\"risk\":\"\",\"riskSeverity\":1,\"rationale\":[\"\"],\"confidence\":0.0}. Do not mention plans.",
    },
    {
      role: "user",
      content: [
        `Scenario: ${input.scenario}`,
        input.promptCategory ? `Prompt category: ${input.promptCategory}` : "Prompt category: unknown",
        `Agent role: ${input.agent.role}. Goal: ${input.agent.goal}`,
        `Detail level: ${tier}.`,
        `Style cue: ${styleCue}`,
        focusAreas.length ? `Focus areas: ${focusAreas.join(", ")}` : "Focus areas: none",
        evidenceBlock,
        "Include a one-sentence summary of your proposal.",
        "Include the single highest risk and a severity from 1-5.",
        `Return rationale array with at least ${minReasons} items.`,
      ].join("\n"),
    },
  ];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const retryMessages =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "Retry: Output must be strict JSON only with the exact keys. No prose, no markdown.",
            },
          ];
    const content = await postChat(
      config,
      config.provider === "ollama"
        ? {
            model: config.model,
            messages: retryMessages,
            stream: false,
            format: "json",
            options: {
              temperature: Math.min(0.4, config.agentTemperature),
              num_predict: config.maxTokens,
            },
          }
        : {
            model: config.model,
            temperature: Math.min(0.4, config.agentTemperature),
            max_tokens: config.maxTokens,
            messages: retryMessages,
          },
    );

    let parsed: AgentProposalDraft;
    try {
      parsed = parseJsonWithRepair<AgentProposalDraft>(content);
    } catch (error) {
      if (attempt < 2) continue;
      throw new Error("LLM proposal response was not valid JSON.");
    }

    try {
      return validateProposal(parsed, minReasons);
    } catch (error) {
      if (attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("LLM proposal failed validation.");
};

export const generateFinalSolution = async (input: {
  scenario: string;
  proposals: AgentProposalDraft[];
  evidence?: { summary: string; output: string };
  providerOverride?: LlmProvider;
}): Promise<FinalSolutionDraft> => {
  const config = getLlmConfig(input.providerOverride);
  if (!config.enabled || !config.url || !config.model) {
    throw new Error("LLM is not configured.");
  }

  const evidenceBlock = input.evidence
    ? [
        "Evidence summary:",
        input.evidence.summary,
        "Evidence excerpt:",
        input.evidence.output.length > 600 ? `${input.evidence.output.slice(0, 600)}...` : input.evidence.output,
      ].join("\n")
    : "No evidence available.";

  const proposalBlock = input.proposals
    .map((proposal, index) => `Agent ${index + 1}: ${proposal.proposal}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content:
        "Return ONLY JSON: {\"summary\":\"\",\"steps\":[\"\",\"\"],\"risks\":[\"\"],\"assumptions\":[\"\"]}. Provide an actionable response tailored to the prompt.",
    },
    {
      role: "user",
      content: [
        `Scenario: ${input.scenario}`,
        "Agent proposals:",
        proposalBlock || "No proposals available.",
        evidenceBlock,
      ].join("\n"),
    },
  ];

  let parsed: FinalSolutionDraft | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const retryMessages =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "Retry: Output must be strict JSON only with the exact keys. No prose, no markdown.",
            },
          ];
    const content = await postChat(
      config,
      config.provider === "ollama"
        ? {
            model: config.model,
            messages: retryMessages,
            stream: false,
            format: "json",
            options: {
              temperature: Math.min(0.4, config.agentTemperature),
              num_predict: 500,
            },
          }
        : {
            model: config.model,
            temperature: Math.min(0.4, config.agentTemperature),
            max_tokens: 500,
            messages: retryMessages,
          },
    );
    try {
      parsed = parseJsonWithRepair<FinalSolutionDraft>(content);
      break;
    } catch (error) {
      if (attempt >= 2) {
        throw new Error("LLM final solution response was not valid JSON.");
      }
    }
  }

  if (!parsed) {
    throw new Error("LLM final solution response was not valid JSON.");
  }
  return validateFinalSolution(parsed);
};

export const generateFinalResponse = async (input: {
  scenario: string;
  promptCategory?: string;
  finalSolution: FinalSolutionDraft;
  proposals: AgentProposalDraft[];
  evidence?: { summary: string; output: string };
  codeScenario?: boolean;
  providerOverride?: LlmProvider;
}): Promise<string> => {
  const config = getLlmConfig(input.providerOverride);
  if (!config.enabled || !config.url || !config.model) {
    throw new Error("LLM is not configured.");
  }

  const evidenceBlock = input.evidence
    ? [
        "Evidence summary:",
        input.evidence.summary,
        "Evidence excerpt:",
        input.evidence.output.length > 600 ? `${input.evidence.output.slice(0, 600)}...` : input.evidence.output,
      ].join("\n")
    : "No evidence available.";

  const proposalBlock = input.proposals
    .map((proposal, index) => `Agent ${index + 1}: ${proposal.proposal}`)
    .join("\n");

  const outputGuidance = input.codeScenario
    ? "Return the final deliverable as code. Use a single code block. Do not add a checklist or steps."
    : "Return the final deliverable only as prose. Do not include headings, bullets, or numbered lists unless the prompt explicitly asks for a list.";

  const buildMessages = (strict: boolean) => [
    {
      role: "system",
      content:
        "Return ONLY JSON: {\"response\":\"\"}. Produce a direct, user-facing answer. Do not give meta-recommendations or a plan.",
    },
    {
      role: "user",
      content: [
        `Scenario: ${input.scenario}`,
        input.promptCategory ? `Prompt category: ${input.promptCategory}` : "Prompt category: unknown",
        "Recommended action summary:",
        input.finalSolution.summary,
        input.finalSolution.steps.length ? `Steps: ${input.finalSolution.steps.join(" | ")}` : "Steps: none",
        input.finalSolution.risks.length ? `Risks: ${input.finalSolution.risks.join(" | ")}` : "Risks: none",
        input.finalSolution.assumptions?.length
          ? `Assumptions: ${input.finalSolution.assumptions.join(" | ")}`
          : "Assumptions: none",
        "Agent proposals:",
        proposalBlock || "No proposals available.",
        evidenceBlock,
        "Write the final response by executing the recommended action and steps.",
        outputGuidance,
        strict ? "IMPORTANT: Do not output a plan, checklist, or steps. Provide only the final answer." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const isListLike = (text: string) => {
    if (input.codeScenario) return false;
    return (
      /^\s*(steps|risks|assumptions)\b/i.test(text) ||
      /(^|\n)\s*[-*•]\s+\w+/g.test(text) ||
      /(^|\n)\s*\d+\.\s+\w+/g.test(text)
    );
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages = buildMessages(attempt === 2);
    const content = await postChat(
      config,
      config.provider === "ollama"
        ? {
            model: config.model,
            messages,
            stream: false,
            format: "json",
            options: {
              temperature: Math.min(0.5, config.agentTemperature),
              num_predict: 600,
            },
          }
        : {
            model: config.model,
            temperature: Math.min(0.5, config.agentTemperature),
            max_tokens: 600,
            messages,
          },
    );

    try {
      const parsed = parseJsonWithRepair<{ response?: string }>(content);
      if (!parsed.response) {
        throw new Error("Final response missing response field.");
      }
      const trimmed = parsed.response.trim();
      if (isListLike(trimmed) && attempt < 2) {
        continue;
      }
      return trimmed;
    } catch (error) {
      if (attempt < 2) continue;
      throw new Error("LLM final response was not valid JSON.");
    }
  }

  throw new Error("LLM final response failed validation.");
};

export const classifyPrompt = async (input: {
  scenario: string;
  providerOverride?: LlmProvider;
}): Promise<PromptCategory> => {
  const config = getLlmConfig(input.providerOverride);
  if (!config.enabled || !config.url || !config.model) {
    throw new Error("LLM is not configured.");
  }

  const categories: PromptCategory[] = [
    "information-seeking",
    "reasoning-analysis",
    "instruction-following",
    "creative-generation",
    "transformation",
    "decision-support",
    "exploratory-ideation",
    "critique-adversarial",
    "meta-prompt",
    "simulation-roleplay",
    "tool-using-agentic",
    "alignment-constraint",
    "learning-tutoring",
    "reflective-sensemaking",
  ];

  const messages = [
    {
      role: "system",
      content:
        "Return ONLY JSON: {\"category\":\"\"}. Choose exactly one category from the list provided.",
    },
    {
      role: "user",
      content: [
        `Prompt: ${input.scenario}`,
        `Categories: ${categories.join(", ")}`,
      ].join("\n"),
    },
  ];

  const content = await postChat(
    config,
    config.provider === "ollama"
      ? {
          model: config.model,
          messages,
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
            num_predict: 120,
          },
        }
      : {
          model: config.model,
          temperature: 0.1,
          max_tokens: 120,
          messages,
        },
  );

  let parsed: { category: PromptCategory };
  try {
    parsed = parseJsonWithRepair<{ category: PromptCategory }>(content);
  } catch (error) {
    throw new Error("Prompt category response was not valid JSON.");
  }

  if (!parsed.category || !categories.includes(parsed.category)) {
    throw new Error("Prompt category is invalid.");
  }
  return parsed.category;
};
