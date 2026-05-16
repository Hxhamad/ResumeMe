import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers3,
  Loader2,
  PenLine,
  Plus,
  Printer,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AtsRubric,
  ExperienceEntry,
  GenerateResponse,
  JobExtraction,
  ProfileMatch,
  ResumeProfile,
  Suggestion,
  UserInfo
} from "../shared/types";
import {
  EMPTY_USER_INFO,
  applySuggestionToSections,
  buildSummaryOptions,
  contactCompleteness,
  createBlankProfile,
  emptySections,
  formatHeader,
  isCompleteExperience,
  joinTextList,
  placeholderFor,
  profileToEvidenceText,
  sectionsFromResume,
  serializeSections,
  splitTextList,
  suggestionsForStep
} from "./lib/wizardSafety";
import type { ResumeSections, SummaryOption, WizardStepId } from "./lib/wizardSafety";

type StartMode = "paste" | "scratch" | "optimize";
type LoadingKey = "profile" | "job" | "suggestions" | "final" | "";

const STEPS: Array<{ id: WizardStepId; label: string; short: string }> = [
  { id: "start", label: "Start", short: "Start" },
  { id: "basics", label: "Basics", short: "Basics" },
  { id: "profile", label: "Profile Evidence", short: "Profile" },
  { id: "job", label: "Job Target", short: "Job" },
  { id: "experience", label: "Experience", short: "Experience" },
  { id: "skills", label: "Skills", short: "Skills" },
  { id: "summary", label: "Summary", short: "Summary" },
  { id: "ats", label: "ATS Review", short: "ATS" },
  { id: "final", label: "Final", short: "Final" }
];

const EMPTY_EXPERIENCE: ExperienceEntry = {
  title: "",
  employer: "",
  location: "",
  startDate: "",
  endDate: "",
  bullets: [],
  tools: [],
  metrics: []
};

export function App() {
  const [activeStep, setActiveStep] = usePersistentState<WizardStepId>("active-step", "start");
  const [startMode, setStartMode] = usePersistentState<StartMode>("start-mode", "paste");
  const [userInfo, setUserInfo] = usePersistentState<UserInfo>("user-info", EMPTY_USER_INFO);
  const [targetRole, setTargetRole] = usePersistentState("target-role", "");
  const [profileText, setProfileText] = usePersistentState("profile-text", "");
  const [jobDescription, setJobDescription] = usePersistentState("job-description", "");
  const [profile, setProfile] = usePersistentState<ResumeProfile | null>("profile", null);
  const [job, setJob] = usePersistentState<JobExtraction | null>("job", null);
  const [match, setMatch] = usePersistentState<ProfileMatch | null>("match", null);
  const [suggestions, setSuggestions] = usePersistentState<Suggestion[]>("suggestions", []);
  const [ats, setAts] = usePersistentState<AtsRubric | null>("ats", null);
  const [sections, setSections] = usePersistentState<ResumeSections>("sections", emptySections());
  const [coverLetter, setCoverLetter] = usePersistentState("cover-letter", "");
  const [feedbackSummary, setFeedbackSummary] = usePersistentState<string[]>("feedback-summary", []);
  const [warnings, setWarnings] = usePersistentState<string[]>("warnings", []);
  const [summaryOptions, setSummaryOptions] = usePersistentState<SummaryOption[]>("summary-options", []);
  const [selectedSummaryId, setSelectedSummaryId] = usePersistentState("selected-summary", "");
  const [summaryDraft, setSummaryDraft] = usePersistentState("summary-draft", "");
  const [loadingKey, setLoadingKey] = useState<LoadingKey>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serviceStatus, setServiceStatus] = useState("");
  const [copied, setCopied] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const activeIndex = STEPS.findIndex((step) => step.id === activeStep);
  const mergedUserInfo = useMemo(() => ({ ...userInfo, targetRole }), [targetRole, userInfo]);
  const activeProfile = useMemo(() => profile ?? createBlankProfile(mergedUserInfo, profileText), [mergedUserInfo, profile, profileText]);
  const contactState = useMemo(() => contactCompleteness(mergedUserInfo), [mergedUserInfo]);
  const finalResumeText = useMemo(() => serializeSections(sections, mergedUserInfo), [mergedUserInfo, sections]);
  const previewText = useMemo(() => {
    if (finalResumeText) return finalResumeText;
    const evidence = profileToEvidenceText(activeProfile, mergedUserInfo);
    return evidence || "Your ATS-safe resume preview will build as you add evidence.";
  }, [activeProfile, finalResumeText, mergedUserInfo]);
  const currentSuggestions = useMemo(() => suggestionsForStep(suggestions, activeStep), [activeStep, suggestions]);

  function updateUserInfo(key: keyof UserInfo, value: string) {
    const next = { ...userInfo, [key]: value };
    setUserInfo(next);
    setProfile((current) => (current ? { ...current, userInfo: { ...current.userInfo, [key]: value } } : current));
    if (key === "targetRole") setTargetRole(value);
  }

  function updateTargetRole(value: string) {
    setTargetRole(value);
    setUserInfo((current) => ({ ...current, targetRole: value }));
    setProfile((current) => (current ? { ...current, userInfo: { ...current.userInfo, targetRole: value } } : current));
  }

  function updateProfile(updater: (current: ResumeProfile) => ResumeProfile) {
    setProfile((current) => updater(current ?? createBlankProfile(mergedUserInfo, profileText)));
  }

  function requestProfile(): ResumeProfile {
    const base = profile ?? createBlankProfile(mergedUserInfo, profileText);
    return {
      ...base,
      userInfo: { ...base.userInfo, ...mergedUserInfo, targetRole },
      rawText: base.rawText || profileText
    };
  }

  function requestPayload() {
    const preparedProfile = requestProfile();
    return {
      profileText: profileToEvidenceText(preparedProfile, mergedUserInfo) || profileText,
      jobDescription,
      targetRole,
      userInfo: mergedUserInfo
    };
  }

  async function parseProfile() {
    setLoadingKey("profile");
    setError("");
    setNotice("");
    setServiceStatus("");
    try {
      const data = await postJson<{ profile: ResumeProfile; warnings: string[]; serviceWarnings?: string[] }>("/api/parse-profile", {
        profileText,
        userInfo: mergedUserInfo
      });
      const parsedRole = data.profile.userInfo.targetRole || targetRole;
      const parsedUserInfo = { ...data.profile.userInfo, targetRole: parsedRole };
      setProfile({ ...data.profile, userInfo: parsedUserInfo });
      setUserInfo(parsedUserInfo);
      setTargetRole(parsedRole);
      setSections(buildSectionsFromProfile({ ...data.profile, userInfo: parsedUserInfo }));
      setSummaryOptions(buildSummaryOptions({ ...data.profile, userInfo: parsedUserInfo }, job ?? undefined));
      setServiceStatus(formatServiceWarnings(data.serviceWarnings));
      setNotice(data.warnings.length ? data.warnings.join(" ") : "Profile evidence parsed. Review and edit anything the parser missed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ResumeMe could not parse the profile.");
    } finally {
      setLoadingKey("");
    }
  }

  async function analyzeJob() {
    setLoadingKey("job");
    setError("");
    setNotice("");
    setServiceStatus("");
    try {
      const data = await postJson<{ job: JobExtraction; warnings: string[]; serviceWarnings?: string[] }>("/api/analyze-job", {
        jobDescription,
        targetRole
      });
      setJob(data.job);
      if (!targetRole && data.job.targetTitle) updateTargetRole(data.job.targetTitle);
      setSummaryOptions(buildSummaryOptions(activeProfile, data.job));
      setServiceStatus(formatServiceWarnings(data.serviceWarnings));
      setNotice(data.warnings.length ? data.warnings.join(" ") : "Job target analyzed. Confirm the requirements before moving on.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ResumeMe could not analyze the job.");
    } finally {
      setLoadingKey("");
    }
  }

  async function refreshSuggestions() {
    setLoadingKey("suggestions");
    setError("");
    setNotice("");
    setServiceStatus("");
    try {
      const data = await postJson<{
        profile: ResumeProfile;
        job: JobExtraction;
        match: ProfileMatch;
        suggestions: Suggestion[];
        warnings: string[];
        serviceWarnings?: string[];
      }>("/api/generate-suggestions", requestPayload());
      setProfile(data.profile);
      setJob(data.job);
      setMatch(data.match);
      setSuggestions(data.suggestions);
      setSummaryOptions(buildSummaryOptions(data.profile, data.job));
      if (!summaryDraft) setSummaryDraft(buildSummaryOptions(data.profile, data.job)[0]?.text ?? "");
      setServiceStatus(formatServiceWarnings(data.serviceWarnings));
      setNotice(data.warnings.length ? data.warnings.join(" ") : "Section-specific suggestions are ready.");
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ResumeMe could not generate suggestions.");
      return null;
    } finally {
      setLoadingKey("");
    }
  }

  async function generateFinal(nextStep: WizardStepId = "ats") {
    setLoadingKey("final");
    setError("");
    setNotice("");
    setServiceStatus("");
    try {
      const payloadProfile = summaryDraft.trim()
        ? { ...requestProfile(), summary: summaryDraft.trim() }
        : requestProfile();
      const data = await postJson<GenerateResponse>("/api/full-generate", {
        ...requestPayload(),
        profileText: profileToEvidenceText(payloadProfile, mergedUserInfo)
      });
      setProfile(data.profile);
      setJob(data.job);
      setMatch(data.match);
      setSuggestions(data.suggestions);
      setAts(data.ats);
      const nextSections = sectionsFromResume(data.resumeText, data.profile);
      if (summaryDraft.trim()) nextSections.summary = summaryDraft.trim();
      setSections(nextSections);
      setCoverLetter(data.coverLetter || "");
      setFeedbackSummary(data.feedbackSummary);
      setWarnings(data.warnings);
      setServiceStatus(formatServiceWarnings(data.serviceWarnings));
      setSummaryOptions(buildSummaryOptions(data.profile, data.job));
      setActiveStep(nextStep);
      setNotice(data.warnings.length ? "Generated output was checked. Review safety warnings below." : "ATS review and final text are ready.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ResumeMe could not generate final output.");
    } finally {
      setLoadingKey("");
    }
  }

  async function decideSuggestion(suggestion: Suggestion, status: "accepted" | "rejected") {
    const updated = suggestions.map((item) => (item.id === suggestion.id ? { ...item, status } : item));
    setSuggestions(updated);
    if (status === "accepted") {
      const applied = applySuggestionToSections(sections, suggestion);
      setSections(applied.sections);
      setNotice(applied.message);
    } else {
      setNotice("Suggestion rejected. No resume facts changed.");
    }

    fetch("/api/apply-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggestions: updated,
        decisions: updated
          .filter((item) => item.status === "accepted" || item.status === "rejected")
          .map((item) => ({ suggestionId: item.id, decision: item.status }))
      })
    }).catch(() => undefined);
  }

  async function copyText(label: string, text: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function downloadResume() {
    const blob = new Blob([finalResumeText], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "resumeme-ats-resume.txt";
    link.click();
    URL.revokeObjectURL(href);
  }

  function move(delta: number) {
    if (delta < 0 && activeStep === "basics" && startMode === "optimize" && jobDescription.trim()) {
      setActiveStep("job");
      setNotice("Back to the job target you analyzed.");
      return;
    }
    if (delta > 0 && activeStep === "job" && startMode === "optimize" && !profile && !profileText.trim()) {
      setActiveStep("basics");
      setNotice("Job target saved. Add basics and profile evidence before section suggestions.");
      return;
    }
    const next = STEPS[Math.min(Math.max(activeIndex + delta, 0), STEPS.length - 1)];
    if (next) setActiveStep(next.id);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <BrandMark />
        <div className="topbar__status">
          <span>Backend-only MiniMax</span>
          <span>Evidence safe</span>
          <span>ATS plain text</span>
        </div>
      </header>

      <section className="builder-frame">
        <StepperNav activeStep={activeStep} setActiveStep={setActiveStep} />

        <section className="wizard-main" aria-label="Resume builder">
          <div className="mobile-progress">
            <span>{STEPS[activeIndex]?.label}</span>
            <meter min="0" max={STEPS.length - 1} value={activeIndex} />
            <button className="icon-button context-toggle" onClick={() => setPreviewOpen((value) => !value)}>
              {previewOpen ? <EyeOff size={16} /> : <Eye size={16} />}
              {previewOpen ? "Hide Preview" : "Preview"}
            </button>
          </div>

          {error ? (
            <div className="error-state">
              <AlertTriangle size={18} />
              {error}
            </div>
          ) : null}
          {notice ? <div className="notice-state">{notice}</div> : null}
          {serviceStatus ? <div className="service-state" aria-live="polite">{serviceStatus}</div> : null}
          {loadingKey ? (
            <div className="notice-state">
              ResumeMe is working. If the AI service is slow, deterministic fallback will return so you can keep moving.
            </div>
          ) : null}

          {activeStep === "start" ? (
            <StartStep
              mode={startMode}
              setMode={setStartMode}
              onChoose={(mode) => {
                setStartMode(mode);
                setNotice(mode === "optimize" ? "Paste and analyze the job first. Then add basics and profile evidence before suggestions." : "");
                setServiceStatus("");
                setActiveStep(mode === "optimize" ? "job" : mode === "scratch" ? "basics" : "profile");
              }}
            />
          ) : null}
          {activeStep === "basics" ? (
            <BasicsStep userInfo={mergedUserInfo} contactState={contactState} updateUserInfo={updateUserInfo} targetRole={targetRole} updateTargetRole={updateTargetRole} />
          ) : null}
          {activeStep === "profile" ? (
            <ProfileStep
              profileText={profileText}
              setProfileText={setProfileText}
              profile={activeProfile}
              updateProfile={updateProfile}
              parseProfile={parseProfile}
              loading={loadingKey === "profile"}
            />
          ) : null}
          {activeStep === "job" ? (
            <JobStep
              jobDescription={jobDescription}
              setJobDescription={setJobDescription}
              targetRole={targetRole}
              updateTargetRole={updateTargetRole}
              job={job}
              analyzeJob={analyzeJob}
              loading={loadingKey === "job"}
            />
          ) : null}
          {activeStep === "experience" ? (
            <ExperienceStep
              profile={activeProfile}
              updateProfile={updateProfile}
              refreshSuggestions={refreshSuggestions}
              loading={loadingKey === "suggestions"}
              suggestions={currentSuggestions}
              copied={copied}
              onDecide={decideSuggestion}
              onCopy={(label, text) => copyText(label, text)}
            />
          ) : null}
          {activeStep === "skills" ? (
            <SkillsStep
              profile={activeProfile}
              updateProfile={updateProfile}
              match={match}
              suggestions={currentSuggestions}
              refreshSuggestions={refreshSuggestions}
              loading={loadingKey === "suggestions"}
              copied={copied}
              onDecide={decideSuggestion}
              onCopy={(label, text) => copyText(label, text)}
            />
          ) : null}
          {activeStep === "summary" ? (
            <SummaryStep
              profile={activeProfile}
              job={job}
              options={summaryOptions.length ? summaryOptions : buildSummaryOptions(activeProfile, job ?? undefined)}
              selectedId={selectedSummaryId}
              draft={summaryDraft}
              onSelect={(option) => {
                setSelectedSummaryId(option.id);
                setSummaryDraft(option.text);
                updateProfile((current) => ({ ...current, summary: option.text }));
              }}
              onDraft={(value) => {
                setSummaryDraft(value);
                updateProfile((current) => ({ ...current, summary: value }));
              }}
            />
          ) : null}
          {activeStep === "ats" ? (
            <AtsStep
              ats={ats}
              match={match}
              warnings={warnings}
              feedbackSummary={feedbackSummary}
              generateFinal={() => generateFinal("ats")}
              loading={loadingKey === "final"}
            />
          ) : null}
          {activeStep === "final" ? (
            <FinalStep
              resumeText={finalResumeText}
              coverLetter={coverLetter}
              setCoverLetter={setCoverLetter}
              feedbackSummary={feedbackSummary}
              warnings={warnings}
              copied={copied}
              copyText={copyText}
              downloadResume={downloadResume}
            />
          ) : null}

          <div className="wizard-footer">
            <button className="icon-button" onClick={() => move(-1)} disabled={activeIndex <= 0}>
              <ArrowLeft size={16} />
              Back
            </button>
          <div className="wizard-footer__right">
            {activeStep === "ats" ? (
              <button
                className="primary-action primary-action--inline"
                onClick={() => (finalResumeText ? setActiveStep("final") : generateFinal("final"))}
                disabled={loadingKey === "final"}
              >
                {loadingKey === "final" ? <Loader2 className="spin" size={16} /> : <FileText size={16} />}
                {finalResumeText ? "Go to Final" : "Generate Final"}
              </button>
            ) : null}
              {activeStep !== "final" && activeStep !== "ats" ? (
                <button className="primary-action primary-action--inline" onClick={() => move(1)}>
                  Next
                  <ArrowRight size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <ContextPanel
          open={previewOpen}
          step={activeStep}
          previewText={previewText}
          suggestions={currentSuggestions}
          ats={ats}
          match={match}
          notice={notice}
          onDecide={decideSuggestion}
          copied={copied}
          onCopy={(label, text) => copyText(label, text)}
        />
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="brand" aria-label="ResumeMe">
      <svg className="brand__mark" viewBox="0 0 90 90" role="img" aria-label="ResumeMe logo">
        <path d="M24 68V17c0-5 3-8 8-8h27l13 13v46" />
        <path d="M59 9v11c0 4 2 6 6 6h10" />
        <path d="M45 71V35" />
        <path d="M45 45c-11 0-18-6-20-16 11 0 18 6 20 16Z" />
        <path d="M45 45c11 0 18-6 20-16-11 0-18 6-20 16Z" />
        <path d="M45 35c-7-8-7-17 0-25 7 8 7 17 0 25Z" />
        <path d="M45 70c-11-13-23-17-36-12 7 12 21 16 36 12Z" />
        <path d="M45 70c11-13 23-17 36-12-7 12-21 16-36 12Z" />
      </svg>
      <div>
        <div className="brand__name">Resume Me</div>
        <div className="brand__tag">Grow Your Career</div>
      </div>
    </div>
  );
}

function StepperNav(props: { activeStep: WizardStepId; setActiveStep: (step: WizardStepId) => void }) {
  return (
    <aside className="stepper" aria-label="Builder steps">
      {STEPS.map((step, index) => (
        <button
          key={step.id}
          className={`stepper__item ${props.activeStep === step.id ? "is-active" : ""}`}
          onClick={() => props.setActiveStep(step.id)}
        >
          <span className="stepper__number">{index + 1}</span>
          <span>{step.label}</span>
        </button>
      ))}
    </aside>
  );
}

function StartStep(props: { mode: StartMode; setMode: (mode: StartMode) => void; onChoose: (mode: StartMode) => void }) {
  const choices: Array<{ mode: StartMode; title: string; body: string; icon: JSX.Element }> = [
    { mode: "paste", title: "Paste existing resume", body: "Start by pasting current evidence and let ResumeMe parse it.", icon: <Clipboard size={22} /> },
    { mode: "scratch", title: "Start from scratch", body: "Add contact details, skills, and real evidence section by section.", icon: <PenLine size={22} /> },
    { mode: "optimize", title: "Optimize for a job", body: "Analyze the job first, then ResumeMe collects basics and profile evidence before suggestions.", icon: <BriefcaseBusiness size={22} /> }
  ];
  return (
    <StepPanel eyebrow="Start" title="Choose how you want to build">
      <div className="choice-grid">
        {choices.map((choice) => (
          <button
            key={choice.mode}
            className={`choice ${props.mode === choice.mode ? "is-selected" : ""}`}
            onClick={() => {
              props.setMode(choice.mode);
              props.onChoose(choice.mode);
            }}
          >
            <span className="choice__icon">{choice.icon}</span>
            <span className="choice__title">{choice.title}</span>
            <span className="choice__body">{choice.body}</span>
          </button>
        ))}
      </div>
      <div className="calm-note">
        ResumeMe only uses facts you provide. Missing evidence becomes a prompt to add proof, not a fabricated resume claim.
      </div>
    </StepPanel>
  );
}

function BasicsStep(props: {
  userInfo: UserInfo;
  contactState: { completed: number; total: number; percent: number; missing: string[] };
  targetRole: string;
  updateUserInfo: (key: keyof UserInfo, value: string) => void;
  updateTargetRole: (value: string) => void;
}) {
  return (
    <StepPanel eyebrow="Basics" title="Contact header and target role">
      <div className="completion-row">
        <div>
          <strong>{props.contactState.percent}% complete</strong>
          <span>{props.contactState.completed} of {props.contactState.total} contact fields ready</span>
        </div>
        <meter min="0" max="100" value={props.contactState.percent} />
      </div>
      <div className="form-grid">
        <Field label="Full name" value={props.userInfo.fullName} onChange={(value) => props.updateUserInfo("fullName", value)} />
        <Field label="Target role" value={props.targetRole} onChange={props.updateTargetRole} />
        <Field label="Email" value={props.userInfo.email} onChange={(value) => props.updateUserInfo("email", value)} />
        <Field label="Phone" value={props.userInfo.phone} onChange={(value) => props.updateUserInfo("phone", value)} />
        <Field label="Location" value={props.userInfo.location} onChange={(value) => props.updateUserInfo("location", value)} />
        <Field label="LinkedIn" value={props.userInfo.linkedin} onChange={(value) => props.updateUserInfo("linkedin", value)} />
        <Field label="Portfolio" value={props.userInfo.portfolio} onChange={(value) => props.updateUserInfo("portfolio", value)} />
      </div>
      {props.contactState.missing.length ? (
        <div className="calm-note">Still useful to add: {props.contactState.missing.join(", ")}.</div>
      ) : null}
    </StepPanel>
  );
}

function ProfileStep(props: {
  profileText: string;
  setProfileText: (value: string) => void;
  profile: ResumeProfile;
  updateProfile: (updater: (current: ResumeProfile) => ResumeProfile) => void;
  parseProfile: () => void;
  loading: boolean;
}) {
  return (
    <StepPanel eyebrow="Profile Evidence" title="Paste, parse, and confirm facts">
      <label className="stacked-label">
        Candidate evidence or resume text
        <textarea
          className="input-block input-block--large"
          value={props.profileText}
          onChange={(event) => props.setProfileText(event.target.value)}
          spellCheck={false}
          placeholder="Paste the existing resume, profile notes, real project evidence, education, certifications, and skills."
        />
      </label>
      <button className="primary-action" onClick={props.parseProfile} disabled={props.loading}>
        {props.loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
        Parse Profile
      </button>

      <DetectedFacts profile={props.profile} />

      <div className="field-group">
        <label className="stacked-label">
          Confirmed summary
          <textarea
            value={props.profile.summary}
            onChange={(event) => props.updateProfile((current) => ({ ...current, summary: event.target.value }))}
            placeholder="Optional. Keep this evidence-supported."
          />
        </label>
        <label className="stacked-label">
          Confirmed skills
          <textarea
            value={joinTextList(props.profile.skills)}
            onChange={(event) => props.updateProfile((current) => ({ ...current, skills: splitTextList(event.target.value) }))}
            placeholder="TypeScript, Docker, Kubernetes"
          />
        </label>
        <label className="stacked-label">
          Confirmed certifications
          <textarea
            value={props.profile.certifications.map((certification) => certification.name).join("\n")}
            onChange={(event) =>
              props.updateProfile((current) => ({
                ...current,
                certifications: splitTextList(event.target.value).map((name) => ({ name }))
              }))
            }
            placeholder="AWS Certified Solutions Architect"
          />
        </label>
      </div>
    </StepPanel>
  );
}

function JobStep(props: {
  jobDescription: string;
  setJobDescription: (value: string) => void;
  targetRole: string;
  updateTargetRole: (value: string) => void;
  job: JobExtraction | null;
  analyzeJob: () => void;
  loading: boolean;
}) {
  return (
    <StepPanel eyebrow="Job Target" title="Analyze the role requirements">
      <Field label="Target title" value={props.targetRole} onChange={props.updateTargetRole} />
      <label className="stacked-label">
        Job description
        <textarea
          className="input-block input-block--large"
          value={props.jobDescription}
          onChange={(event) => props.setJobDescription(event.target.value)}
          spellCheck={false}
          placeholder="Paste the job description here."
        />
      </label>
      <button className="primary-action" onClick={props.analyzeJob} disabled={props.loading}>
        {props.loading ? <Loader2 className="spin" size={16} /> : <Layers3 size={16} />}
        Analyze Job
      </button>
      {props.job ? <JobFacts job={props.job} /> : <div className="empty-state">Job requirements will appear here after analysis.</div>}
    </StepPanel>
  );
}

function ExperienceStep(props: {
  profile: ResumeProfile;
  updateProfile: (updater: (current: ResumeProfile) => ResumeProfile) => void;
  refreshSuggestions: () => void;
  loading: boolean;
  suggestions: Suggestion[];
  copied: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  onCopy: (label: string, text: string) => void;
}) {
  const realEntries = props.profile.experience.filter(isCompleteExperience).length;
  return (
    <StepPanel eyebrow="Experience" title="Edit real work entries">
      <div className="inline-summary">
        <strong>{realEntries}</strong>
        <span>{realEntries === 1 ? "real work entry detected" : "real work entries detected"}</span>
      </div>
      {!realEntries ? (
        <div className="empty-state">
          Professional Experience stays omitted until you add a real title, employer, dates, and supported bullets.
        </div>
      ) : null}
      <div className="experience-list">
        {props.profile.experience.map((entry, index) => (
          <ExperienceCard
            key={`${entry.title}-${entry.employer}-${index}`}
            entry={entry}
            onChange={(next) =>
              props.updateProfile((current) => ({
                ...current,
                experience: current.experience.map((item, itemIndex) => (itemIndex === index ? next : item))
              }))
            }
            onRemove={() =>
              props.updateProfile((current) => ({
                ...current,
                experience: current.experience.filter((_, itemIndex) => itemIndex !== index)
              }))
            }
          />
        ))}
      </div>
      <div className="button-row">
        <button
          className="icon-button"
          onClick={() =>
            props.updateProfile((current) => ({
              ...current,
              experience: [...current.experience, { ...EMPTY_EXPERIENCE }]
            }))
          }
        >
          <Plus size={16} />
          Add Work Entry
        </button>
        <button className="primary-action primary-action--inline" onClick={props.refreshSuggestions} disabled={props.loading}>
          {props.loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          Get Suggestions
        </button>
      </div>
      <InlineSuggestionSection
        title="Experience Suggestions"
        suggestions={props.suggestions}
        empty="Run Get Suggestions to review supported bullet rewrites and evidence prompts for this section."
        copied={props.copied}
        onDecide={props.onDecide}
        onCopy={props.onCopy}
      />
    </StepPanel>
  );
}

function SkillsStep(props: {
  profile: ResumeProfile;
  updateProfile: (updater: (current: ResumeProfile) => ResumeProfile) => void;
  match: ProfileMatch | null;
  suggestions: Suggestion[];
  refreshSuggestions: () => void;
  loading: boolean;
  copied: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  onCopy: (label: string, text: string) => void;
}) {
  const safe = props.suggestions.filter((suggestion) => suggestion.section.toLowerCase().includes("skill") && suggestion.profileSupported && suggestion.riskLevel !== "high");
  const needsEvidence = props.suggestions.filter((suggestion) => !suggestion.profileSupported || suggestion.riskLevel === "high");
  return (
    <StepPanel eyebrow="Skills" title="Keep only supported skills">
      <label className="stacked-label">
        Current skills
        <textarea
          value={joinTextList(props.profile.skills)}
          onChange={(event) => props.updateProfile((current) => ({ ...current, skills: splitTextList(event.target.value) }))}
          placeholder="Add skills you can support with profile evidence."
        />
      </label>
      <button className="primary-action" onClick={props.refreshSuggestions} disabled={props.loading}>
        {props.loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
        Analyze Fit
      </button>
      <div className="keyword-grid">
        <KeywordColumn title="Job-supported skills" items={props.match?.supportedKeywords.map((item) => item.keyword) ?? []} />
        <KeywordColumn title="Weak keywords" items={props.match?.weaklySupportedKeywords.map((item) => item.keyword) ?? []} />
        <KeywordColumn title="Missing from profile" items={props.match?.missingKeywords.map((item) => item.keyword) ?? []} />
      </div>
      <div className="suggestion-split">
        <SuggestionMiniList title="Safe to include" suggestions={safe} />
        <SuggestionMiniList title="Needs evidence" suggestions={needsEvidence.filter((item) => item.section.toLowerCase().includes("missing") || item.section.toLowerCase().includes("skill"))} />
      </div>
      <InlineSuggestionSection
        title="Skills Suggestions"
        suggestions={props.suggestions}
        empty="Run Analyze Fit to review supported skill additions and missing-evidence prompts."
        copied={props.copied}
        onDecide={props.onDecide}
        onCopy={props.onCopy}
      />
    </StepPanel>
  );
}

function SummaryStep(props: {
  profile: ResumeProfile;
  job: JobExtraction | null;
  options: SummaryOption[];
  selectedId: string;
  draft: string;
  onSelect: (option: SummaryOption) => void;
  onDraft: (value: string) => void;
}) {
  const noExperience = props.profile.experience.filter(isCompleteExperience).length === 0;
  return (
    <StepPanel eyebrow="Summary" title="Choose an evidence-safe summary">
      {noExperience ? (
        <div className="notice-state">
          This profile has no confirmed work entry. Summary options use "profile-supported skills" and avoid experience or expertise claims.
        </div>
      ) : null}
      <div className="summary-options">
        {props.options.map((option) => (
          <button
            key={option.id}
            className={`summary-option ${props.selectedId === option.id ? "is-selected" : ""}`}
            onClick={() => props.onSelect(option)}
          >
            <span>{option.text}</span>
            <small>{option.whySafe}</small>
          </button>
        ))}
      </div>
      <label className="stacked-label">
        Accepted summary
        <textarea value={props.draft} onChange={(event) => props.onDraft(event.target.value)} placeholder="Choose an option or write an evidence-supported summary." />
      </label>
    </StepPanel>
  );
}

function AtsStep(props: {
  ats: AtsRubric | null;
  match: ProfileMatch | null;
  warnings: string[];
  feedbackSummary: string[];
  generateFinal: () => void;
  loading: boolean;
}) {
  return (
    <StepPanel eyebrow="ATS Review" title="Check safety, coverage, and next actions">
      <button className="primary-action" onClick={props.generateFinal} disabled={props.loading}>
        {props.loading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
        Run ATS Review
      </button>
      {props.ats ? <RubricList ats={props.ats} /> : <div className="empty-state">Run ATS review to score parser safety, keyword coverage, evidence strength, and unsupported claim risk.</div>}
      <div className="review-grid">
        <ReviewList
          title="Missing requirements"
          items={props.match?.mustHaveGaps.map((item) => item.text) ?? []}
          empty={props.match ? "No must-have gaps detected." : "Run ATS review to detect missing requirements."}
        />
        <ReviewList
          title="Unsupported claim warnings"
          items={props.warnings}
          empty={props.ats ? "No generated-output warnings detected." : "Run ATS review to check unsupported claim risk."}
        />
        <ReviewList title="Next actions" items={props.ats?.feedback.length ? props.ats.feedback : props.feedbackSummary} empty="Review actions will appear after ATS scoring." />
      </div>
    </StepPanel>
  );
}

function FinalStep(props: {
  resumeText: string;
  coverLetter: string;
  setCoverLetter: (value: string) => void;
  feedbackSummary: string[];
  warnings: string[];
  copied: string;
  copyText: (label: string, text: string) => void;
  downloadResume: () => void;
}) {
  return (
    <StepPanel eyebrow="Final" title="ATS-safe resume text and cover letter">
      <div className="button-row output-actions">
        <button className="icon-button" onClick={() => props.copyText("resume", props.resumeText)} disabled={!props.resumeText}>
          <Clipboard size={16} />
          {props.copied === "resume" ? "Resume copied" : "Copy Resume"}
        </button>
        <button className="icon-button" onClick={props.downloadResume} disabled={!props.resumeText}>
          <Download size={16} />
          Download .txt
        </button>
        <button className="icon-button" onClick={() => window.print()} disabled={!props.resumeText}>
          <Printer size={16} />
          Print
        </button>
      </div>
      <div className="output-grid">
        <div className="output-column output-column--resume">
          <div className="output-column__heading">
            <h3>Resume Text</h3>
          </div>
          <pre className="resume-output">{props.resumeText || "Generate final output to populate the ATS-safe resume."}</pre>
        </div>
        <div className="output-column output-column--cover">
          <div className="output-column__heading">
            <h3>Cover Letter</h3>
            <button className="icon-button" onClick={() => props.copyText("cover", props.coverLetter)} disabled={!props.coverLetter}>
              <Clipboard size={16} />
              {props.copied === "cover" ? "Cover letter copied" : "Copy"}
            </button>
          </div>
          <textarea
            className="cover-letter"
            value={props.coverLetter}
            onChange={(event) => props.setCoverLetter(event.target.value)}
            spellCheck={false}
            placeholder="Generate final output to populate the editable cover letter."
            aria-label="Editable cover letter"
          />
        </div>
        <div className="output-column output-column--feedback">
          <div className="output-column__heading">
            <h3>Feedback Summary</h3>
          </div>
          <ReviewList title="" items={[...props.feedbackSummary, ...props.warnings]} empty="Feedback appears after generation." />
        </div>
      </div>
    </StepPanel>
  );
}

function ContextPanel(props: {
  open: boolean;
  step: WizardStepId;
  previewText: string;
  suggestions: Suggestion[];
  ats: AtsRubric | null;
  match: ProfileMatch | null;
  notice: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  copied: string;
  onCopy: (label: string, text: string) => void;
}) {
  const showSuggestions = props.step === "summary";
  return (
    <aside className={`context-panel ${props.open ? "context-panel--open" : ""}`} aria-label="Live preview and suggestions">
      {showSuggestions ? (
        <SuggestionPanel suggestions={props.suggestions} notice={props.notice} copied={props.copied} onDecide={props.onDecide} onCopy={props.onCopy} />
      ) : (
        <LivePreview previewText={props.previewText} ats={props.ats} match={props.match} />
      )}
    </aside>
  );
}

function LivePreview(props: { previewText: string; ats: AtsRubric | null; match: ProfileMatch | null }) {
  return (
    <section className="panel context-section">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">Live Preview</p>
          <h2>{props.ats ? `${props.ats.overallScore}/100 ATS` : "Resume draft"}</h2>
        </div>
        <FileText size={22} aria-hidden />
      </div>
      <pre className="preview-box">{props.previewText}</pre>
      {props.match ? (
        <div className="preview-stats">
          <span>{props.match.supportedKeywords.length} supported</span>
          <span>{props.match.weaklySupportedKeywords.length} weak</span>
          <span>{props.match.mustHaveGaps.length} must-have gaps</span>
        </div>
      ) : null}
    </section>
  );
}

function SuggestionPanel(props: {
  suggestions: Suggestion[];
  notice: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  copied: string;
  onCopy: (label: string, text: string) => void;
}) {
  return (
    <section className="panel context-section" aria-label="AI Suggestions">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">AI Suggestions</p>
          <h2>Current task</h2>
        </div>
        <Sparkles size={22} aria-hidden />
      </div>
      {!props.suggestions.length ? <div className="empty-state">Generate suggestions to see section-specific guidance here.</div> : null}
      {props.notice ? <div className="notice-state">{props.notice}</div> : null}
      <SuggestionCards suggestions={props.suggestions} copied={props.copied} onDecide={props.onDecide} onCopy={props.onCopy} />
    </section>
  );
}

function InlineSuggestionSection(props: {
  title: string;
  suggestions: Suggestion[];
  empty: string;
  copied: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  onCopy: (label: string, text: string) => void;
}) {
  return (
    <section className="inline-suggestions" aria-label={props.title}>
      <div className="inline-suggestions__heading">
        <h3>{props.title}</h3>
        <span>{props.suggestions.length ? `${props.suggestions.length} ready` : "Not generated yet"}</span>
      </div>
      {props.suggestions.length ? (
        <SuggestionCards suggestions={props.suggestions} copied={props.copied} onDecide={props.onDecide} onCopy={props.onCopy} />
      ) : (
        <div className="empty-state">{props.empty}</div>
      )}
    </section>
  );
}

function SuggestionCards(props: {
  suggestions: Suggestion[];
  copied: string;
  onDecide: (suggestion: Suggestion, status: "accepted" | "rejected") => void;
  onCopy: (label: string, text: string) => void;
}) {
  return (
    <div className="suggestion-list">
      {props.suggestions.map((suggestion) => (
        <article className={`suggestion suggestion--${suggestion.riskLevel}`} key={suggestion.id}>
          <div className="suggestion__top">
            <span>{suggestion.section}</span>
            <StatusBadge suggestion={suggestion} />
          </div>
          <dl>
            <dt>Original</dt>
            <dd>{suggestion.originalText}</dd>
            <dt>Suggested Rewrite</dt>
            <dd>{suggestion.suggestedRewrite}</dd>
            <dt>Reason</dt>
            <dd>{suggestion.reason}</dd>
          </dl>
          <div className="suggestion__meta">
            <span>{suggestion.confidence}% confidence</span>
            <span>{suggestion.riskLevel} risk</span>
            <span>{suggestion.profileSupported ? "profile-supported" : "Needs evidence"}</span>
          </div>
          <div className="button-row">
            <button className="icon-button accept" onClick={() => props.onDecide(suggestion, "accepted")}>
              <ThumbsUp size={16} />
              Accept
            </button>
            <button className="icon-button reject" onClick={() => props.onDecide(suggestion, "rejected")}>
              <ThumbsDown size={16} />
              Reject
            </button>
            <button className="icon-button" onClick={() => props.onCopy(`suggestion:${suggestion.id}`, suggestion.suggestedRewrite)}>
              <Clipboard size={16} />
              {props.copied === `suggestion:${suggestion.id}` ? "Suggestion copied" : "Copy"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function DetectedFacts({ profile }: { profile: ResumeProfile }) {
  const rows = [
    ["Contact", [profile.userInfo.fullName, profile.userInfo.email, profile.userInfo.phone, profile.userInfo.location].filter(Boolean).length],
    ["Summary", profile.summary ? 1 : 0],
    ["Skills", profile.skills.length],
    ["Experience", profile.experience.filter(isCompleteExperience).length],
    ["Projects", profile.projects.length],
    ["Education", profile.education.length],
    ["Certifications", profile.certifications.length]
  ];
  return (
    <div className="detected-grid" aria-label="Detected profile facts">
      {rows.map(([label, count]) => (
        <div className="detected-item" key={label}>
          <strong>{count}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function JobFacts({ job }: { job: JobExtraction }) {
  return (
    <div className="job-facts">
      <div className="inline-summary">
        <strong>{job.targetTitle || "Target role"}</strong>
        <span>{job.seniority || "Seniority not detected"}</span>
      </div>
      <div className="keyword-grid">
        <KeywordColumn title="Must-have requirements" items={job.mustHaveRequirements.map((item) => item.text)} />
        <KeywordColumn title="Preferred requirements" items={job.preferredRequirements.map((item) => item.text)} />
        <KeywordColumn title="Hard skills" items={job.hardSkills} />
        <KeywordColumn title="Soft skills" items={job.softSkills} />
        <KeywordColumn title="Tools/platforms" items={job.toolsPlatforms} />
        <KeywordColumn title="Certifications" items={job.certifications} />
        <KeywordColumn title="Repeated keywords" items={job.repeatedTerms} />
      </div>
    </div>
  );
}

function ExperienceCard(props: { entry: ExperienceEntry; onChange: (entry: ExperienceEntry) => void; onRemove: () => void }) {
  const update = (patch: Partial<ExperienceEntry>) => props.onChange({ ...props.entry, ...patch });
  return (
    <article className="experience-card">
      <div className="experience-card__head">
        <strong>{props.entry.title || "Work entry"}</strong>
        <button className="icon-button icon-button--square" onClick={props.onRemove} title="Remove work entry">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="form-grid">
        <Field label="Job title" value={props.entry.title} onChange={(value) => update({ title: value })} />
        <Field label="Company" value={props.entry.employer} onChange={(value) => update({ employer: value })} />
        <Field label="Location" value={props.entry.location || ""} onChange={(value) => update({ location: value })} />
        <Field label="Start date" value={props.entry.startDate || ""} onChange={(value) => update({ startDate: value })} />
        <Field label="End date" value={props.entry.endDate || ""} onChange={(value) => update({ endDate: value })} />
      </div>
      <label className="stacked-label">
        Supported bullets
        <textarea
          value={props.entry.bullets.join("\n")}
          onChange={(event) =>
            update({
              bullets: event.target.value
                .split("\n")
                .map((line) => line.replace(/^[-*]\s*/, "").trim())
                .filter(Boolean)
            })
          }
          placeholder="One real, evidence-supported bullet per line."
        />
      </label>
    </article>
  );
}

function RubricList({ ats }: { ats: AtsRubric }) {
  const rows = [
    ["Parser safety", ats.parserSafety],
    ["Keyword coverage", ats.keywordCoverage],
    ["Must-have coverage", ats.mustHaveCoverage],
    ["Evidence/metrics strength", ats.evidenceMetricsStrength],
    ["Experience relevance", ats.experienceRelevance],
    ["Contact completeness", ats.contactCompleteness],
    ["Date completeness", ats.dateCompleteness],
    ["Unsupported claim risk", ats.unsupportedClaimRisk]
  ];
  return (
    <div className="rubric-list">
      {rows.map(([label, score]) => (
        <div className="rubric-row" key={label}>
          <span>{label}</span>
          <meter min="0" max="100" value={Number(score)} />
          <strong>{score}</strong>
        </div>
      ))}
    </div>
  );
}

function KeywordColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="keyword-column">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.slice(0, 10).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None detected</p>
      )}
    </div>
  );
}

function SuggestionMiniList({ title, suggestions }: { title: string; suggestions: Suggestion[] }) {
  return (
    <div className="mini-list">
      <h3>{title}</h3>
      {suggestions.length ? (
        <ul>
          {suggestions.slice(0, 5).map((suggestion) => (
            <li key={suggestion.id}>{suggestion.suggestedRewrite}</li>
          ))}
        </ul>
      ) : (
        <p>None yet</p>
      )}
    </div>
  );
}

function ReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="review-list">
      {title ? <h3>{title}</h3> : null}
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function StatusBadge({ suggestion }: { suggestion: Suggestion }) {
  if (suggestion.status === "accepted") {
    return (
      <span className="status-badge accepted">
        <Check size={13} />
        Accepted
      </span>
    );
  }
  if (suggestion.status === "rejected") {
    return (
      <span className="status-badge rejected">
        <X size={13} />
        Rejected
      </span>
    );
  }
  return <span className="status-badge">Pending</span>;
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      {props.label}
      <input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} />
    </label>
  );
}

function StepPanel(props: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="panel step-panel">
      <div className="panel__heading">
        <div>
          <p className="eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
        </div>
      </div>
      {props.children}
    </section>
  );
}

function buildSectionsFromProfile(profile: ResumeProfile): ResumeSections {
  const sections = emptySections();
  sections.header = formatHeader(profile.userInfo);
  sections.summary = profile.summary;
  sections.skills = profile.skills.map((skill) => `- ${skill}`).join("\n");
  sections.experience = profile.experience
    .filter(isCompleteExperience)
    .map((entry) => {
      const dates = [entry.startDate, entry.endDate].filter(Boolean).join(" - ");
      const header = [entry.title, entry.employer, dates, entry.location].filter(Boolean).join(" | ");
      return [header, ...entry.bullets.map((bullet) => `- ${bullet.replace(/^[-*]\s*/, "")}`)].filter(Boolean).join("\n");
    })
    .join("\n\n");
  sections.projects = profile.projects
    .filter((project) => project.name)
    .map((project) => [project.name, ...project.bullets.map((bullet) => `- ${bullet}`)].join("\n"))
    .join("\n\n");
  sections.education = profile.education
    .filter((entry) => entry.school)
    .map((entry) => `- ${[entry.degree, entry.field, entry.school, entry.graduationDate, entry.location].filter(Boolean).join(", ")}`)
    .join("\n");
  sections.certifications = profile.certifications
    .filter((entry) => entry.name)
    .map((entry) => `- ${[entry.name, entry.issuer, entry.date].filter(Boolean).join(", ")}`)
    .join("\n");
  return sections;
}

function formatServiceWarnings(serviceWarnings?: string[]): string {
  const unique = Array.from(new Set(serviceWarnings ?? []));
  if (!unique.length) return "";
  return `${unique.map((warning) => warning.replace(/\s*You can continue\.$/i, "").trim()).join(" ")} You can continue.`;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `resumeme:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Local persistence is best-effort; the builder still works without it.
    }
  }, [storageKey, value]);

  return [value, setValue];
}
