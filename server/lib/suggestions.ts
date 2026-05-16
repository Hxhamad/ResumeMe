import type { JobExtraction, ProfileMatch, ResumeProfile, Suggestion, SuggestionDecision } from "../../shared/types.js";
import { cleanText, containsMetric, makeSuggestionId, uniqueMeaningfulTerms } from "./text.js";

export function generateSuggestionsFallback(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const supportedKeywordNames = match.supportedKeywords.map((item) => item.keyword);

  if (profile.summary || profile.skills.length) {
    const summary = profile.summary || summaryFromProfile(profile, job.targetTitle);
    suggestions.push({
      id: makeSuggestionId("Professional Summary", suggestions.length, summary),
      section: "Professional Summary",
      originalText: profile.summary || "No summary provided",
      suggestedRewrite: summary,
      reason: "Uses only profile-supported skills and avoids unsupported experience claims.",
      confidence: profile.skills.length ? 82 : 58,
      riskLevel: "low",
      profileSupported: true,
      status: "pending"
    });
  }

  if (supportedKeywordNames.length) {
    const skillsRewrite = uniqueMeaningfulTerms([...profile.skills, ...supportedKeywordNames]).join(", ");
    suggestions.push({
      id: makeSuggestionId("Skills", suggestions.length, skillsRewrite),
      section: "Skills",
      originalText: profile.skills.join(", ") || "No skills listed",
      suggestedRewrite: skillsRewrite,
      reason: "Moves job-relevant keywords that are already present in the profile into the skills section.",
      confidence: 86,
      riskLevel: "low",
      profileSupported: true,
      status: "pending"
    });
  }

  for (const entry of profile.experience) {
    for (const bullet of entry.bullets.slice(0, 2)) {
      const rewritten = polishBulletWithoutInventing(bullet);
      if (rewritten !== bullet) {
        suggestions.push({
          id: makeSuggestionId("Professional Experience", suggestions.length, bullet),
          section: "Professional Experience",
          originalText: bullet,
          suggestedRewrite: rewritten,
          reason: "Tightens the bullet into action-led resume language while preserving the original facts.",
          confidence: 78,
          riskLevel: "low",
          profileSupported: true,
          status: "pending"
        });
      }
      if (!containsMetric(bullet)) {
        suggestions.push({
          id: makeSuggestionId("Professional Experience", suggestions.length, `${bullet}-metric`),
          section: "Professional Experience",
          originalText: bullet,
          suggestedRewrite: `${rewritten} Add a real metric, scope, frequency, or audience only if you can verify it.`,
          reason: "Metrics improve evidence strength, but ResumeMe will not invent numbers.",
          confidence: 62,
          riskLevel: "medium",
          profileSupported: false,
          status: "pending"
        });
      }
    }
  }

  for (const gap of match.mustHaveGaps.slice(0, 5)) {
    suggestions.push({
      id: makeSuggestionId("Missing Requirements", suggestions.length, gap.text),
      section: "Missing Requirements",
      originalText: "Missing profile evidence",
      suggestedRewrite: `Add a real example, project, certification, or skill evidence for: ${gap.text}`,
      reason: "The job asks for this, but the current profile does not support claiming it.",
      confidence: 92,
      riskLevel: "high",
      profileSupported: false,
      status: "pending"
    });
  }

  if (!profile.experience.length) {
    suggestions.push({
      id: makeSuggestionId("Professional Experience", suggestions.length, "missing-experience"),
      section: "Professional Experience",
      originalText: "No real work entries detected",
      suggestedRewrite: "Add real job title, employer, dates, and 2-4 supported bullets before adding a Professional Experience section.",
      reason: "ResumeMe omits fake work history and needs evidence before presenting experience.",
      confidence: 96,
      riskLevel: "high",
      profileSupported: false,
      status: "pending"
    });
  }

  return suggestions.slice(0, 14);
}

export function applySuggestionDecisions(
  suggestions: Suggestion[],
  decisions: SuggestionDecision[]
): { suggestions: Suggestion[]; acceptedSafeSuggestions: Suggestion[]; warnings: string[] } {
  const decisionMap = new Map(decisions.map((decision) => [decision.suggestionId, decision.decision]));
  const updated = suggestions.map((suggestion) => ({
    ...suggestion,
    status: decisionMap.get(suggestion.id) ?? suggestion.status ?? "pending"
  }));
  const accepted = updated.filter((suggestion) => suggestion.status === "accepted");
  const acceptedSafeSuggestions = accepted.filter((suggestion) => suggestion.profileSupported && suggestion.riskLevel !== "high");
  const warnings = accepted
    .filter((suggestion) => !suggestion.profileSupported || suggestion.riskLevel === "high")
    .map((suggestion) => `Accepted suggestion "${suggestion.section}" needs user evidence before it can change resume facts.`);
  return { suggestions: updated, acceptedSafeSuggestions, warnings };
}

function summaryFromProfile(profile: ResumeProfile, targetTitle: string): string {
  const skillText = profile.skills.slice(0, 8).join(", ");
  const certText = profile.certifications.map((certification) => certification.name).slice(0, 2).join(", ");
  const roleText = targetTitle ? ` for ${targetTitle} roles` : "";
  if (profile.experience.length) {
    return cleanText(`Professional with profile-supported experience${roleText} and skills in ${skillText}. ${certText ? `Credentials include ${certText}.` : ""}`);
  }
  return cleanText(`Candidate with profile-supported skills${roleText}${skillText ? ` in ${skillText}` : ""}. ${certText ? `Credentials include ${certText}.` : ""}`);
}

function polishBulletWithoutInventing(bullet: string): string {
  const clean = cleanText(bullet.replace(/^[-*•]\s*/, ""));
  if (!clean) return "";
  if (/^(built|developed|designed|led|managed|analyzed|optimized|implemented|collaborated|deployed|maintained|supported|automated|improved|created|delivered|coordinated)\b/i.test(clean)) {
    return clean;
  }
  return `Delivered ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}
