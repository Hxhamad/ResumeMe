import { describe, expect, it } from "vitest";
import { calculateAtsRubric } from "../server/lib/ats.js";
import { parseJobFallback } from "../server/lib/jobParser.js";
import { parseJsonPayload } from "../server/lib/json.js";
import { matchProfileFallback } from "../server/lib/matcher.js";
import { parseProfileFallback } from "../server/lib/profileParser.js";
import { formatResumeText, guardResumeText, sanitizeResumeText } from "../server/lib/resumeFormatter.js";
import { generateSuggestionsFallback } from "../server/lib/suggestions.js";
import { validateResumeProfile } from "../server/lib/validators.js";

const minimalProfile = `Hamad Alshamrani
h.alshamrani.pro@gmail.com
+966 50 555 1234
Jeddah, Saudi Arabia
Skills: TypeScript, Docker, Kubernetes, GitHub
Certification: AWS Certified Solutions Architect`;

const strongProfile = `Maya Chen
maya@example.com
Riyadh, Saudi Arabia
Senior Full Stack Engineer at GreenLedger | Jan 2021 - Present
- Built TypeScript and React dashboards used by 4 internal finance teams.
- Automated Docker and GitHub Actions deployments, reducing release work by 30%.
Software Engineer at CloudCore | 2018 - 2020
- Developed Node.js REST APIs and PostgreSQL integrations for customer billing workflows.
Projects
Resume Optimizer
- Created a React and Node.js tool for parsing resumes and matching job keywords.
Education
Bachelor of Computer Science, King Saud University, 2017
Certifications
AWS Certified Solutions Architect`;

const jobText = `Senior Full Stack Engineer
Required: TypeScript, React, Node.js, Docker, Kubernetes, GitHub Actions, REST APIs, and cloud deployment experience.
Preferred: AWS certification, CI/CD automation, performance optimization, and documentation.`;

const weakProfile = `Omar Saleh
omar.saleh@example.com
+966 55 222 3000
Riyadh, Saudi Arabia
Customer Support Specialist at RetailOps | 2020 - Present
- Supported customer onboarding workflows and documented recurring product issues.
- Coordinated with product teams to improve help center articles.
Skills: Excel, documentation, stakeholder communication, basic JavaScript, Jira, customer onboarding
Education
Bachelor of Business Administration, King Abdulaziz University, 2019`;

describe("deterministic parsing and matching", () => {
  it("extracts job fallback requirements and skills", () => {
    const job = parseJobFallback(jobText, "Senior Full Stack Engineer");
    expect(job.targetTitle).toBe("Senior Full Stack Engineer");
    expect(job.hardSkills).toContain("TypeScript");
    expect(job.mustHaveRequirements.length).toBeGreaterThan(0);
  });

  it("infers minimal contact fields without creating fake experience", () => {
    const profile = parseProfileFallback(minimalProfile);
    expect(profile.userInfo.fullName).toBe("Hamad Alshamrani");
    expect(profile.userInfo.email).toBe("h.alshamrani.pro@gmail.com");
    expect(profile.userInfo.phone).toBe("+966 50 555 1234");
    expect(profile.certifications.map((cert) => cert.name)).toContain("AWS Certified Solutions Architect");
    expect(profile.experience).toEqual([]);
  });

  it("does not turn labeled skills after a role into experience bullets", () => {
    const profile = parseProfileFallback(weakProfile);
    const bullets = profile.experience.flatMap((entry) => entry.bullets);
    expect(profile.experience).toHaveLength(1);
    expect(profile.skills).toContain("Excel");
    expect(bullets.join(" ")).not.toMatch(/Skills:/i);
  });

  it("flags missing must-haves without unsupported claims", () => {
    const profile = parseProfileFallback(minimalProfile);
    const job = parseJobFallback(jobText);
    const match = matchProfileFallback(profile, job);
    expect(match.mustHaveGaps.length).toBeGreaterThan(0);
    expect(match.unsupportedClaims.join(" ")).toMatch(/No profile evidence/);
  });
});

describe("resume safety formatting", () => {
  it("keeps contact info in the header and never as bullets", () => {
    const profile = parseProfileFallback(minimalProfile);
    const job = parseJobFallback(jobText);
    const resume = formatResumeText(profile, job);
    expect(resume).toContain("Hamad Alshamrani");
    expect(resume).toContain("h.alshamrani.pro@gmail.com");
    expect(resume).not.toMatch(/-\s*h\.alshamrani\.pro@gmail\.com/i);
    expect(resume).not.toMatch(/-\s*\+966/);
  });

  it("does not create placeholder professional experience for minimal profiles", () => {
    const profile = parseProfileFallback(minimalProfile);
    const resume = formatResumeText(profile, parseJobFallback(jobText));
    expect(resume).not.toContain("Professional Experience");
    expect(resume).not.toMatch(/Relevant Experience|Candidate Profile|Not specified/i);
    expect(resume).toMatch(/profile-supported skills/i);
    expect(resume).not.toMatch(/\bexperience\b/i);
  });

  it("preserves metrics but does not invent new numbers", () => {
    const profile = parseProfileFallback(strongProfile);
    const resume = formatResumeText(profile, parseJobFallback(jobText));
    expect(resume).toContain("30%");
    expect(resume).toContain("4 internal finance teams");
    expect(resume).not.toMatch(/Professional Experience[\s\S]*-\s*Projects/);
    expect(resume).not.toContain("50%");
    expect(resume).not.toContain("$");
  });

  it("removes visible placeholders and contact bullets during sanitization", () => {
    const profile = parseProfileFallback(minimalProfile);
    const dirty = `Candidate Profile
- h.alshamrani.pro@gmail.com
Professional Experience
Not specified`;
    expect(sanitizeResumeText(dirty, profile.userInfo)).toBe("Professional Experience");
  });

  it("rejects AI resume text that introduces unsupported experience for minimal profiles", () => {
    const profile = parseProfileFallback(minimalProfile);
    const fallback = formatResumeText(profile, parseJobFallback(jobText));
    const guarded = guardResumeText(
      profile,
      "Hamad Alshamrani\n\nProfessional Experience\nRelevant Experience\n- Expert engineer with 5 teams.",
      fallback
    );
    expect(guarded.resumeText).toBe(fallback);
    expect(guarded.warnings.join(" ")).toMatch(/introduced an experience section|unsupported experience/i);
  });
});

describe("ATS, suggestions, and validation", () => {
  it("calculates ATS feedback and asks for experience evidence when missing", () => {
    const profile = parseProfileFallback(minimalProfile);
    const job = parseJobFallback(jobText);
    const match = matchProfileFallback(profile, job);
    const ats = calculateAtsRubric(profile, job, match, formatResumeText(profile, job));
    expect(ats.overallScore).toBeGreaterThanOrEqual(0);
    expect(ats.feedback.join(" ")).toMatch(/Add real job title, employer, dates/i);
  });

  it("generates high-risk missing-evidence suggestions instead of fake claims", () => {
    const profile = parseProfileFallback(minimalProfile);
    const job = parseJobFallback(jobText);
    const match = matchProfileFallback(profile, job);
    const suggestions = generateSuggestionsFallback(profile, job, match);
    expect(suggestions.some((suggestion) => suggestion.profileSupported === false)).toBe(true);
    expect(suggestions.map((suggestion) => suggestion.suggestedRewrite).join(" ")).toMatch(/Add a real example|Add real job title/i);
  });

  it("rejects AI-invented tools, certifications, and experience during profile validation", () => {
    const fallback = parseProfileFallback(minimalProfile);
    const validated = validateResumeProfile(
      {
        rawText: minimalProfile,
        userInfo: fallback.userInfo,
        skills: ["TypeScript", "Rust"],
        tools: ["Docker", "Terraform"],
        certifications: [{ name: "CISSP" }],
        experience: [{ employer: "FakeCorp", title: "Principal Engineer", bullets: ["Led teams"], tools: [], metrics: [] }]
      },
      fallback
    );
    expect(validated.skills).toContain("TypeScript");
    expect(validated.skills).not.toContain("Rust");
    expect(validated.tools).not.toContain("Terraform");
    expect(validated.certifications.map((cert) => cert.name)).not.toContain("CISSP");
    expect(validated.experience).toEqual([]);
  });

  it("recovers strict JSON wrapped in markdown fences", () => {
    expect(parseJsonPayload("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });
});
