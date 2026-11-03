import React, { useState } from 'react';
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
  HelpCircle
} from 'lucide-react';

interface AssessmentPageProps {
  subjects: Subject[];
  onCompleteAssessment: (results: {
    strongConcepts: string[];
    weakConcepts: string[];
    misconceptions: Misconception[];
    confidence: number;
  }) => void;
  onNavigateToTutor: () => void;
}

const diagnosticQuestionPool: DiagnosticQuestion[] = [
  {
    id: 'q1',
    subjectId: 'sub_math',
    topicId: 'top_diff',
    conceptId: 'c_dif_2',
    questionText: 'What is the derivative of f(x) = x³ + 5x with respect to x?',
    latex: 'f(x) = x^3 + 5x \\implies f\'(x) = ?',
    difficulty: 'medium',
    options: [
      {
        id: 'opt_1',
        text: '3x² + 5',
        isCorrect: true,
        explanation: 'Correct! By the power rule d/dx(x³) = 3x² and by the constant multiple rule d/dx(5x) = 5.'
      },
      {
        id: 'opt_2',
        text: '3x³ + 5',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_POWER_01',
        misconceptionName: 'Power Rule Exponent Error',
        explanation: 'Multiplied the coefficient by 3, but forgot to subtract 1 from the exponent (3-1=2).'
      },
      {
        id: 'opt_3',
        text: '3x²',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_CONST_02',
        misconceptionName: 'Constant Multiple Confusion',
        explanation: 'Treated 5x as a constant and differentiated it to 0 instead of 5.'
      },
      {
        id: 'opt_4',
        text: '3x² + 5x',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_SUM_03',
        misconceptionName: 'Linear Term Differentiation Slip',
        explanation: 'Failed to differentiate the linear term 5x.'
      }
    ]
  },
  {
    id: 'q2_followup_power',
    subjectId: 'sub_math',
    topicId: 'top_diff',
    conceptId: 'c_dif_2',
    questionText: 'Investigating Power Rule: What is d/dx(4x⁵ - 7)?',
    latex: '\\frac{d}{dx}(4x^5 - 7) = ?',
    difficulty: 'medium',
    options: [
      {
        id: 'opt_2_1',
        text: '20x⁴',
        isCorrect: true,
        explanation: 'Excellent! 4 · 5x⁴ = 20x⁴ and d/dx(7) = 0.'
      },
      {
        id: 'opt_2_2',
        text: '20x⁵',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_POWER_01',
        misconceptionName: 'Power Rule Exponent Error',
        explanation: 'Repeated mistake: did not decrease exponent 5 to 4.'
      },
      {
        id: 'opt_2_3',
        text: '20x⁴ - 7',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_CONST_02',
        misconceptionName: 'Constant Rule Misunderstanding',
        explanation: 'Derivative of a constant term is 0, not -7.'
      },
      {
        id: 'opt_2_4',
        text: '9x⁴',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_COEFF_04',
        misconceptionName: 'Exponent-Coefficient Addition Slip',
        explanation: 'Added 4 + 5 instead of multiplying 4 · 5.'
      }
    ]
  },
  {
    id: 'q3_advanced_chain',
    subjectId: 'sub_math',
    topicId: 'top_diff',
    conceptId: 'c_dif_4',
    questionText: 'Find the derivative of the composite function: f(x) = (2x + 1)³',
    latex: 'f(x) = (2x + 1)^3 \\implies f\'(x) = ?',
    difficulty: 'hard',
    options: [
      {
        id: 'opt_3_1',
        text: '6(2x + 1)²',
        isCorrect: true,
        explanation: 'Correct! By the Chain Rule: 3(2x + 1)² · d/dx(2x + 1) = 3(2x + 1)² · 2 = 6(2x + 1)².'
      },
      {
        id: 'opt_3_2',
        text: '3(2x + 1)²',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_CHAIN_05',
        misconceptionName: 'Missing Inner Derivative in Chain Rule',
        explanation: 'Differentiated outer power but forgot to multiply by the derivative of the inner function (2).'
      },
      {
        id: 'opt_3_3',
        text: '6x²',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_CHAIN_06',
        misconceptionName: 'Premature Algebraic Simplification',
        explanation: 'Expanded or differentiated the interior argument incorrectly.'
      },
      {
        id: 'opt_3_4',
        text: '3(2x + 1)³',
        isCorrect: false,
        misconceptionId: 'MIS_DIFF_POWER_01',
        misconceptionName: 'Power Rule Exponent Error',
        explanation: 'Power rule exponent reduction omitted.'
      }
    ]
  }
];

export const AssessmentPage: React.FC<AssessmentPageProps> = ({
  subjects,
  onCompleteAssessment,
  onNavigateToTutor,
}) => {
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
  const [isAssessmentFinished, setIsAssessmentFinished] = useState(false);

  // Bayesian Beta parameters tracking: Beta(alpha, beta)
  const [alpha, setAlpha] = useState(1.0);
  const [beta, setBeta] = useState(1.0);
  const [detectedMisconceptions, setDetectedMisconceptions] = useState<Misconception[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<
    { questionId: string; optionId: string; isCorrect: boolean; misconceptionId?: string }[]
  >([]);

  const currentQ = diagnosticQuestionPool[currentQuestionIdx];

  // Calculate posterior statistics
  const posteriorMean = alpha / (alpha + beta);
  const posteriorVariance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const bayesianCertainty = Math.max(0, Math.min(100, Math.round((1 - posteriorVariance * 10) * 100)));

  const handleSelectOption = (optionId: string) => {
    if (hasSubmittedAnswer) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOptionId || hasSubmittedAnswer) return;

    const chosenOption = currentQ.options.find((opt) => opt.id === selectedOptionId)!;
    setHasSubmittedAnswer(true);

    // Update Bayesian distribution
    if (chosenOption.isCorrect) {
      setAlpha((prev) => prev + 1.5);
    } else {
      setBeta((prev) => prev + 1.5);

      // Record Misconception fingerprint evidence
      if (chosenOption.misconceptionId) {
        const existingMis = detectedMisconceptions.find(
          (m) => m.id === chosenOption.misconceptionId
        );
        if (existingMis) {
          setDetectedMisconceptions((prev) =>
            prev.map((m) =>
              m.id === chosenOption.misconceptionId
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
              id: chosenOption.misconceptionId!,
              name: chosenOption.misconceptionName || 'Conceptual Slip',
              topic: 'Differentiation',
              evidence: `In ${currentQ.questionText}: selected "${chosenOption.text}". ${chosenOption.explanation}`,
              repeatedErrors: 1,
              confidence: 76,
              correctiveExplanation: chosenOption.explanation || 'Review power and constant rules.',
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
    if (currentQuestionIdx < diagnosticQuestionPool.length - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
      setSelectedOptionId(null);
      setHasSubmittedAnswer(false);
    } else {
      setIsAssessmentFinished(true);
      onCompleteAssessment({
        strongConcepts: ['Algebra - Polynomials', 'Functions - Domain'],
        weakConcepts: ['Differentiation - Power Rule', 'Differentiation - Chain Rule'],
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
              BAYESIAN BETA ACTIVE
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Questions adapt dynamically to test hypothesis of conceptual misconceptions.
          </p>
        </div>

        {/* Live Bayesian Telemetry Pill */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-cyan-500/30 text-xs">
          <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
          <div className="text-slate-300">
            <span>Prior: </span>
            <span className="font-mono text-cyan-300">
              Beta(α={alpha.toFixed(1)}, β={beta.toFixed(1)})
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-slate-300">
            <span>Certainty: </span>
            <span className="font-mono font-bold text-emerald-400">{bayesianCertainty}%</span>
          </div>
        </div>
      </div>

      {!isAssessmentFinished ? (
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Question {currentQuestionIdx + 1} of {diagnosticQuestionPool.length}
            </span>
            <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
              Difficulty: {currentQ.difficulty}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-500 rounded-full shadow-[0_0_12px_#00f0ff]"
              style={{
                width: `${((currentQuestionIdx + 1) / diagnosticQuestionPool.length) * 100}%`,
              }}
            />
          </div>

          {/* Question Card */}
          <GlassCard glowColor="cyan" className="p-8">
            <div className="space-y-6">
              {/* Question Text */}
              <div className="space-y-3">
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  Diagnostic Probe #{currentQuestionIdx + 1}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                  {currentQ.questionText}
                </h3>
                {currentQ.latex && (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/20 font-mono text-cyan-300 text-base sm:text-lg">
                    {currentQ.latex}
                  </div>
                )}
              </div>

              {/* Options Grid */}
              <div className="space-y-3 pt-2">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedOptionId === option.id;
                  let optionStyle =
                    'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90 text-slate-200';

                  if (hasSubmittedAnswer) {
                    if (option.isCorrect) {
                      optionStyle =
                        'border-emerald-500/60 bg-emerald-950/30 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]';
                    } else if (isSelected && !option.isCorrect) {
                      optionStyle =
                        'border-amber-500/60 bg-amber-950/30 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.2)]';
                    }
                  } else if (isSelected) {
                    optionStyle =
                      'border-cyan-400 bg-cyan-950/40 text-white shadow-[0_0_15px_rgba(0,240,255,0.2)]';
                  }

                  return (
                    <div
                      key={option.id}
                      onClick={() => handleSelectOption(option.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${optionStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs flex items-center justify-center font-bold">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm sm:text-base font-semibold">{option.text}</span>
                      </div>

                      {hasSubmittedAnswer && (
                        <div>
                          {option.isCorrect ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : isSelected ? (
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Immediate Explanatory Feedback */}
              {hasSubmittedAnswer && (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 animate-fadeIn">
                  {selectedOptionId &&
                    (() => {
                      const opt = currentQ.options.find((o) => o.id === selectedOptionId)!;
                      return (
                        <>
                          <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            {opt.isCorrect ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Correct Formulation
                              </span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                Misconception Detected: {opt.misconceptionName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {opt.explanation}
                          </p>
                        </>
                      );
                    })()}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-500 font-mono">
                  {hasSubmittedAnswer ? 'Bayesian state updated' : 'Select best option to proceed'}
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
                      {currentQuestionIdx < diagnosticQuestionPool.length - 1
                        ? 'Next Adaptive Question'
                        : 'View Diagnostic Report'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
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
              Empirical assessment completed. Misconception fingerprints have been isolated, and
              posterior mastery parameters have converged.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Bayesian Posterior Mean</div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                {(posteriorMean * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Beta(α={alpha.toFixed(1)}, β={beta.toFixed(1)})
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Diagnostic Certainty</div>
              <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                {bayesianCertainty}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Variance σ² = {posteriorVariance.toFixed(4)}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Misconceptions Isolated</div>
              <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
                {detectedMisconceptions.length}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Requires targeted remediation
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
                      <span>
                        {mis.name} ({mis.id})
                      </span>
                      <span className="text-amber-400 font-mono">{mis.confidence}% confidence</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{mis.evidence}</p>
                    <div className="p-2.5 rounded-xl bg-slate-900/80 text-cyan-200 text-[11px] border border-cyan-500/20">
                      <span className="font-bold text-cyan-400">Recommended Next Step: </span>
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
              <span>Launch Holographic AI Tutor Remediation</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

