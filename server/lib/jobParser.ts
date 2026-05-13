import type { JobExtraction, Requirement } from "../../shared/types.js";
import {
  cleanText,
  extractRepeatedTerms,
  findKnownTerms,
  includesTerm,
  sentenceSplit,
  SOFT_SKILLS,
  toLines,
  uniqueStrings
} from "./text.js";

const ACTION_VERBS = [
  "build",
  "develop",
  "design",
  "lead",
  "manage",
  "analyze",
  "optimize",
  "implement",
  "collaborate",
  "communicate",
  "deploy",
  "maintain",
  "support",
  "automate",
  "improve"
];

export function parseJobFallback(jobDescription: string, targetRole = ""): JobExtraction {
  const text = cleanText(jobDescription);
  const sentences = sentenceSplit(text);
  const targetTitle = cleanText(targetRole || extractTitle(text));
  const seniority = inferSeniority(text);
  const hardSkills = findKnownTerms(text);
  const softSkills = SOFT_SKILLS.filter((skill) => includesTerm(text, skill));
  const certifications = uniqueStrings(
    sentences.filter((sentence) => /\b(certified|certification|certificate|license|aws certified|pmp|cissp|scrum)\b/i.test(sentence))
  );
  const mustHaveRequirements = requirementCandidates(sentences, "must");
  const preferredRequirements = requirementCandidates(sentences, "preferred");
  const responsibilities = uniqueStrings(
    sentences.filter((sentence) => /\b(build|develop|design|lead|manage|analyze|optimize|implement|collaborate|deploy|support)\w*\b/i.test(sentence)),
    12
  );

  const derivedMusts =
    mustHaveRequirements.length > 0
      ? mustHaveRequirements
      : hardSkills.slice(0, 6).map((skill) => makeRequirement(`Use ${skill} in the role`, "must"));

  return {
    targetTitle,
    seniority,
    mustHaveRequirements: derivedMusts,
    preferredRequirements,
    hardSkills,
    softSkills,
    toolsPlatforms: hardSkills.filter((skill) => /\b(aws|azure|cloud|docker|kubernetes|github|gitlab|jira|figma|salesforce|hubspot)\b/i.test(skill)),
    certifications,
    responsibilities,
    industryKeywords: extractRepeatedTerms(text, 10),
    actionVerbs: ACTION_VERBS.filter((verb) => includesTerm(text, verb)),
    repeatedTerms: extractRepeatedTerms(text, 12)
  };
}

function extractTitle(text: string): string {
  const labeled = text.match(/(?:job title|title|role)\s*:\s*([^\n.]+)/i)?.[1];
  if (labeled) return labeled.trim();
  const firstLine = toLines(text)[0] ?? "";
  if (firstLine.length <= 80 && /\b(engineer|developer|manager|analyst|designer|specialist|consultant|lead|architect)\b/i.test(firstLine)) {
    return firstLine.replace(/^job\s*title\s*:\s*/i, "");
  }
  return "";
}

function inferSeniority(text: string): string {
  if (/\b(principal|staff)\b/i.test(text)) return "Principal/Staff";
  if (/\b(senior|sr\.)\b/i.test(text)) return "Senior";
  if (/\b(lead|manager|director|head)\b/i.test(text)) return "Lead/Manager";
  if (/\b(junior|entry|graduate|intern)\b/i.test(text)) return "Entry";
  if (/\b(mid|intermediate)\b/i.test(text)) return "Mid";
  return "";
}

function requirementCandidates(sentences: string[], category: "must" | "preferred"): Requirement[] {
  const requiredPattern = /\b(required|must|need|minimum|at least|proficient|strong experience|hands-on|responsible for|\d+\+?\s+years)\b/i;
  const preferredPattern = /\b(preferred|nice to have|bonus|plus|familiarity|advantage|desired)\b/i;
  const pattern = category === "must" ? requiredPattern : preferredPattern;
  const requirements = sentences
    .filter((sentence) => pattern.test(sentence))
    .flatMap((sentence) => splitRequirementSentence(sentence, category));
  return uniqueStrings(requirements, 16).map((text) => makeRequirement(text, category));
}

function makeRequirement(text: string, category: "must" | "preferred"): Requirement {
  return {
    text: cleanText(text),
    category,
    evidence: [],
    status: "missing"
  };
}

function splitRequirementSentence(sentence: string, category: "must" | "preferred"): string[] {
  const afterColon = sentence.includes(":") ? sentence.split(":").slice(1).join(":") : sentence;
  const parts = afterColon
    .split(/,\s+|\s+and\s+/i)
    .map((part) =>
      part
        .replace(/\b(required|must|need|minimum|preferred|nice to have|bonus|plus)\b:?/gi, "")
        .replace(/^and\s+/i, "")
        .replace(/\.+$/g, "")
        .trim()
    )
    .filter((part) => part.length > 2);
  if (parts.length > 1) {
    return parts.map((part) => (category === "must" ? `Evidence for ${part}` : `Preferred evidence for ${part}`));
  }
  return [sentence];
}
