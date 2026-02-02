import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DebateMessage, AgentRole } from "@/lib/probability-parliament-types";
import { cn } from "@/lib/utils";
import { CheckCircle2, FlaskConical, Target } from "lucide-react";

interface TranscriptPanelProps {
  messages: DebateMessage[];
  className?: string;
}

const roleColors: Record<AgentRole, string> = {
  planner: "bg-blue-500",
  skeptic: "bg-red-500",
  security: "bg-orange-500",
  cost: "bg-green-500",
  synthesizer: "bg-purple-500",
};

const roleInitials: Record<AgentRole, string> = {
  planner: "PL",
  skeptic: "SK",
  security: "SE",
  cost: "CO",
  synthesizer: "SY",
};

export function TranscriptPanel({ messages, className }: TranscriptPanelProps) {
  return (
    <Card className={cn("flex flex-col h-full border-none shadow-none bg-transparent", className)}>
      <CardHeader className="px-0 pt-0 pb-4">
        <div>
          <CardTitle className="text-lg font-medium">Transcript</CardTitle>
          <div className="text-xs text-muted-foreground">LLM debate transcript</div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <Avatar className="h-8 w-8 border shrink-0 mt-1">
                  <AvatarFallback className={cn("text-white text-xs", roleColors[msg.agent])}>
                    {roleInitials[msg.agent]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold capitalize">{msg.agent}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    {msg.confidence > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                        Confidence: {Math.round(msg.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Structured Reasoning */}
                  {(msg.reasons?.length > 0 || msg.disconfirmingTest || msg.preferredPlanId) && (
                    <div className="bg-muted/30 rounded-md p-3 text-xs space-y-2 mt-2 border">
                      {msg.preferredPlanId && (
                        <div className="flex items-center gap-2 text-primary font-medium">
                          <Target className="h-3 w-3" />
                          <span>Prefers Plan: {msg.preferredPlanId}</span>
                        </div>
                      )}
                      
                      {msg.reasons?.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Key Reasons:</span>
                          </div>
                          <ul className="list-disc list-inside pl-1 text-muted-foreground/80 space-y-0.5">
                            {msg.reasons.map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.disconfirmingTest && (
                        <div className="space-y-1 pt-1 border-t border-dashed mt-2">
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                            <FlaskConical className="h-3 w-3" />
                            <span>Disconfirming Test:</span>
                          </div>
                          <p className="pl-5 text-muted-foreground italic">"{msg.disconfirmingTest}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.references && msg.references.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {msg.references.map((ref, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px] h-5">
                          {ref}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No transcript available. Run a debate to see the conversation.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
