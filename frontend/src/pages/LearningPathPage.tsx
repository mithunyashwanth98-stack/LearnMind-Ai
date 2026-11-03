import React, { useState } from 'react';
import { LearningPathStep, Subject } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  GitBranch,
  CheckCircle2,
  Lock,
  Play,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  BookOpen
} from 'lucide-react';

interface LearningPathPageProps {
  steps: LearningPathStep[];
  onStartStep: (step: LearningPathStep) => void;
  onCompleteStep: (stepId: string) => void;
}

export const LearningPathPage: React.FC<LearningPathPageProps> = ({
  steps: initialSteps,
  onStartStep,
  onCompleteStep,
}) => {
  const [steps, setSteps] = useState<LearningPathStep[]>(initialSteps);
  const [activeStepId, setActiveStepId] = useState<string>(initialSteps[0]?.id || 'lp_1');

  const handleStepComplete = (stepId: string) => {
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (s.id === stepId) {
          return { ...s, completed: true, status: 'completed', currentMastery: 100 };
        }
        // Unlock next step if previous is completed
        if (idx > 0 && prev[idx - 1].id === stepId) {
          return { ...s, status: 'ready' };
        }
        return s;
      })
    );
    onCompleteStep(stepId);
  };

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            Beginner
          </span>
        );
      case 'Intermediate':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-300 border border-sky-500/30">
            Intermediate
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            Advanced
          </span>
        );
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Prerequisite-Directed Learning Roadmap</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              NETWORKX TOPOLOGICAL SORT
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Concept dependencies sequenced mathematically to resolve root misconceptions before
            advancing.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700">
            Completed:{' '}
            <strong className="text-cyan-400">
              {steps.filter((s) => s.completed).length} / {steps.length}
            </strong>
          </span>
        </div>
      </div>

      {/* Interactive Milestones Timeline */}
      <div className="space-y-4">
        {steps.map((step, idx) => {
          const isCompleted = step.completed;
          const isLocked = step.status === 'locked';
          const isReady = step.status === 'ready' && !isCompleted;

          return (
            <div
              key={step.id}
              className={`p-6 rounded-3xl glass-panel border transition-all duration-300 ${
                isCompleted
                  ? 'border-emerald-500/30 bg-emerald-950/10'
                  : isReady
                  ? 'border-cyan-400/60 bg-cyan-950/30 shadow-[0_0_30px_rgba(0,240,255,0.1)]'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-60'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  {/* Sequence Number / Status Icon */}
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                      isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : isReady
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                        : 'bg-slate-900 text-slate-500 border-slate-800'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : isLocked ? (
                      <Lock className="w-5 h-5" />
                    ) : (
                      <span>#{idx + 1}</span>
                    )}
                  </div>

                  {/* Step Information */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                        {step.subjectName}
                      </span>
                      <span className="text-slate-600">•</span>
                      <h3 className="text-base sm:text-lg font-bold text-white">
                        {step.topicName}
                      </h3>
                      {getDifficultyBadge(step.difficulty)}
                    </div>

                    <div className="text-xs text-amber-300/90 flex items-center gap-1.5 pt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        <strong>Why recommended:</strong> {step.whyRecommended}
                      </span>
                    </div>

                    {/* Prerequisite Tags */}
                    {step.prerequisites && step.prerequisites.length > 0 && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1 flex-wrap">
                        <span className="text-slate-500 font-mono">Prerequisites:</span>
                        {step.prerequisites.map((p, pIdx) => (
                          <span
                            key={pIdx}
                            className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono text-[10px]"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Estimated Time, Current Mastery, and Action */}
                <div className="flex items-center gap-6 self-end lg:self-center shrink-0">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{step.estimatedMinutes} mins</span>
                    </div>
                    <div className="text-xs font-mono text-cyan-300 mt-1">
                      Current: {step.currentMastery}%
                    </div>
                  </div>

                  {isCompleted ? (
                    <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold font-mono">
                      Completed
                    </span>
                  ) : isLocked ? (
                    <span className="px-4 py-2 rounded-xl bg-slate-900 text-slate-500 border border-slate-800 text-xs font-mono flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStepComplete(step.id)}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                      >
                        Mark Completed
                      </button>
                      <button
                        onClick={() => onStartStep(step)}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Launch Study Session</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

