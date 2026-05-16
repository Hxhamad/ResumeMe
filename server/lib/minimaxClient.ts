import { parseJsonPayload } from "./json.js";
import type { MiniMaxMessage } from "../prompts/resumePrompts.js";

interface ChatJsonOptions<T> {
  taskName: string;
  messages: MiniMaxMessage[];
  temperature: number;
  fallback: T;
  validate: (value: unknown, fallback: T) => T;
  timeoutMs?: number;
}

interface ChatJsonResult<T> {
  data: T;
  aiUsed: boolean;
  warnings: string[];
  serviceWarnings: string[];
}

const ENDPOINT = "https://api.minimax.io/v1/chat/completions";

export function hasMiniMaxConfig(): boolean {
  return Boolean(getApiKey());
}

export async function callMiniMaxJson<T>(options: ChatJsonOptions<T>): Promise<ChatJsonResult<T>> {
  const apiKey = getApiKey();
  const model = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
  if (!apiKey) {
    return {
      data: options.fallback,
      aiUsed: false,
      warnings: [],
      serviceWarnings: [serviceFallbackMessage(options.taskName, "missing api key")]
    };
  }

  let messages = [...options.messages];
  let lastInvalidOutput = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const content = await sendChatRequest({
        apiKey,
        model,
        messages,
        temperature: options.temperature,
        timeoutMs: options.timeoutMs ?? 12000
      });
      const parsed = parseJsonPayload(content);
      const data = options.validate(parsed, options.fallback);
      return { data, aiUsed: true, warnings: [], serviceWarnings: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MiniMax error";
      lastInvalidOutput = message;
      if (attempt >= 3 || !/json|schema|valid/i.test(message)) {
        return {
          data: options.fallback,
          aiUsed: false,
          warnings: [],
          serviceWarnings: [serviceFallbackMessage(options.taskName, message)]
        };
      }
      messages = [
        ...options.messages,
        {
          role: "user",
          content: `The previous output was invalid for ${options.taskName}: ${lastInvalidOutput}. Return corrected strict JSON only, with exactly the requested schema keys and no markdown.`
        }
      ];
    }
  }

  return {
    data: options.fallback,
    aiUsed: false,
    warnings: [],
    serviceWarnings: [serviceFallbackMessage(options.taskName, "json validation")]
  };
}

function getApiKey(): string {
  return (process.env.MINIMAX_API_KEY || "").trim().replace(/^<|>$/g, "");
}

function serviceFallbackMessage(taskName: string, reason: string): string {
  const fallback = fallbackLabel(taskName);
  if (/abort|timeout|timed out|operation was aborted/i.test(reason)) {
    return `AI timed out, ${fallback} used. You can continue.`;
  }
  if (/api key|configured/i.test(reason)) {
    return `AI is not configured, ${fallback} used. You can continue.`;
  }
  if (/json|schema|valid/i.test(reason)) {
    return `AI response needed cleanup, ${fallback} used. You can continue.`;
  }
  return `AI was unavailable, ${fallback} used. You can continue.`;
}

function fallbackLabel(taskName: string): string {
  if (/profile parsing|job extraction/i.test(taskName)) return "fallback parser";
  if (/matching/i.test(taskName)) return "deterministic matcher";
  if (/suggestion/i.test(taskName)) return "deterministic suggestions";
  if (/cover letter/i.test(taskName)) return "deterministic cover letter";
  if (/resume/i.test(taskName)) return "deterministic resume builder";
  return "deterministic fallback";
}

async function sendChatRequest(options: {
  apiKey: string;
  model: string;
  messages: MiniMaxMessage[];
  temperature: number;
  timeoutMs: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
    };
    const content = payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || "";
    if (!content.trim()) throw new Error("MiniMax returned an empty response.");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
