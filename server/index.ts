import { runDebate } from "./lib/debate-engine";
import type {
  DebateRunRequest,
  DebateRunResponse,
  DebateSession,
} from "../src/lib/probability-parliament-types";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { createServer } from "http";
import { dirname, resolve } from "path";

const loadEnvFile = () => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile();

const port = process.env.PROBABILITY_PARLIAMENT_PORT
  ? Number(process.env.PROBABILITY_PARLIAMENT_PORT)
  : 8787;

const dataPath = resolve(process.cwd(), "server/data/sessions.json");

const ensureDataFile = async () => {
  const dir = dirname(dataPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  if (!existsSync(dataPath)) {
    await writeFile(dataPath, JSON.stringify([]));
  }
};

const readSessions = async (): Promise<DebateSession[]> => {
  await ensureDataFile();
  const raw = await readFile(dataPath, "utf-8");
  try {
    return JSON.parse(raw) as DebateSession[];
  } catch {
    return [];
  }
};

const writeSessions = async (sessions: DebateSession[]) => {
  await ensureDataFile();
  await writeFile(dataPath, JSON.stringify(sessions, null, 2));
};

const collectBody = async (req: Request): Promise<string> => {
  const chunks: Uint8Array[] = [];
  const stream = req.body?.getReader();
  if (!stream) return "";
  while (true) {
    const { done, value } = await stream.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
};

type RequestWithBody = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, listener: (chunk: Buffer) => void) => void;
};

type ResponseWriter = {
  setHeader: (key: string, value: string | string[]) => void;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (payload?: string) => void;
};

const sendJson = (
  res: ResponseWriter,
  status: number,
  payload: unknown,
) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
};

const sendError = (res: ResponseWriter, status: number, message: string) => {
  sendJson(res, status, { error: message });
};

const readBody = (req: RequestWithBody): Promise<string> => {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
  });
};

const handleRun = async (req: RequestWithBody, res: ResponseWriter) => {
  const raw = await readBody(req);
  let body: DebateRunRequest = {};
  if (raw) {
    try {
      body = JSON.parse(raw) as DebateRunRequest;
    } catch {
      sendError(res, 400, "Invalid JSON payload.");
      return;
    }
  }
  const priorProvider = process.env.LLM_PROVIDER;
  if (body.llmProvider) {
    process.env.LLM_PROVIDER = body.llmProvider;
  }
  try {
    const session = await runDebate(body.scenario, {
      weights: body.weights,
      runVerification: body.runVerification,
    });
    const sessions = await readSessions();
    sessions.unshift(trimSession(session));
    await writeSessions(sessions.slice(0, 25));
    const response: DebateRunResponse = { session };
    sendJson(res, 200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debate run failed.";
    sendError(res, 400, message);
  } finally {
    if (body.llmProvider) {
      if (priorProvider === undefined) {
        delete process.env.LLM_PROVIDER;
      } else {
        process.env.LLM_PROVIDER = priorProvider;
      }
    }
  }
};

const truncate = (value: string, max = 1000) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const trimSession = (session: DebateSession): DebateSession => {
  const trimmed = { ...session };
  if (trimmed.generationWarnings) {
    trimmed.generationWarnings = trimmed.generationWarnings.map((warning) =>
      truncate(warning, 1000),
    );
  }
  if (trimmed.evidenceLedger) {
    trimmed.evidenceLedger = trimmed.evidenceLedger.map((entry) => ({
      ...entry,
      details: truncate(entry.details, 1000),
    }));
  }
  return trimmed;
};

const handleLatest = async (res: ResponseWriter) => {
  const sessions = await readSessions();
  const latest = sessions[0];
  if (!latest) {
    sendError(res, 404, "No sessions available.");
    return;
  }
  const response: DebateRunResponse = { session: latest };
  sendJson(res, 200, response);
};

const handleOptions = (res: ResponseWriter) => {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
};

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");

  if (method === "OPTIONS") {
    handleOptions(res);
    return;
  }

  if (method === "POST" && url.pathname === "/api/debate/run") {
    await handleRun(req as RequestWithBody, res as ResponseWriter);
    return;
  }

  if (method === "GET" && url.pathname === "/api/debate/latest") {
    await handleLatest(res as ResponseWriter);
    return;
  }

  sendError(res as ResponseWriter, 404, "Not Found");
});

server.listen(port, () => {
  console.log(`Probability Parliament server running on ${port}`);
});
