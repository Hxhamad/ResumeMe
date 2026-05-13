import type { AtsRubric, JobExtraction, ProfileMatch, ResumeProfile } from "../../shared/types.js";
import { clampScore, containsMetric } from "./text.js";

export function calculateAtsRubric(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch, resumeText = ""): AtsRubric {
  const parserSafety = calculateParserSafety(resumeText);
  const keywordCoverage = clampScore(
    ((match.supportedKeywords.length + match.weaklySupportedKeywords.length * 0.45) /
      Math.max(1, match.supportedKeywords.length + match.weaklySupportedKeywords.length + match.missingKeywords.length)) *
      100
  );
  const mustHaveCoverage = clampScore((match.mustHaveMatches.length / Math.max(1, job.mustHaveRequirements.length)) * 100);
  const evidenceMetricsStrength = clampScore(
    (profile.metrics.length * 18 + profile.experience.flatMap((entry) => entry.bullets).filter(containsMetric).length * 16) /
      Math.max(1, profile.experience.length || 1)
  );
  const experienceRelevance = profile.experience.length ? clampScore((mustHaveCoverage + keywordCoverage) / 2) : job.mustHaveRequirements.length ? 18 : 55;
  const contactValues = [
    profile.userInfo.fullName,
    profile.userInfo.email,
    profile.userInfo.phone,
    profile.userInfo.location,
    profile.userInfo.linkedin || profile.userInfo.portfolio
  ].filter(Boolean);
  const contactCompleteness = clampScore((contactValues.length / 5) * 100);
  const datedEntries = profile.experience.filter((entry) => entry.startDate && entry.endDate).length;
  const dateCompleteness = profile.experience.length ? clampScore((datedEntries / profile.experience.length) * 100) : 50;
  const unsupportedClaimRisk = clampScore(100 - match.unsupportedClaims.length * 10);
  const overallScore = clampScore(
    parserSafety * 0.15 +
      keywordCoverage * 0.18 +
      mustHaveCoverage * 0.2 +
      evidenceMetricsStrength * 0.12 +
      experienceRelevance * 0.15 +
      contactCompleteness * 0.1 +
      dateCompleteness * 0.05 +
      unsupportedClaimRisk * 0.05
  );
  const feedback = buildFeedback(profile, match, {
    keywordCoverage,
    mustHaveCoverage,
    evidenceMetricsStrength,
    contactCompleteness,
    dateCompleteness,
    unsupportedClaimRisk
  });

  return {
    parserSafety,
    keywordCoverage,
    mustHaveCoverage,
    evidenceMetricsStrength,
    experienceRelevance,
    contactCompleteness,
    dateCompleteness,
    unsupportedClaimRisk,
    overallScore,
    feedback
  };
}

function calculateParserSafety(resumeText: string): number {
  let score = 100;
  if (/\|.*\|.*\|/.test(resumeText)) score -= 10;
  if (/[●◆■★✓]/.test(resumeText)) score -= 12;
  if (/table|columns|text box/i.test(resumeText)) score -= 14;
  if (/hidden keywords|keyword stuffing/i.test(resumeText)) score -= 20;
  return clampScore(score);
}

function buildFeedback(
  profile: ResumeProfile,
  match: ProfileMatch,
  scores: {
    keywordCoverage: number;
    mustHaveCoverage: number;
    evidenceMetricsStrength: number;
    contactCompleteness: number;
    dateCompleteness: number;
    unsupportedClaimRisk: number;
  }
): string[] {
  const feedback: string[] = [];
  if (!profile.experience.length) {
    feedback.push("Add real job title, employer, dates, and supported bullets before using a Professional Experience section.");
  }
  if (scores.contactCompleteness < 80) feedback.push("Complete the contact header with name, email, phone, location, and LinkedIn or portfolio.");
  if (scores.keywordCoverage < 65) feedback.push("Several job keywords are missing from the profile evidence; add only truthful skills or project examples.");
  if (scores.mustHaveCoverage < 70) feedback.push("Must-have coverage is limited. Add real evidence for the missing required items before claiming them.");
  if (scores.evidenceMetricsStrength < 45 && profile.experience.length) {
    feedback.push("Add verified metrics, scope, frequency, audience, or business impact to strengthen experience bullets.");
  }
  if (scores.dateCompleteness < 80 && profile.experience.length) feedback.push("Add start and end dates for each real work entry.");
  if (scores.unsupportedClaimRisk < 80) feedback.push("Unsupported requirements were detected; keep them out of the resume until the profile provides evidence.");
  if (!match.missingKeywords.length && match.mustHaveGaps.length === 0) feedback.push("Keyword and must-have coverage look strong based on the provided profile.");
  return feedback;
}
