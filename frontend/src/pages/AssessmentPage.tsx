import React, { useState, useEffect } from 'react';
import { DiagnosticQuestion, Subject, Misconception } from '../types';
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
  Layers
} from 'lucide-react';
import { apiGetDiagnosticQuestions } from '../services/api';

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
}

export const AssessmentPage: React.FC<AssessmentPageProps> = ({
  subjects,
  onCompleteAssessment,
  onNavigateToTutor,
  sessionToken = '',
}) => {
  const [selectedSubject, setSelectedSubject] = useState<Subject>(subjects[0] || null);
  const [questionPool, setQuestionPool] = useState<DiagnosticQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [isAssessmentFinished, setIsAssessmentFinished] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Baseline vs Grounded status metadata
  const [isBaseline, setIsBaseline] = useState(false);
  const [evaluatedTopics, setEvaluatedTopics] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Bayesian Beta parameters tracking: Beta(alpha, beta)
  const [alpha, setAlpha] = useState(1.0);
  const [beta, setBeta] = useState(1.0);
  const [detectedMisconceptions, setDetectedMisconceptions] = useState<Misconception[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<
    { questionId: string; optionId: string; isCorrect: boolean; misconceptionId?: string }[]
  >([]);

  const token =
    sessionToken ||
    sessionStorage.getItem('learnmind_session_token') ||
    localStorage.getItem('learnmind_session_token') ||
    '';

  // Load questions whenever selected subject changes
  useEffect(() => {
    if (!selectedSubject) return;

    let isMounted = true;
    setIsLoadingQuestions(true);
    setCurrentQuestionIdx(0);
    setSelectedOptionId(null);
    setHasSubmittedAnswer(false);
    setIsAssessmentFinished(false);
    setAlpha(1.0);
    setBeta(1.0);
    setDetectedMisconceptions([]);
    setStudentAnswers([]);

    apiGetDiagnosticQuestions(token, selectedSubject.id)
      .then((res) => {
        if (!isMounted) return;
        const data = res.data;
        setIsBaseline(Boolean(data?.isBaseline));
        setEvaluatedTopics(data?.evaluatedTopics || []);
        setStatusMessage(data?.statusMessage || '');

        if (data?.questions && data.questions.length > 0) {
          setQuestionPool(data.questions);
        } else {
          // Fallback to minimal questions
          setQuestionPool([
            {
              id: 'q_default_1',
              subjectId: selectedSubject.id,
              topicId: 'top_def_1',
              conceptId: 'c_def_1',
              questionText: `What is the foundational approach to mastering ${selectedSubject.name}?`,
              difficulty: 'easy',
              options: [
                {
                  id: 'opt_def_1',
                  text: 'Break down complex mechanisms into modular, testable components.',
                  isCorrect: true,
                  explanation: 'Systematic modularity is the key to deep mastery.'
                },
                {
                  id: 'opt_def_2',
                  text: 'Memorize code or formulas without testing understanding.',
                  isCorrect: false,
                  misconceptionName: 'Rote Memorization Trap',
                  explanation: 'Memorization fails when problem scenarios change.'
                }
              ]
            }
          ]);
        }
        setIsLoadingQuestions(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoadingQuestions(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubject, token]);

  const currentQ = questionPool[currentQuestionIdx];

  // Calculate posterior statistics
  const posteriorMean = alpha / (alpha + beta);
  const posteriorVariance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const bayesianCertainty = Math.max(0, Math.min(100, Math.round((1 - posteriorVariance * 10) * 100)));

  const handleSelectOption = (optionId: string) => {
    if (hasSubmittedAnswer) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOptionId || hasSubmittedAnswer || !currentQ) return;

    const chosenOption = currentQ.options.find((opt) => opt.id === selectedOptionId)!;
    setHasSubmittedAnswer(true);

    if (chosenOption.isCorrect) {
      setAlpha((prev) => prev + 1.5);
    } else {
      setBeta((prev) => prev + 1.5);

      if (chosenOption.misconceptionName || chosenOption.misconceptionId) {
        const misId = chosenOption.misconceptionId || `MIS_${currentQ.topicId || 'GEN'}`;
        const existingMis = detectedMisconceptions.find((m) => m.id === misId);

        if (existingMis) {
          setDetectedMisconceptions((prev) =>
            prev.map((m) =>
              m.id === misId
                ? {
                    ...m,
                    repeatedErrors: m.repeatedErrors + 1,
                    confidence: Math.min(98, m.confidence + 12),
                  }
                : m
            )
          );
        } else {
          setDetectedMisconceptions((prev) => [
            ...prev,
            {
              id: misId,
              name: chosenOption.misconceptionName || 'Conceptual Trap',
              topic: (currentQ as any).topicName || selectedSubject?.name || 'Curriculum',
              evidence: `In "${currentQ.questionText}": Selected "${chosenOption.text}". ${chosenOption.explanation}`,
              repeatedErrors: 1,
              confidence: 76,
              correctiveExplanation: chosenOption.explanation || 'Review core definitions and execution semantics.',
              status: 'active',
            },
          ]);
        }
      }
    }

    setStudentAnswers((prev) => [
      ...prev,
      {
        questionId: currentQ.id,
        optionId: chosenOption.id,
        isCorrect: chosenOption.isCorrect,
        misconceptionId: chosenOption.misconceptionId,
      },
    ]);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIdx < questionPool.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setSelectedOptionId(null);
      setHasSubmittedAnswer(false);
    } else {
      setIsAssessmentFinished(true);
      onCompleteAssessment({
        strongConcepts: isBaseline ? ['Foundational Logic & Aptitude'] : evaluatedTopics,
        weakConcepts: detectedMisconceptions.map((m) => m.name),
        misconceptions: detectedMisconceptions,
        confidence: bayesianCertainty,
      });
    }
  };

  const restartAssessment = () => {
    setCurrentQuestionIdx(0);
    setSelectedOptionId(null);
    setHasSubmittedAnswer(false);
    setIsAssessmentFinished(false);
    setAlpha(1.0);
    setBeta(1.0);
    setDetectedMisconceptions([]);
    setStudentAnswers([]);
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto animate-fadeIn">
      {/* Assessment Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Adaptive Diagnostic Arena</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              ALL SUBJECTS • SYLLABUS GROUNDED
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Questions are strictly grounded in your syllabus and verified study coverage. Unstudied topics are never penalized as zero.
          </p>
        </div>

        {/* Live Telemetry Pill */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-cyan-500/30 text-xs">
          <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
          <div className="text-slate-300">
            <span>Certainty: </span>
            <span className="font-mono font-bold text-emerald-400">{bayesianCertainty}%</span>
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
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

      {/* Mode Notice: Baseline vs Grounded */}
      {isBaseline ? (
        <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 text-xs text-cyan-200 flex items-start gap-3 animate-fadeIn">
          <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              <span>Foundational Baseline Aptitude Check</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                ZERO PENALTY
              </span>
            </div>
            <div className="text-[11px] text-cyan-300/90 mt-1 leading-relaxed">
              You haven't marked any topics as completed yet in <strong>{selectedSubject?.name}</strong>.
              This diagnostic measures core logical reasoning and beginner aptitude.{' '}
              <strong className="text-emerald-300 underline underline-offset-2">
                This is NOT scored as a zero failure.
              </strong>{' '}
              It establishes your starting point so the AI Tutor can guide you step by step!
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-white">Curriculum-Grounded Assessment</div>
            <div className="text-[11px] text-emerald-300/90 mt-1 leading-relaxed">
              Evaluating your grasp on covered topics:{' '}
              <strong className="text-white">{evaluatedTopics.join(', ')}</strong>. Unstudied topics are never penalized.
            </div>
          </div>
        </div>
      )}

      {isLoadingQuestions ? (
        <GlassCard glowColor="cyan" className="p-12 text-center space-y-4">
          <Sparkles className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <div className="text-sm font-bold text-white">Synthesizing Tailored Diagnostic Assessment...</div>
          <p className="text-xs text-slate-400">
            Consulting curriculum nodes for {selectedSubject?.name}...
          </p>
        </GlassCard>
      ) : !isAssessmentFinished && currentQ ? (
        /* Active Question Display */
        <div className="space-y-6 animate-fadeIn">
          {/* Progress Bar */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">
              Question {currentQuestionIdx + 1} of {questionPool.length}
            </span>
            <span className="font-mono text-cyan-400 uppercase tracking-wider">
              {(currentQ as any).topicName || selectedSubject?.name} • Difficulty: {currentQ.difficulty}
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-cyan-400 h-full transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(0,240,255,0.5)]"
              style={{
                width: `${((currentQuestionIdx + 1) / questionPool.length) * 100}%`,
              }}
            />
          </div>

          {/* Question Card */}
          <GlassCard glowColor="cyan" className="p-8 space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white leading-relaxed">
                {currentQ.questionText}
              </h3>

              {currentQ.latex && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 text-center font-mono text-cyan-300 text-sm overflow-x-auto">
                  {currentQ.latex}
                </div>
              )}
            </div>

            {/* Options */}
            <div className="space-y-3">
              {currentQ.options.map((opt, optIdx) => {
                const isSelected = selectedOptionId === opt.id;
                let optionStyle = 'border-slate-800 bg-slate-900/50 hover:border-slate-700 text-slate-200';

                if (isSelected && !hasSubmittedAnswer) {
                  optionStyle = 'border-cyan-400 bg-cyan-950/40 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]';
                } else if (hasSubmittedAnswer) {
                  if (opt.isCorrect) {
                    optionStyle = 'border-emerald-500 bg-emerald-950/40 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                  } else if (isSelected && !opt.isCorrect) {
                    optionStyle = 'border-rose-500 bg-rose-950/40 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]';
                  } else {
                    optionStyle = 'border-slate-800 bg-slate-950/40 text-slate-500 opacity-60';
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
                        {String.fromCharCode(65 + optIdx)}
                      </div>
                      <span className="font-medium text-sm">{opt.text}</span>
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

            {/* Explanation & Misconception Fingerprint Display */}
            {hasSubmittedAnswer && (
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 animate-fadeIn">
                {(() => {
                  const chosen = currentQ.options.find((o) => o.id === selectedOptionId);
                  if (!chosen) return null;
                  return (
                    <>
                      <div className="text-xs font-bold">
                        {chosen.isCorrect ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            Correct Answer
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            Diagnostic Insight: {chosen.misconceptionName || 'Conceptual Slip'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{chosen.explanation}</p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Submit / Next Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-xs text-slate-500 font-mono">
                {hasSubmittedAnswer ? 'Evaluation updated' : 'Select an option to proceed'}
              </span>

              {!hasSubmittedAnswer ? (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedOptionId}
                  className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                >
                  Submit Answer
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)]"
                >
                  <span>
                    {currentQuestionIdx < questionPool.length - 1
                      ? 'Next Adaptive Question'
                      : 'View Cognitive Report'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      ) : (
        /* Diagnostic Assessment Report Card */
        <GlassCard glowColor="cyan" className="p-8 space-y-8 animate-fadeIn">
          <div className="text-center space-y-3 pb-6 border-b border-slate-800">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(0,240,255,0.2)]">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white">Diagnostic Cognitive Report</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              {isBaseline
                ? `Foundational baseline established for ${selectedSubject?.name}. Your starting aptitude has been calibrated without failure penalty.`
                : `Empirical assessment completed for ${selectedSubject?.name}. Misconception fingerprints have been isolated for targeted remediation.`}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">
                {isBaseline ? 'Foundational Readiness' : 'Bayesian Posterior Mastery'}
              </div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                {(posteriorMean * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {isBaseline ? 'Beginner Baseline Active' : `Beta(α=${alpha.toFixed(1)}, β=${beta.toFixed(1)})`}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Diagnostic Confidence</div>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                {bayesianCertainty}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Variance σ² = {posteriorVariance.toFixed(4)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">
                {isBaseline ? 'Readiness Status' : 'Misconceptions Isolated'}
              </div>
              <div className={`text-2xl font-mono font-bold mt-1 ${isBaseline ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isBaseline ? 'Ready for Unit 1' : detectedMisconceptions.length}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {isBaseline ? 'No previous topics needed' : 'Actionable guidance prepared'}
              </div>
            </div>
          </div>

          {/* Detected Misconceptions Breakdown */}
          {detectedMisconceptions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Isolated Misconception Fingerprints</span>
              </h4>

              <div className="space-y-3">
                {detectedMisconceptions.map((mis) => (
                  <div
                    key={mis.id}
                    className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-200">
                      <span>{mis.name}</span>
                      <span className="text-amber-400 font-mono">{mis.confidence}% confidence</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{mis.evidence}</p>
                    <div className="p-2.5 rounded-xl bg-slate-900/80 text-cyan-200 text-[11px] border border-cyan-500/20">
                      <span className="font-bold text-cyan-400">Recommended Guidance: </span>
                      {mis.correctiveExplanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-800">
            <button
              onClick={restartAssessment}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retake Diagnostic Assessment</span>
            </button>

            <button
              onClick={onNavigateToTutor}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)]"
            >
              <span>Launch Holographic AI Tutor for {selectedSubject?.name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassCard>
      )}
    </div>
  );
};
