import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Play, RotateCcw, Zap } from "lucide-react";
import { DebateWeights } from "@/lib/probability-parliament-types";

interface ControlPanelProps {
  scenario: string;
  onScenarioChange: (value: string) => void;
  weights: DebateWeights;
  onWeightsChange: (weights: DebateWeights) => void;
  runVerification: boolean;
  onRunVerificationChange: (value: boolean) => void;
  llmProvider: "ollama" | "groq";
  onLlmProviderChange: (value: "ollama" | "groq") => void;
  onRunDebate: () => void;
  isRunning: boolean;
  onSeedPrompt: () => void;
}

export function ControlPanel({
  scenario,
  onScenarioChange,
  weights,
  onWeightsChange,
  runVerification,
  onRunVerificationChange,
  llmProvider,
  onLlmProviderChange,
  onRunDebate,
  isRunning,
  onSeedPrompt,
}: ControlPanelProps) {
  const handleWeightChange = (role: keyof DebateWeights, value: number[]) => {
    onWeightsChange({
      ...weights,
      [role]: value[0] / 100,
    });
  };

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Model provider (affects where the simulation runs)
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={llmProvider === "ollama" ? "default" : "outline"}
              size="sm"
              onClick={() => onLlmProviderChange("ollama")}
            >
              Local (Ollama)
            </Button>
            <Button
              type="button"
              variant={llmProvider === "groq" ? "default" : "outline"}
              size="sm"
              onClick={() => onLlmProviderChange("groq")}
            >
              API (Groq)
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="scenario" className="text-sm font-medium">
              Debate Scenario
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSeedPrompt}
              className="h-6 text-xs text-muted-foreground hover:text-foreground"
            >
              <Zap className="mr-1 h-3 w-3" />
              Use Example
            </Button>
          </div>
          <Textarea
            id="scenario"
            placeholder="Describe a complex software architecture or decision..."
            className="min-h-[100px] resize-none bg-background/50"
            value={scenario}
            onChange={(e) => onScenarioChange(e.target.value)}
          />
        </div>

        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Agent Influence Weights</Label>
            
            <div className="space-y-4">
              {(Object.keys(weights) as Array<keyof DebateWeights>).map((role) => (
                <div key={role} className="space-y-2">
                  <div className="flex items-center justify-between text-xs capitalize">
                    <span>{role}</span>
                    <span className="text-muted-foreground">{Math.round(weights[role] * 100)}%</span>
                  </div>
                  <Slider 
                    value={[weights[role] * 100]} 
                    max={100} 
                    step={1} 
                    className="h-2"
                    onValueChange={(val) => handleWeightChange(role, val)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between space-x-2 pt-2">
            <Label htmlFor="verification-mode" className="flex flex-col space-y-1">
              <span className="text-sm font-medium">Verification Mode</span>
              <span className="text-xs text-muted-foreground">Require evidence logs</span>
            </Label>
            <Switch 
              id="verification-mode" 
              checked={runVerification}
              onCheckedChange={onRunVerificationChange}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={onRunDebate} 
            disabled={isRunning || !scenario.trim()} 
            className="flex-1"
          >
            {isRunning ? (
              <>
                <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
                Running Simulation...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Debate
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
