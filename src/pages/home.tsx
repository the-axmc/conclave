import { useState } from "react";
import { runDebate } from "@/lib/api-client";
import { DebateSession, DebateWeights } from "@/lib/probability-parliament-types";
import { TranscriptPanel } from "@/components/probability-parliament/transcript-panel";
import { ProbabilityPanel } from "@/components/probability-parliament/probability-panel";
import { ControlPanel } from "@/components/probability-parliament/control-panel";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

const STARTER_PROMPTS = [
  "Design a small Python program that generates SVG animals from primitives.",
  "Plan a low-risk rollout for a major API version upgrade.",
  "Create a simple onboarding flow for a fintech app with compliance constraints.",
  "I want to visit Africa on a road trip. Propose alternative routes and trade-offs.",
  "Propose a recovery plan for a production incident caused by a bad deploy.",
  "How should we prioritize performance vs. accuracy in a recommendation system?",
  "Will ETH go up? Provide a fundamental analysis of the crypto market.",
];

const DEFAULT_WEIGHTS: DebateWeights = {
  planner: 0.35,
  skeptic: 0.45,
  security: 0.5,
  cost: 0.4,
  synthesizer: 0.6,
};

export function HomePage() {
  const [scenario, setScenario] = useState("");
  const [weights, setWeights] = useState<DebateWeights>(DEFAULT_WEIGHTS);
  const [runVerification, setRunVerification] = useState(true);
  const [llmProvider, setLlmProvider] = useState<"ollama" | "groq">("ollama");
  const [session, setSession] = useState<DebateSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const handleRunDebate = async () => {
    if (!scenario.trim()) return;

    setIsLoading(true);
    try {
      const newSession = await runDebate(scenario, weights, runVerification, llmProvider);
      setSession(newSession);
      toast.success("Debate simulation completed successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to run debate simulation.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedPrompt = () => {
    const index = Math.floor(Math.random() * STARTER_PROMPTS.length);
    setScenario(STARTER_PROMPTS[index]);
  };

  return (
    <main className="flex h-screen flex-col bg-background overflow-hidden">
      <header className="flex items-center px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/conclave.png"
            alt="Conclave"
            className="h-6 w-6 rounded-full object-cover"
          />
          <h1 className="text-xl font-bold tracking-tight">Conclave</h1>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          v1.0.0-beta
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Controls & Transcript */}
        <div className="w-[450px] flex flex-col border-r bg-muted/10">
          <div className="p-4 border-b">
            <ControlPanel
              scenario={scenario}
              onScenarioChange={setScenario}
              weights={weights}
              onWeightsChange={setWeights}
              runVerification={runVerification}
              onRunVerificationChange={setRunVerification}
              verificationNote={session?.verificationNote}
              llmProvider={llmProvider}
              onLlmProviderChange={setLlmProvider}
              onRunDebate={handleRunDebate}
              isRunning={isLoading}
              onSeedPrompt={handleSeedPrompt}
            />
          </div>
          <div className="flex-1 overflow-hidden p-4">
            {showTranscript ? (
              <TranscriptPanel messages={session?.transcript || []} />
            ) : (
              <button
                type="button"
                onClick={() => setShowTranscript(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Show transcript
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Visualization & Ledger */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Top: Probability Panel */}
          <div className="p-6 border-b">
            <ProbabilityPanel 
              session={session}
            />
          </div>
        </div>
      </div>
      <Toaster />
    </main>
  );
}
