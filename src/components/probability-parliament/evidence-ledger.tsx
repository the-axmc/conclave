import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EvidenceLedgerEntry } from "@/lib/probability-parliament-types";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, FileText } from "lucide-react";

interface EvidenceLedgerProps {
  evidence: EvidenceLedgerEntry[];
  className?: string;
}

const typeIcons: Record<string, any> = {
  test: CheckCircle2,
  log: FileText,
  analysis: AlertCircle,
  patch: CheckCircle2,
};

const typeColors: Record<string, string> = {
  test: "text-green-500",
  log: "text-blue-500",
  analysis: "text-orange-500",
  patch: "text-purple-500",
};

export function EvidenceLedger({ evidence, className }: EvidenceLedgerProps) {
  return (
    <Card className={cn("flex flex-col h-full border-none shadow-none bg-transparent", className)}>
      <CardHeader className="px-0 pt-0 pb-4">
        <CardTitle className="text-lg font-medium">Evidence Ledger</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-3">
            {evidence.map((entry) => {
              const Icon = typeIcons[entry.type] || FileText;
              const colorClass = typeColors[entry.type] || "text-gray-500";
              const isPass = entry.reliability > 0.5;

              return (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
                  <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", colorClass)} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm capitalize">{entry.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/90">{entry.summary}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {entry.agent}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px]", isPass ? "border-green-500/50 text-green-600" : "border-red-500/50 text-red-600")}
                      >
                        Reliability: {(entry.reliability * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
            {evidence.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No evidence collected yet.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
