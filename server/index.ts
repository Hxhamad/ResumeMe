import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FullGenerateInput, SuggestionDecision, UserInfo } from "../shared/types.js";
import { calculateAtsRubric } from "./lib/ats.js";
import { parseJobFallback } from "./lib/jobParser.js";
import { matchProfileFallback } from "./lib/matcher.js";
import { callMiniMaxJson } from "./lib/minimaxClient.js";
import { parseProfileFallback } from "./lib/profileParser.js";
import {
  coverLetterPrompt,
  jobExtractionPrompt,
  profileMatchingPrompt,
  profileParsingPrompt,
  resumeGenerationPrompt,
  suggestionPrompt
} from "./prompts/resumePrompts.js";
import {
  feedbackSummaryFallback,
  formatResumeText,
  guardResumeText,
  generateCoverLetterFallback,
  sanitizeResumeText
} from "./lib/resumeFormatter.js";
import { applySuggestionDecisions, generateSuggestionsFallback } from "./lib/suggestions.js";
import { cleanText, EMPTY_USER_INFO } from "./lib/text.js";
import {
  validateGeneratePayload,
  validateJobExtraction,
  validateProfileMatch,
  validateResumeProfile,
  validateSuggestions,
  validateUserInfo
} from "./lib/validators.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "ResumeMe",
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.7",
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY)
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "ResumeMe",
    model: process.env.MINIMAX_MODEL || "MiniMax-M2.7",
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY)
  });
});

app.post("/api/analyze-job", async (request, response) => {
  const body = request.body as { jobDescription?: string; targetRole?: string };
  const jobDescription = cleanText(body.jobDescription);
  const targetRole = cleanText(body.targetRole);
  if (!jobDescription) return response.status(400).json({ error: "jobDescription is required." });

  const fallback = parseJobFallback(jobDescription, targetRole);
  const result = await callMiniMaxJson({
    taskName: "job extraction",
    messages: jobExtractionPrompt(jobDescription, targetRole),
    temperature: 0.15,
    fallback,
    validate: validateJobExtraction,
    timeoutMs: 4500
  });

  response.json({ job: result.data, warnings: result.warnings, aiUsed: result.aiUsed });
});

app.post("/api/parse-profile", async (request, response) => {
  const body = request.body as { profileText?: string; userInfo?: Partial<UserInfo> };
  const profileText = cleanText(body.profileText);
  const userInfo = validateUserInfo(body.userInfo, EMPTY_USER_INFO);
  if (!profileText && !Object.values(userInfo).some(Boolean)) {
    return response.status(400).json({ error: "profileText or contact fields are required." });
  }

  const fallback = parseProfileFallback(profileText, userInfo);
  const result = await callMiniMaxJson({
    taskName: "profile parsing",
    messages: profileParsingPrompt(profileText, userInfo),
    temperature: 0.15,
    fallback,
    validate: validateResumeProfile,
    timeoutMs: 4500
  });

  response.json({ profile: result.data, warnings: result.warnings, aiUsed: result.aiUsed });
});

app.post("/api/match-profile", async (request, response) => {
  const input = request.body as FullGenerateInput;
  const profile = parseProfileFallback(cleanText(input.profileText), { ...input.userInfo, targetRole: input.targetRole });
  const job = parseJobFallback(cleanText(input.jobDescription), cleanText(input.targetRole));
  const fallback = matchProfileFallback(profile, job);
  const result = await callMiniMaxJson({
    taskName: "profile matching",
    messages: profileMatchingPrompt(profile, job),
    temperature: 0.15,
    fallback,
    validate: validateProfileMatch,
    timeoutMs: 4500
  });

  response.json({ profile, job, match: result.data, warnings: result.warnings, aiUsed: result.aiUsed });
});

app.post("/api/generate-suggestions", async (request, response) => {
  const input = request.body as FullGenerateInput;
  const profile = parseProfileFallback(cleanText(input.profileText), { ...input.userInfo, targetRole: input.targetRole });
  const job = parseJobFallback(cleanText(input.jobDescription), cleanText(input.targetRole));
  const match = matchProfileFallback(profile, job);
  const fallback = generateSuggestionsFallback(profile, job, match);
  const result = await callMiniMaxJson({
    taskName: "suggestion generation",
    messages: suggestionPrompt(profile, job, match),
    temperature: 0.3,
    fallback,
    validate: validateSuggestions,
    timeoutMs: 4500
  });

  response.json({ profile, job, match, suggestions: result.data, warnings: result.warnings, aiUsed: result.aiUsed });
});

app.post("/api/apply-suggestions", (request, response) => {
  const body = request.body as { suggestions?: unknown; decisions?: SuggestionDecision[] };
  const suggestions = validateSuggestions(body.suggestions, []);
  const decisions = Array.isArray(body.decisions) ? body.decisions : [];
  response.json(applySuggestionDecisions(suggestions, decisions));
});

app.post("/api/generate-resume", async (request, response) => {
  const input = request.body as FullGenerateInput & { suggestions?: unknown; decisions?: SuggestionDecision[] };
  const profile = parseProfileFallback(cleanText(input.profileText), { ...input.userInfo, targetRole: input.targetRole });
  const job = parseJobFallback(cleanText(input.jobDescription), cleanText(input.targetRole));
  const match = matchProfileFallback(profile, job);
  const suggestions = validateSuggestions(input.suggestions, generateSuggestionsFallback(profile, job, match));
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  const fallbackResumeText = formatResumeText(profile, job, suggestions, decisions);
  const fallback = {
    resumeText: fallbackResumeText,
    coverLetter: "",
    feedbackSummary: feedbackSummaryFallback(match),
    warnings: [] as string[]
  };
  const result = await callMiniMaxJson({
    taskName: "resume generation",
    messages: resumeGenerationPrompt(profile, job, match, suggestions),
    temperature: 0.3,
    fallback,
    validate: validateGeneratePayload,
    timeoutMs: 5500
  });
  const guarded = guardResumeText(profile, result.data.resumeText || fallbackResumeText, fallbackResumeText);
  const safeResumeText = guarded.resumeText;
  const ats = calculateAtsRubric(profile, job, match, safeResumeText);

  response.json({
    profile,
    job,
    match,
    ats,
    resumeText: safeResumeText,
    feedbackSummary: result.data.feedbackSummary,
    warnings: [...result.warnings, ...result.data.warnings, ...guarded.warnings],
    aiUsed: result.aiUsed
  });
});

app.post("/api/generate-cover-letter", async (request, response) => {
  const input = request.body as FullGenerateInput;
  const profile = parseProfileFallback(cleanText(input.profileText), { ...input.userInfo, targetRole: input.targetRole });
  const job = parseJobFallback(cleanText(input.jobDescription), cleanText(input.targetRole));
  const match = matchProfileFallback(profile, job);
  const fallback = {
    coverLetter: generateCoverLetterFallback(profile, job, match),
    feedbackSummary: feedbackSummaryFallback(match),
    warnings: [] as string[],
    resumeText: ""
  };
  const result = await callMiniMaxJson({
    taskName: "cover letter generation",
    messages: coverLetterPrompt(profile, job, match),
    temperature: 0.35,
    fallback,
    validate: validateGeneratePayload,
    timeoutMs: 5500
  });

  response.json({
    coverLetter: result.data.coverLetter,
    warnings: [...result.warnings, ...result.data.warnings],
    aiUsed: result.aiUsed
  });
});

app.post("/api/full-generate", async (request, response) => {
  const input = request.body as FullGenerateInput;
  const profileText = cleanText(input.profileText);
  const jobDescription = cleanText(input.jobDescription);
  const targetRole = cleanText(input.targetRole);
  if (!profileText && !Object.values(input.userInfo ?? {}).some(Boolean)) {
    return response.status(400).json({ error: "Candidate profile or contact fields are required." });
  }
  if (!jobDescription) return response.status(400).json({ error: "Job description is required." });

  const profileFallback = parseProfileFallback(profileText, { ...input.userInfo, targetRole });
  const jobFallback = parseJobFallback(jobDescription, targetRole);
  const warnings: string[] = [];
  const [profileResult, jobResult] = await Promise.all([
    callMiniMaxJson({
      taskName: "profile parsing",
      messages: profileParsingPrompt(profileText, profileFallback.userInfo),
      temperature: 0.15,
      fallback: profileFallback,
      validate: validateResumeProfile,
      timeoutMs: 5000
    }),
    callMiniMaxJson({
      taskName: "job extraction",
      messages: jobExtractionPrompt(jobDescription, targetRole),
      temperature: 0.15,
      fallback: jobFallback,
      validate: validateJobExtraction,
      timeoutMs: 5000
    })
  ]);
  warnings.push(...profileResult.warnings);
  warnings.push(...jobResult.warnings);

  const matchFallback = matchProfileFallback(profileResult.data, jobResult.data);
  let matchResult = { data: matchFallback, warnings: [] as string[], aiUsed: false };
  if (profileResult.aiUsed && jobResult.aiUsed) {
    matchResult = await callMiniMaxJson({
      taskName: "profile matching",
      messages: profileMatchingPrompt(profileResult.data, jobResult.data),
      temperature: 0.15,
      fallback: matchFallback,
      validate: validateProfileMatch,
      timeoutMs: 5000
    });
    warnings.push(...matchResult.warnings);
  } else {
    warnings.push("MiniMax downstream steps skipped after extraction fallback to keep generation responsive.");
  }

  const suggestionFallback = generateSuggestionsFallback(profileResult.data, jobResult.data, matchResult.data);
  let suggestionResult = { data: suggestionFallback, warnings: [] as string[], aiUsed: false };
  if (matchResult.aiUsed) {
    suggestionResult = await callMiniMaxJson({
      taskName: "suggestion generation",
      messages: suggestionPrompt(profileResult.data, jobResult.data, matchResult.data),
      temperature: 0.3,
      fallback: suggestionFallback,
      validate: validateSuggestions,
      timeoutMs: 5000
    });
    warnings.push(...suggestionResult.warnings);
  }

  const resumeFallbackText = formatResumeText(profileResult.data, jobResult.data, suggestionResult.data, []);
  const generatedFallback = {
    resumeText: resumeFallbackText,
    coverLetter: generateCoverLetterFallback(profileResult.data, jobResult.data, matchResult.data),
    feedbackSummary: feedbackSummaryFallback(matchResult.data),
    warnings: [] as string[]
  };
  let resumeResult = { data: generatedFallback, warnings: [] as string[], aiUsed: false };
  let coverResult = { data: generatedFallback, warnings: [] as string[], aiUsed: false };
  if (suggestionResult.aiUsed) {
    [resumeResult, coverResult] = await Promise.all([
      callMiniMaxJson({
        taskName: "resume generation",
        messages: resumeGenerationPrompt(profileResult.data, jobResult.data, matchResult.data, suggestionResult.data),
        temperature: 0.3,
        fallback: generatedFallback,
        validate: validateGeneratePayload,
        timeoutMs: 6000
      }),
      callMiniMaxJson({
        taskName: "cover letter generation",
        messages: coverLetterPrompt(profileResult.data, jobResult.data, matchResult.data),
        temperature: 0.35,
        fallback: generatedFallback,
        validate: validateGeneratePayload,
        timeoutMs: 6000
      })
    ]);
    warnings.push(...resumeResult.warnings, ...resumeResult.data.warnings);
    warnings.push(...coverResult.warnings, ...coverResult.data.warnings);
  }

  const guarded = guardResumeText(profileResult.data, resumeResult.data.resumeText || resumeFallbackText, resumeFallbackText);
  const resumeText = guarded.resumeText;
  const ats = calculateAtsRubric(profileResult.data, jobResult.data, matchResult.data, resumeText);

  response.json({
    profile: profileResult.data,
    job: jobResult.data,
    match: matchResult.data,
    suggestions: suggestionResult.data,
    ats,
    resumeText,
    coverLetter: coverResult.data.coverLetter || generatedFallback.coverLetter,
    feedbackSummary: resumeResult.data.feedbackSummary.length ? resumeResult.data.feedbackSummary : generatedFallback.feedbackSummary,
    warnings: [...new Set([...warnings, ...guarded.warnings])],
    aiUsed: profileResult.aiUsed || jobResult.aiUsed || matchResult.aiUsed || suggestionResult.aiUsed || resumeResult.aiUsed || coverResult.aiUsed
  });
});

const staticDir = path.resolve(process.cwd(), "dist");
app.use(express.static(staticDir));
app.get("*", (_request, response) => {
  response.sendFile(path.join(staticDir, "index.html"));
});

app.listen(port, () => {
  console.log(`ResumeMe backend listening on http://localhost:${port}`);
});
