import React, { useState, useEffect } from 'react';
import { Subject, Misconception } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Cpu,
  TrendingUp,
  Brain,
  Award,
  HelpCircle,
  BookOpen,
  Layers,
  ChevronRight,
  Target,
  Compass,
  Zap,
  Play
} from 'lucide-react';
import {
  apiStartAdaptiveSession,
  apiSubmitAdaptiveAnswer,
  apiGetActiveAdaptiveSession
} from '../services/api';

interface AssessmentPageProps {
  subjects: Subject[];
  onCompleteAssessment: (results: {
    strongConcepts: string[];
    weakConcepts: string[];
    misconceptions: Misconception[];
    confidence: number;
  }) => void;
  onNavigateToTutor: () => void;
  sessionToken?: string;
  initialSubjectId?: string;
}

export const AssessmentPage: React.FC<AssessmentPageProps> = ({
  subjects,
  onCompleteAssessment,
  onNavigateToTutor,
  sessionToken = '',
  initialSubjectId
}) => {
  const initialSub = subjects.find(s => s.id === initialSubjectId) || subjects[0] || null;
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(initialSub);

  // Active Adaptive Assessment State
  const [sessionId, setSessionId] = useState<string>('');
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [isEvaluatingAnswer, setIsEvaluatingAnswer] = useState(false);
  const [isInitializingSession, setIsInitializingSession] = useState(false);
  const [isAssessmentFinished, setIsAssessmentFinished] = useState(false);

  // Resume state banner
  const [hasResumeSession, setHasResumeSession] = useState(false);
  const [resumeSessionData, setResumeSessionData] = useState<any>(null);

  // Bayesian Mastery & Cognitive Telemetry
  const [bayesianCertainty, setBayesianCertainty] = useState(50);
  const [posteriorMean, setPosteriorMean] = useState(0.5);
  const [alpha, setAlpha] = useState(1.0);
  const [beta, setBeta] = useState(1.0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Pedagogical Steering HUD
  const [currentStage, setCurrentStage] = useState<'easy' | 'medium' | 'difficult' | 'remediation' | 'prerequisite' | string>('easy');
  const [currentDifficulty, setCurrentDifficulty] = useState<string>('easy');
  const [pedagogicalDecision, setPedagogicalDecision] = useState<{
    action: string;
    reasoning: string;
    next_difficulty: string;
    next_stage: string;
  } | null>(null);
  const [lastEvaluatedAnswer, setLastEvaluatedAnswer] = useState<{
    is_correct: boolean;
    selected_option_id: string;
    correct_option_id: string;
    explanation: string;
    diagnosed_misconception?: string;
  } | null>(null);
  const [nextQueuedQuestion, setNextQueuedQuestion] = useState<any>(null);

  // Final Cognitive Diagnosis Report
  const [finalReport, setFinalReport] = useState<any>(null);
  const [detectedMisconceptions, setDetectedMisconceptions] = useState<Misconception[]>([]);

  const token =
    sessionToken ||
    sessionStorage.getItem('learnmind_session_token') ||
    localStorage.getItem('learnmind_session_token') ||
    '';

  // Check for active session or initialize adaptive session when subject changes
  useEffect(() => {
    if (!selectedSubject) return;

    let isMounted = true;
    setIsInitializingSession(true);
    setHasSubmittedAnswer(false);
    setSelectedOptionId(null);
    setIsAssessmentFinished(false);
    setFinalReport(null);
    setLastEvaluatedAnswer(null);
    setPedagogicalDecision(null);
    setNextQueuedQuestion(null);
    setHasResumeSession(false);

    // 1. Check if student already has an active in-progress adaptive session
    apiGetActiveAdaptiveSession(token, selectedSubject.id)
      .then((activeRes) => {
        if (!isMounted) return;
        if (activeRes.has_active && activeRes.session) {
          const sess = activeRes.session;
          setHasResumeSession(true);
          setResumeSessionData(sess);
          setSessionId(sess.id);
          setCurrentStage(sess.current_stage || 'easy');
          setCurrentDifficulty(sess.current_difficulty || 'easy');
          setTotalAnswered(sess.total_questions_answered || 0);
          setAlpha(sess.posterior_alpha || 1.0);
          setBeta(sess.posterior_beta || 1.0);

          // Calculate certainty
          const a = sess.posterior_alpha || 1.0;
          const b = sess.posterior_beta || 1.0;
          const denom = a + b;
          const variance = (a * b) / (Math.pow(denom, 2) * (denom + 1));
          setBayesianCertainty(Math.max(10, Math.min(99, Math.round((1 - variance * 10) * 100))));
          setPosteriorMean(a / denom);

          setIsInitializingSession(false);
        } else {
          // No active session: Start fresh adaptive session
          startFreshAdaptiveSession(selectedSubject.id);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        startFreshAdaptiveSession(selectedSubject.id);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubject?.id, token]);

  const startFreshAdaptiveSession = async (subjectId: string, topicId?: string) => {
    setIsInitializingSession(true);
    setHasResumeSession(false);
    try {
      const res = await apiStartAdaptiveSession(token, subjectId, topicId);
      if (res.success && res.session) {
        setSessionId(res.session.session_id);
        setActiveQuestion(res.session.current_question);
        setCurrentStage(res.session.stage || 'easy');
        setCurrentDifficulty(res.session.difficulty || 'easy');
        setTotalAnswered(res.session.total_questions_answered || 0);
        setAlpha(1.0);
        setBeta(1.0);
        setPosteriorMean(0.5);
        setBayesianCertainty(50);
        setSelectedOptionId(null);
        setHasSubmittedAnswer(false);
      }
    } catch (err: any) {
      console.error('Failed to start adaptive session:', err);
    } finally {
      setIsInitializingSession(false);
    }
  };

  const handleResumeSession = async () => {
    if (!resumeSessionData || !selectedSubject) return;
    setIsInitializingSession(true);
    setHasResumeSession(false);

    try {
      // Re-trigger start with existing topic to fetch or resume current question
      const res = await apiStartAdaptiveSession(token, selectedSubject.id, resumeSessionData.current_topic_id);
      if (res.success && res.session) {
        setActiveQuestion(res.session.current_question);
        setSelectedOptionId(null);
        setHasSubmittedAnswer(false);
      }
    } catch (err) {
      console.error('Failed to resume session:', err);
    } finally {
      setIsInitializingSession(false);
    }
  };

  const handleSelectOption = (optionId: string) => {
    if (hasSubmittedAnswer || isEvaluatingAnswer) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmitAnswer = async () => {
    if (!selectedOptionId || hasSubmittedAnswer || !activeQuestion || isEvaluatingAnswer) return;

    setIsEvaluatingAnswer(true);

    try {
      const res = await apiSubmitAdaptiveAnswer(token, {
        session_id: sessionId,
        selected_option_id: selectedOptionId,
        active_question: activeQuestion,
      });

      if (res.success && res.data) {
        const d = res.data;
        setLastEvaluatedAnswer(d.evaluated_answer);
        setPedagogicalDecision(d.pedagogical_decision);
        setTotalAnswered(d.total_questions_answered);

        // Update Bayesian parameters
        if (d.bayesian_telemetry) {
          setAlpha(d.bayesian_telemetry.alpha);
          setBeta(d.bayesian_telemetry.beta);
          setPosteriorMean(d.bayesian_telemetry.posterior_mean);
          setBayesianCertainty(d.bayesian_telemetry.certainty);
        }

        // Check if assessment completed
        if (d.is_concluded && d.final_report) {
          setFinalReport(d.final_report);
          setNextQueuedQuestion(null);
        } else if (d.next_question) {
          setNextQueuedQuestion(d.next_question);
        }

        setHasSubmittedAnswer(true);
      }
    } catch (err: any) {
      alert(`Could not evaluate answer: ${err.message || 'Please check backend connection.'}`);
    } finally {
      setIsEvaluatingAnswer(false);
    }
  };

  const handleAdvanceToNextQuestion = () => {
    if (finalReport) {
      setIsAssessmentFinished(true);
      onCompleteAssessment({
        strongConcepts: finalReport.masteredConcepts || [],
        weakConcepts: finalReport.strugglingConcepts || [],
        misconceptions: (finalReport.confirmedMisconceptions || []).map((cm: any) => ({
          id: cm.id,
          name: cm.name,
          topic: cm.topic,
          evidence: cm.evidence?.[0] || 'Identified via adaptive assessment',
          repeatedErrors: cm.count || 2,
          confidence: cm.confidence || 85,
          correctiveExplanation: cm.correctiveExplanation || 'Targeted remediation required',
          status: 'active'
        })),
        confidence: finalReport.confidenceScore || bayesianCertainty,
      });
      return;
    }

    if (nextQueuedQuestion) {
      setActiveQuestion(nextQueuedQuestion);
      setCurrentDifficulty(pedagogicalDecision?.next_difficulty || 'medium');
      setCurrentStage(pedagogicalDecision?.next_stage || 'medium');
      setSelectedOptionId(null);
      setHasSubmittedAnswer(false);
      setLastEvaluatedAnswer(null);
      setPedagogicalDecision(null);
      setNextQueuedQuestion(null);
    }
  };

  const restartAssessment = () => {
    if (selectedSubject) {
      startFreshAdaptiveSession(selectedSubject.id);
    }
  };

  const formatStageLabel = (st: string) => {
    switch (st) {
      case 'easy':
        return 'Stage 1: Foundational Baseline';
      case 'medium':
        return 'Stage 2: Applied Reasoning';
      case 'difficult':
      case 'hard':
        return 'Stage 3: Deep Mastery Challenge';
      case 'remediation':
        return 'Targeted Remediation Probe';
      case 'prerequisite':
        return 'Prerequisite Investigation';
      default:
        return 'Adaptive Stage';
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto animate-fadeIn">
      {/* Assessment Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Adaptive Diagnostic Arena</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              DYNAMIC SYLLABUS ENGINE
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Questions adapt in real-time based on your answers. Unstudied topics are never penalized as zero.
          </p>
        </div>

        {/* Live Bayesian Telemetry HUD */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-cyan-500/30 text-xs">
          <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
          <div className="text-slate-300">
            <span>Bayesian Certainty: </span>
            <span className="font-mono font-bold text-emerald-400">{bayesianCertainty}%</span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-slate-300 font-mono">
            <span>Q: </span>
            <span className="text-cyan-400 font-bold">{totalAnswered}/8 max</span>
          </div>
        </div>
      </div>

      {/* Subject Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mr-2">
          Subject:
        </span>
        {subjects.map((sub) => (
          <button
            key={sub.id}
            onClick={() => setSelectedSubject(sub)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              selectedSubject?.id === sub.id
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: sub.color || '#38bdf8' }}
            />
            <span>{sub.name}</span>
            <span className="text-[10px] opacity-80 font-mono">({sub.code})</span>
          </button>
        ))}
      </div>

      {/* In-Flight Session Resume Notification */}
      {hasResumeSession && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-cyan-400 animate-spin" />
            <div>
              <div className="font-bold text-white text-xs">
                In-Progress Adaptive Assessment Detected
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                You have an active session for <strong>{selectedSubject?.name}</strong> with {totalAnswered} questions answered.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResumeSession}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.3)]"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume Session</span>
            </button>
            <button
              onClick={() => startFreshAdaptiveSession(selectedSubject!.id)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isInitializingSession ? (
        <GlassCard glowColor="cyan" className="p-12 text-center space-y-4">
          <Sparkles className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <div className="text-sm font-bold text-white">
            Synthesizing Adaptive Diagnostic for {selectedSubject?.name}...
          </div>
          <p className="text-xs text-slate-400">
            Consulting confirmed syllabus topics and formulating initial Stage 1 question via Gemini...
          </p>
        </GlassCard>
      ) : !isAssessmentFinished && activeQuestion ? (
        /* Active Adaptive Question Card */
        <div className="space-y-6 animate-fadeIn">
          {/* Header Metadata Bar: Stage + Difficulty + Topic */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wide">
                {activeQuestion.conceptTested || selectedSubject?.name}
              </span>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider border font-bold ${
                  currentDifficulty === 'hard'
                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                    : currentDifficulty === 'medium'
                    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                }`}
              >
                {currentDifficulty} Difficulty
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {formatStageLabel(currentStage)}
              </span>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Question {totalAnswered + 1} (Min 5 • Max 8)
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(12, ((totalAnswered + 1) / 8) * 100))}%` }}
            />
          </div>

          {/* Question Box */}
          <GlassCard glowColor="cyan" className="p-8 space-y-6">
            {/* Model Generation Provenance Banner */}
            {activeQuestion.is_fallback ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-center gap-3 text-amber-300 text-xs font-medium">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                <div>
                  <span className="font-bold text-amber-200">Heuristic Offline Fallback: </span>
                  {activeQuestion.fallback_notice || 'Live Gemini AI was temporarily unreachable. This question was generated using offline heuristics, not live syllabus analysis.'}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-400/80 bg-cyan-950/30 px-3 py-1.5 rounded-lg border border-cyan-500/20 w-fit">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Live Gemini Syllabus Analysis ({activeQuestion.model_used || 'gemini-3.5-flash'})</span>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white leading-relaxed whitespace-pre-line font-sans">
                {activeQuestion.questionText}
              </h3>
            </div>

            {/* Shuffled Options (A, B, C, D) */}
            <div className="space-y-3">
              {activeQuestion.options.map((opt: any) => {
                const isSelected = selectedOptionId === opt.id;
                let optionStyle =
                  'border-slate-800 bg-slate-900/50 hover:border-slate-700 text-slate-200';

                if (isSelected && !hasSubmittedAnswer) {
                  optionStyle =
                    'border-cyan-400 bg-cyan-950/40 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]';
                } else if (hasSubmittedAnswer) {
                  if (opt.isCorrect) {
                    optionStyle =
                      'border-emerald-500 bg-emerald-950/40 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                  } else if (isSelected && !opt.isCorrect) {
                    optionStyle =
                      'border-rose-500 bg-rose-950/40 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
                  } else {
                    optionStyle =
                      'border-slate-800 bg-slate-950/40 text-slate-500 opacity-50';
                  }
                }

                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelectOption(opt.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-xs ${optionStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center font-mono font-bold text-slate-300">
                        {opt.letter || '•'}
                      </div>
                      <span className="font-medium text-sm font-sans">{opt.text}</span>
                    </div>

                    {hasSubmittedAnswer && opt.isCorrect && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    )}
                    {hasSubmittedAnswer && isSelected && !opt.isCorrect && (
                      <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Immediate Pedagogical Feedback & AI Reasoning HUD */}
            {hasSubmittedAnswer && lastEvaluatedAnswer && (
              <div className="space-y-3 pt-2 animate-fadeIn">
                {/* Result Pill */}
                <div
                  className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                    lastEvaluatedAnswer.is_correct
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    {lastEvaluatedAnswer.is_correct ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Correct Answer</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>
                          Cognitive Trap Detected:{' '}
                          <strong className="text-white">
                            {lastEvaluatedAnswer.diagnosed_misconception || 'Conceptual Trap'}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {lastEvaluatedAnswer.explanation}
                  </p>
                </div>

                {/* AI Controller Reasoning Drawer */}
                {pedagogicalDecision && (
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-xs space-y-1">
                    <div className="flex items-center gap-2 font-mono font-bold text-cyan-400 text-[11px] uppercase">
                      <Brain className="w-3.5 h-3.5" />
                      <span>AI Adaptive Controller Decision</span>
                    </div>
                    <p className="text-[11px] text-slate-300 italic">
                      "{pedagogicalDecision.reasoning}"
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-xs text-slate-500 font-mono">
                {hasSubmittedAnswer
                  ? 'Adaptive step calculated'
                  : 'Select an option to evaluate'}
              </span>

              {!hasSubmittedAnswer ? (
                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  disabled={!selectedOptionId || isEvaluatingAnswer}
                  className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer"
                >
                  {isEvaluatingAnswer ? 'Evaluating...' : 'Submit Answer'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAdvanceToNextQuestion}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] cursor-pointer"
                >
                  <span>
                    {finalReport
                      ? 'View Diagnostic Cognitive Report'
                      : 'Next Adaptive Question'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      ) : (
        /* Concluding Cognitive Diagnostic Report Card */
        <GlassCard glowColor="cyan" className="p-8 space-y-8 animate-fadeIn">
          <div className="text-center space-y-3 pb-6 border-b border-slate-800">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(0,240,255,0.2)]">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white">Diagnostic Cognitive Report</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Adaptive assessment concluded for <strong className="text-white">{selectedSubject?.name}</strong>.
              Your cognitive fingerprint and learning gaps have been isolated for personalized AI tutoring.
            </p>
          </div>

          {/* Core Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Bayesian Posterior Mastery</div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                {finalReport?.masteryScore || Math.round(posteriorMean * 100)}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Beta(α={alpha.toFixed(1)}, β={beta.toFixed(1)})
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Diagnostic Certainty</div>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                {finalReport?.confidenceScore || bayesianCertainty}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {finalReport?.isConclusive ? 'Conclusive Evidence' : 'Developing Baseline'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Mastery Classification</div>
              <div
                className={`text-2xl font-mono font-bold mt-1 ${
                  (finalReport?.masteryScore || 50) >= 75
                    ? 'text-emerald-400'
                    : (finalReport?.masteryScore || 50) >= 50
                    ? 'text-cyan-400'
                    : 'text-amber-400'
                }`}
              >
                {finalReport?.statusLabel || 'Developing'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {totalAnswered} Questions Evaluated
              </div>
            </div>
          </div>

          {/* Confirmed Cognitive Traps */}
          {finalReport?.confirmedMisconceptions && finalReport.confirmedMisconceptions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Isolated Misconception Fingerprints ({finalReport.confirmedMisconceptions.length})</span>
              </h4>

              <div className="space-y-3">
                {finalReport.confirmedMisconceptions.map((mis: any) => (
                  <div
                    key={mis.id}
                    className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-200">
                      <span>{mis.name}</span>
                      <span className="text-amber-400 font-mono">{mis.confidence}% confidence</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {mis.evidence?.[0] || 'Confirmed through targeted adaptive questioning.'}
                    </p>
                    <div className="p-2.5 rounded-xl bg-slate-900/80 text-cyan-200 text-[11px] border border-cyan-500/20">
                      <span className="font-bold text-cyan-400">Targeted Remediation: </span>
                      {mis.correctiveExplanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prioritized Learning Roadmap */}
          {finalReport?.prioritizedRevisionPlan && finalReport.prioritizedRevisionPlan.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <Compass className="w-4 h-4" />
                <span>Personalized Learning Order & Remediation Plan</span>
              </h4>

              <div className="space-y-2">
                {finalReport.prioritizedRevisionPlan.map((plan: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-mono">
                          {idx + 1}
                        </span>
                        <span>{plan.concept}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{plan.reason}</div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded bg-slate-800 text-cyan-300 font-mono flex-shrink-0">
                      {plan.recommendedAction}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Tutor Handoff Brief */}
          {finalReport?.aiTutorBrief && (
            <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-cyan-400 flex items-center gap-1.5 text-[11px] uppercase font-mono">
                <Brain className="w-3.5 h-3.5" />
                <span>Holographic AI Tutor Briefing</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed italic">
                "{finalReport.aiTutorBrief}"
              </p>
            </div>
          )}

          {/* Action Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-800">
            <button
              onClick={restartAssessment}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retake Diagnostic Assessment</span>
            </button>

            <button
              onClick={onNavigateToTutor}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Launch AI Tutor Targeting Isolated Gaps</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
