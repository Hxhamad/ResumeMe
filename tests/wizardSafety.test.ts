import { describe, expect, it } from "vitest";
import { parseJobFallback } from "../server/lib/jobParser.js";
import { parseProfileFallback } from "../server/lib/profileParser.js";
import { formatResumeText } from "../server/lib/resumeFormatter.js";
import {
  applySuggestionToSections,
  buildSummaryOptions,
  createBlankProfile,
  emptySections,
  splitTextList,
  profileToEvidenceText,
  serializeSections,
  suggestionsForStep
} from "../src/lib/wizardSafety";
import type { Suggestion } from "../shared/types";

const minimalProfile = `Hamad Alshamrani
h.alshamrani.pro@gmail.com
+966 50 555 1234
Jeddah, Saudi Arabia
Skills: TypeScript, Docker, Kubernetes, GitHub
Certification: AWS Certified Solutions Architect`;

const jobText = `Senior Full Stack Engineer
Required: TypeScript, React, Node.js, Docker, Kubernetes, GitHub Actions, REST APIs, and cloud deployment experience.
Preferred: AWS certification, CI/CD automation, performance optimization, and documentation.`;

describe("wizard safety helpers", () => {
  it("does not serialize incomplete work entries as professional experience evidence", () => {
    const profile = createBlankProfile();
    profile.userInfo.fullName = "Hamad Alshamrani";
    profile.skills = ["TypeScript", "Docker"];
    profile.experience = [{ employer: "", title: "Engineer", bullets: ["Built services"], tools: [], metrics: [] }];

    const evidence = profileToEvidenceText(profile, profile.userInfo);
    expect(evidence).not.toMatch(/Experience/i);
    expect(evidence).not.toMatch(/Built services/i);
  });

  it("keeps minimal-profile summary options limited to profile-supported skills", () => {
    const profile = parseProfileFallback(minimalProfile);
    const job = parseJobFallback(jobText);
    const options = buildSummaryOptions(profile, job);

    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].text).toMatch(/profile-supported skills/i);
    expect(options.map((option) => option.text).join(" ")).not.toMatch(/\bexperience\b|\bexpertise\b|\bexpert\b/i);
  });

  it("strips contact bullets and blocked placeholders from serialized resume sections", () => {
    const profile = parseProfileFallback(minimalProfile);
    const sections = emptySections();
    sections.header = "Hamad Alshamrani\nh.alshamrani.pro@gmail.com | +966 50 555 1234";
    sections.summary = "Candidate with profile-supported skills.";
    sections.skills = "- TypeScript\n- h.alshamrani.pro@gmail.com\n- Docker";
    sections.experience = "Not specified";

    const resume = serializeSections(sections, profile.userInfo);
    expect(resume).toContain("h.alshamrani.pro@gmail.com | +966 50 555 1234");
    expect(resume).not.toMatch(/-\s*h\.alshamrani\.pro@gmail\.com/i);
    expect(resume).not.toMatch(/Not specified/i);
  });

  it("canonicalizes duplicate skill chips in wizard-edited lists", () => {
    const skills = splitTextList("GitHub Actions, GitHub, REST APIs, REST, API, NodeJS");

    expect(skills).toContain("GitHub Actions");
    expect(skills).toContain("REST APIs");
    expect(skills).toContain("Node.js");
    expect(skills).not.toContain("GitHub");
    expect(skills).not.toContain("REST");
    expect(skills).not.toContain("API");
  });

  it("omits duplicate project tool bullets from wizard evidence text", () => {
    const profile = parseProfileFallback(`Maya Chen
Projects
Resume Optimizer
- Created a React and Node.js tool.
- Tools: React, Node.js
Skills: React, Node.js`);
    const evidenceText = profileToEvidenceText(profile, profile.userInfo);
    const toolLines = evidenceText.match(/^- Tools: React, Node\.js$/gm) ?? [];

    expect(toolLines).toHaveLength(1);
  });

  it("does not reparse wizard Tools lines as skills", () => {
    const profile = parseProfileFallback(minimalProfile);
    const evidenceText = profileToEvidenceText({ ...profile, tools: ["TypeScript"] }, profile.userInfo);
    const reparsed = parseProfileFallback(evidenceText, profile.userInfo);

    expect(evidenceText).toMatch(/^Tools: TypeScript$/m);
    expect(reparsed.skills).not.toContain("Tools: TypeScript");
  });

  it("does not apply unsupported high-risk suggestions to resume sections", () => {
    const sections = emptySections();
    sections.skills = "- TypeScript";
    const suggestion: Suggestion = {
      id: "missing-kubernetes",
      section: "Skills",
      originalText: "Missing profile evidence",
      suggestedRewrite: "Add Kubernetes experience",
      reason: "The job asks for Kubernetes.",
      confidence: 92,
      riskLevel: "high",
      profileSupported: false,
      status: "pending"
    };

    const result = applySuggestionToSections(sections, suggestion);
    expect(result.applied).toBe(false);
    expect(result.sections.skills).toBe("- TypeScript");
    expect(result.message).toMatch(/Needs evidence/i);
  });

  it("keeps skills and experience suggestions scoped for inline rendering", () => {
    const suggestions: Suggestion[] = [
      {
        id: "skills",
        section: "Skills",
        originalText: "TypeScript",
        suggestedRewrite: "TypeScript, Docker",
        reason: "Supported skills.",
        confidence: 80,
        riskLevel: "low",
        profileSupported: true
      },
      {
        id: "experience",
        section: "Professional Experience",
        originalText: "Built dashboards",
        suggestedRewrite: "Built dashboards",
        reason: "Supported bullet.",
        confidence: 80,
        riskLevel: "low",
        profileSupported: true
      },
      {
        id: "missing",
        section: "Missing Requirements",
        originalText: "Missing profile evidence",
        suggestedRewrite: "Add real evidence for Kubernetes",
        reason: "Needs evidence.",
        confidence: 92,
        riskLevel: "high",
        profileSupported: false
      }
    ];

    expect(suggestionsForStep(suggestions, "skills").map((suggestion) => suggestion.id)).toEqual(["skills", "missing"]);
    expect(suggestionsForStep(suggestions, "experience").map((suggestion) => suggestion.id)).toEqual(["experience", "missing"]);
  });

  it("does not turn a safe summary sentence into a certification during wizard regeneration", () => {
    const profile = parseProfileFallback(minimalProfile);
    const summary = "Candidate with profile-supported skills in TypeScript and Docker. Credentials include AWS Certified Solutions Architect.";
    const evidenceText = profileToEvidenceText({ ...profile, summary }, { ...profile.userInfo, targetRole: "Senior Full Stack Engineer" });
    const reparsed = parseProfileFallback(evidenceText, profile.userInfo);
    const resume = formatResumeText(reparsed, parseJobFallback(jobText));

    expect(reparsed.certifications.map((certification) => certification.name)).toEqual(["AWS Certified Solutions Architect"]);
    expect(resume).not.toMatch(/Certifications[\s\S]*Summary:/i);
  });

  it("filters stale summary-like certification entries from wizard evidence", () => {
    const profile = parseProfileFallback(minimalProfile);
    const polluted = {
      ...profile,
      certifications: [
        ...profile.certifications,
        { name: "Summary: Candidate with profile-supported skills. Credentials include AWS Certified Solutions Architect." },
        { name: "Docker - Kubernetes - GitHub - AWS. Credentials include AWS Certified Solutions Architect." }
      ]
    };
    const evidenceText = profileToEvidenceText(polluted, profile.userInfo);
    const reparsed = parseProfileFallback(evidenceText, profile.userInfo);
    const resume = formatResumeText(reparsed, parseJobFallback(jobText));

    expect(evidenceText).not.toMatch(/Summary: Candidate[\s\S]*Certifications/i);
    expect(reparsed.certifications.map((certification) => certification.name)).toEqual(["AWS Certified Solutions Architect"]);
    expect(resume).not.toMatch(/Certifications[\s\S]*Summary:/i);
  });
});

describe("manual summary safety", () => {
  it("ignores unsupported experience language in a no-experience fallback summary", () => {
    const profile = parseProfileFallback(minimalProfile);
    const unsafeProfile = { ...profile, summary: "Experienced expert with 10 years of cloud deployment leadership." };
    const resume = formatResumeText(unsafeProfile, parseJobFallback(jobText));

    expect(resume).toMatch(/profile-supported skills/i);
    expect(resume).not.toMatch(/\bExperienced expert\b|\b10 years\b|\bleadership\b/i);
    expect(resume).not.toMatch(/Professional Experience/i);
  });
});
