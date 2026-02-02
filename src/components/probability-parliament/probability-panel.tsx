import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DebateSession } from "@/lib/probability-parliament-types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";

interface ProbabilityPanelProps {
  session: DebateSession | null;
  className?: string;
}

export function ProbabilityPanel({ session, className }: ProbabilityPanelProps) {
  const snapshots = session?.probabilities || [];
  const plans = session?.plans || [];

  const chartData = useMemo(() => {
    return snapshots.map((snap) => {
      const point: any = { timestamp: new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
      snap.entries.forEach((entry) => {
        point[entry.planId] = entry.probability * 100;
      });
      return point;
    });
  }, [snapshots]);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const finalPlan = session?.finalPlanId ? plans.find((plan) => plan.id === session.finalPlanId) : undefined;
  const synthesizerMessage = session?.transcript?.find((msg) => msg.agent === "synthesizer");
  const proposals = session?.proposals || [];
  const summaryReasons = proposals.length > 0
    ? proposals.map((proposal) => proposal.summary).filter(Boolean).slice(0, 3)
    : synthesizerMessage?.reasons?.slice(0, 2) ?? (finalPlan?.summary ? [finalPlan.summary] : []);
  const keyRisk = finalPlan?.risks?.[0];
  const finalSolution = session?.finalSolution as
    | {
        summary: string;
        steps: string[];
        risks: string[];
        assumptions?: string[];
      }
    | undefined;
  const categoryLabel = session?.promptCategory?.replace(/-/g, " ") ?? "unknown";
  const weightedReview = proposals
    .map((proposal) => {
      const weight = session?.weights?.[proposal.agent] ?? 0;
      return {
        ...proposal,
        weight,
      };
    })
    .sort((a, b) => b.weight - a.weight);
  const debateSummaries = proposals.map((proposal) => proposal.summary).filter(Boolean);
  const highestRisk = proposals.reduce<{ risk?: string; severity?: number }>((acc, proposal) => {
    if (acc.severity === undefined || proposal.riskSeverity > acc.severity) {
      return { risk: proposal.risk, severity: proposal.riskSeverity };
    }
    return acc;
  }, {});
  const hasEvidence = (session?.evidenceLedger?.length || 0) > 0;
  const beliefDelta = useMemo(() => {
    if (!session || !session.finalPlanId || snapshots.length === 0) return null;
    const initial = snapshots[0]?.entries.find((entry) => entry.planId === session.finalPlanId);
    const final = latestSnapshot?.entries.find((entry) => entry.planId === session.finalPlanId);
    if (!initial || !final) return null;
    return {
      initial: initial.probability,
      final: final.probability,
      delta: final.probability - initial.probability,
      hasEvidence: (session.evidenceLedger?.length || 0) > 0,
    };
  }, [session, snapshots, latestSnapshot]);
  
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    plans.forEach((plan, index) => {
      config[plan.id] = {
        label: `Plan ${index + 1}`,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
    });
    return config;
  }, [plans]);

  // Sort plans by probability
  const rankedPlans = useMemo(() => {
    if (!latestSnapshot) return [];
    
    return plans.map(plan => {
      const entry = latestSnapshot.entries.find(e => e.planId === plan.id);
      return {
        ...plan,
        probability: entry ? entry.probability : 0,
        rationale: entry ? entry.rationale : ""
      };
    }).sort((a, b) => b.probability - a.probability);
  }, [plans, latestSnapshot]);

  if (!session) {
    return (
      <Card className={cn("flex flex-col h-full border-none shadow-none bg-transparent items-center justify-center text-muted-foreground", className)}>
        <p>Run a debate to view probability analysis.</p>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col h-full border-none shadow-none bg-transparent", className)}>
      <CardHeader className="px-0 pt-0 pb-4 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">Consensus & Outcome</CardTitle>
          {session.finalPlanId && (
            <Badge variant="outline" className="text-xs">
              Selected: Plan {plans.findIndex(p => p.id === session.finalPlanId) + 1}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 min-h-0 flex flex-col gap-4 overflow-visible">
        <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:auto-rows-fr mb-4">
          <div className="rounded-lg border bg-card/50 p-4 flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Agent Proposals</h3>
                <Badge variant="outline" className="text-[10px]">
                  {categoryLabel}
                </Badge>
                {session?.winningAgent && (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    Winner: {session.winningAgent}
                  </Badge>
                )}
              </div>
            </div>
            <ScrollArea className="mt-3 flex-1 min-h-0 pr-2">
              <div className="space-y-3">
                {proposals.length > 0
                  ? proposals.map((proposal, index) => (
                      <div
                        key={`${proposal.agent}-${index}`}
                        className="rounded-md border p-3 text-xs transition-colors bg-background/60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">{proposal.agent}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {(proposal.confidence * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{proposal.summary}</p>
                        <p className="mt-2 text-muted-foreground">{proposal.proposal}</p>
                        {proposal.rationale?.[0] && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Reason: {proposal.rationale[0]}
                          </p>
                        )}
                      </div>
                    ))
                  : plans.map((plan) => {
                      const isWinner = plan.id === session.finalPlanId;
                      return (
                        <div
                          key={plan.id}
                          className={cn(
                            "rounded-md border p-3 text-xs transition-colors",
                            isWinner ? "border-primary/60 bg-primary/5" : "bg-background/60"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{plan.title}</span>
                            {isWinner && <Badge className="text-[10px]">Selected</Badge>}
                          </div>
                          <p className="mt-1 text-muted-foreground">{plan.summary}</p>
                          {plan.risks?.[0] && (
                            <p className="mt-2 text-[11px] text-amber-600">
                              Risk: {plan.risks[0]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                {proposals.length === 0 && plans.length === 0 && (
                  <div className="text-xs text-muted-foreground">No proposals generated yet.</div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="rounded-lg border bg-card/50 p-4 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Debate Summary</h3>
              {hasEvidence && <Badge variant="outline" className="text-[10px]">Updated after evidence</Badge>}
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              {summaryReasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4">
                  {summaryReasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <div>No summary yet.</div>
              )}
              {debateSummaries.length > 0 && (
                <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                  <div className="text-muted-foreground">All agent summaries</div>
                  <ul className="mt-1 list-disc pl-4 text-foreground/80">
                    {debateSummaries.map((summary, index) => (
                      <li key={index}>{summary}</li>
                    ))}
                  </ul>
                </div>
              )}
              {weightedReview.length > 0 && (
                <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                  <div className="text-muted-foreground">Weighted review</div>
                  <ul className="mt-1 list-disc pl-4 text-foreground/80">
                    {weightedReview.map((item) => (
                      <li key={item.agent}>
                        <span className="capitalize">{item.agent}</span> ({Math.round(item.weight * 100)}%):{" "}
                        {item.rationale?.[0] ?? item.summary ?? item.proposal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(highestRisk.risk || keyRisk) && (
                <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-amber-600">
                  Key risk: {highestRisk.risk ?? keyRisk}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-card/50 p-4 h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Recommended Action (Conditional)</h3>
                <Badge variant="outline" className="text-[10px]">
                  This is the best action under current assumptions, not a prediction.
                </Badge>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <div className="text-sm font-semibold text-foreground">
                {finalSolution?.summary ?? session.action?.recommendation ?? "No action recommendation yet."}
              </div>
              {finalSolution?.steps?.length ? (
                <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                  <div className="text-muted-foreground">Steps</div>
                  <ul className="mt-1 list-disc pl-4 text-foreground/80">
                    {finalSolution.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {finalSolution?.risks?.length ? (
                <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                  <div className="text-muted-foreground">Risks</div>
                  <ul className="mt-1 list-disc pl-4 text-foreground/80">
                    {finalSolution.risks.map((risk, index) => (
                      <li key={index}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                <div className="text-muted-foreground">Assumptions</div>
                <ul className="mt-1 list-disc pl-4 text-foreground/80">
                  {(finalSolution?.assumptions || session.action?.assumptions || []).map((assumption: string, index: number) => (
                    <li key={index}>{assumption}</li>
                  ))}
                  {(!finalSolution?.assumptions?.length && (!session.action?.assumptions || session.action.assumptions.length === 0)) && (
                    <li>No explicit assumptions provided.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card/50 p-4 h-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Response to Prompt</h3>
              {session.codeScenario && <Badge variant="outline" className="text-[10px]">Daytona</Badge>}
            </div>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="text-sm font-semibold text-foreground">
                {session.action?.response ?? finalSolution?.summary ?? session.action?.recommendation ?? "No response generated yet."}
              </div>
              {session.codeScenario && session.daytonaOutput && (
                <div className="rounded-md border bg-background/70 px-3 py-2 text-[11px]">
                  <div className="text-muted-foreground">Daytona output</div>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
{session.daytonaOutput}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Uncertainty Summary */}
        {session.uncertaintySummary && (
          <Alert className="bg-muted/50 border-none shrink-0">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">Uncertainty Analysis</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-1">
              {session.uncertaintySummary}
            </AlertDescription>
          </Alert>
        )}

        {beliefDelta && (
          <div className="shrink-0 rounded-md border bg-muted/20 px-4 py-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Belief Update</span>
              {beliefDelta.hasEvidence && (
                <span className="text-muted-foreground">Updated after evidence</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 text-[11px]">
              <div className="rounded-md border bg-background/70 px-2 py-1">
                <div className="text-muted-foreground">Initial</div>
                <div className="font-semibold">{(beliefDelta.initial * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-md border bg-background/70 px-2 py-1">
                <div className="text-muted-foreground">Final</div>
                <div className="font-semibold">{(beliefDelta.final * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-md border bg-background/70 px-2 py-1">
                <div className="text-muted-foreground">Delta</div>
                <div className="font-semibold">
                  {beliefDelta.delta >= 0 ? "+" : ""}
                  {(beliefDelta.delta * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Probabilities & Timeline
        </div>
        <Tabs defaultValue="chart" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-4 shrink-0">
            <TabsTrigger value="chart">Probabilities</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Probability Chart & Ranked Plans */}
          <TabsContent value="chart" className="flex-1 flex gap-6 min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="h-[200px] w-full shrink-0">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart
                    data={chartData}
                    margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
                  >
                    <defs>
                      {plans.map((plan) => (
                        <linearGradient key={plan.id} id={`fill${plan.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${plan.id})`} stopOpacity={0.8} />
                          <stop offset="95%" stopColor={`var(--color-${plan.id})`} stopOpacity={0.1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      domain={[0, 100]}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    {plans.map((plan) => (
                      <Area
                        key={plan.id}
                        dataKey={plan.id}
                        type="monotone"
                        fill={`url(#fill${plan.id})`}
                        fillOpacity={0.4}
                        stroke={`var(--color-${plan.id})`}
                        stackId="1"
                      />
                    ))}
                  </AreaChart>
                </ChartContainer>
              </div>

              <ScrollArea className="flex-1 mt-4 pr-3">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ranked Plans</h3>
                  {rankedPlans.map((plan) => {
                    const color = `hsl(var(--chart-${(plans.findIndex(p => p.id === plan.id) % 5) + 1}))`;
                    return (
                      <div key={plan.id} className="p-3 border rounded-lg bg-card/50 hover:bg-card transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="font-medium text-sm">{plan.title}</span>
                          </div>
                          <span className="font-mono text-sm font-bold">{(plan.probability * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mb-2">
                          <div 
                            className="h-full transition-all duration-500"
                            style={{ width: `${plan.probability * 100}%`, backgroundColor: color }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {plan.rationale || plan.summary}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Timeline View */}
          <TabsContent value="timeline" className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
              <div className="relative pl-4 border-l space-y-6 my-2">
                {session.timeline?.map((event) => (
                  <div key={event.id} className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{event.label}</span>
                        <span className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.details}</p>
                    </div>
                  </div>
                ))}
                {!session.timeline?.length && (
                  <div className="text-sm text-muted-foreground italic">No timeline events recorded.</div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Final Diff View */}
        </Tabs>

      </CardContent>
    </Card>
  );
}
