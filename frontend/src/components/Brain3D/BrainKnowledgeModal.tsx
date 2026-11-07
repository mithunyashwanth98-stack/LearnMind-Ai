import React, { useState } from 'react';
import { Subject, Topic, Concept, Misconception } from '../../types';
import {
  X,
  Brain,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Compass,
  ArrowRight,
  Sparkles,
  BookOpen
} from 'lucide-react';

interface BrainKnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  onSelectSubject: (subject: Subject) => void;
  onStartAssessment?: (subjectId: string) => void;
  onStartRemediation?: (misconception: Misconception) => void;
  isNewStudent?: boolean;
}

export const BrainKnowledgeModal: React.FC<BrainKnowledgeModalProps> = ({
  isOpen,
  onClose,
  subjects,
  selectedSubject,
  onSelectSubject,
  onStartAssessment,
  onStartRemediation,
  isNewStudent = false,
}) => {
  const [activeSubject, setActiveSubject] = useState<Subject | null>(
    selectedSubject || (subjects.length > 0 ? subjects[0] : null)
  );
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>('top_diff');

  if (!isOpen) return null;

  const currentSubject = selectedSubject || activeSubject || (subjects.length > 0 ? subjects[0] : null);

  if (!currentSubject) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
        <div className="relative w-full max-w-lg glass-panel rounded-3xl p-8 border border-cyan-500/30 text-center space-y-4">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 inline-flex border border-cyan-500/20">
            <Brain className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Subjects Enrolled</h3>
          <p className="text-xs text-slate-400">
            Upload your syllabus to initialize your neural knowledge matrix.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'strong':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-950/70 border border-cyan-400 text-cyan-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> Strong
          </span>
        );
      case 'good':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-950/70 border border-sky-400 text-sky-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span> Good
          </span>
        );
      case 'developing':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/70 border border-blue-400 text-blue-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Developing
          </span>
        );
      case 'needs_improvement':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/70 border border-amber-500 text-amber-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Needs Improvement
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-900/80 border border-slate-600 text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Not Assessed
          </span>
        );
    }
  };

  const toggleTopicExpand = (topicId: string) => {
    setExpandedTopicId((prev) => (prev === topicId ? null : topicId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[90vh] glass-panel rounded-3xl flex flex-col overflow-hidden border border-cyan-500/30 shadow-[0_0_50px_rgba(0,240,255,0.15)]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-cyan-500/20 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                <span>Neural Knowledge Matrix</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono">
                  LIVE CORTICAL STATE
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Cognitive telemetry mapped to cerebral lobes based on empirical assessment evidence
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Onboarding State Warning for New Students */}
        {isNewStudent ? (
          <div className="p-8 text-center flex flex-col items-center justify-center my-auto">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
              <Sparkles className="w-8 h-8 animate-spin-slow" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Welcome to LearnMind AI</h3>
            <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
              Your neural knowledge map is currently unmapped. Complete an initial diagnostic
              assessment to fingerprint your knowledge strengths, identify misconceptions, and
              activate your 3D neural brain!
            </p>
            <button
              onClick={() => {
                onClose();
                if (onStartAssessment) onStartAssessment('sub_math');
              }}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-sm tracking-wide flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:brightness-110"
            >
              <span>Launch First Diagnostic Assessment</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Subject Selector Left Column */}
            <div className="w-full md:w-72 border-r border-cyan-500/15 bg-slate-950/40 p-4 overflow-y-auto space-y-2">
              <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase px-2 mb-2">
                Knowledge Domains ({subjects.length})
              </div>

              {subjects.map((subj) => {
                const isActive = currentSubject.id === subj.id;
                return (
                  <button
                    key={subj.id}
                    onClick={() => {
                      setActiveSubject(subj);
                      onSelectSubject(subj);
                    }}
                    className={`w-full p-3 rounded-2xl text-left transition-all duration-200 border flex items-center justify-between ${
                      isActive
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: subj.color }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-white">{subj.name}</div>
                        <div className="text-[11px] text-slate-400">{subj.brainRegion}</div>
                      </div>
                    </div>
                    <div>{getStatusBadge(subj.status)}</div>
                  </button>
                );
              })}
            </div>

            {/* Subject Detailed Breakdown Center/Right Column */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {/* Subject Summary Banner */}
              <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-white tracking-wide">
                      {currentSubject.name}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                      {currentSubject.code}
                    </span>
                    {getStatusBadge(currentSubject.status)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>Region:</span>
                    <span className="text-cyan-300 font-medium">
                      {currentSubject.brainRegion}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Mastery Level</div>
                    <div className="text-2xl font-black text-cyan-400 font-mono">
                      {currentSubject.status === 'not_assessed'
                        ? '—'
                        : `${currentSubject.masteryScore}%`}
                    </div>
                  </div>
                  <div className="text-right pl-4 border-l border-slate-800">
                    <div className="text-xs text-slate-400">Bayesian Confidence</div>
                    <div className="text-sm font-bold text-slate-200 capitalize">
                      {currentSubject.confidence}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommended Next Concept Callout */}
              {currentSubject.recommendedNextConcept && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-slate-900/60 border border-cyan-400/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                      <Compass className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-cyan-300 uppercase tracking-wider font-semibold">
                        Recommended Next Study Concept
                      </div>
                      <div className="text-sm font-bold text-white">
                        {currentSubject.recommendedNextConcept}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      if (onStartAssessment) onStartAssessment(currentSubject.id);
                    }}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-colors shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                  >
                    Study Now
                  </button>
                </div>
              )}

              {/* Topics & Subtopics Hierarchy */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    <span>Topics & Individual Concepts</span>
                  </h4>
                  <span className="text-xs text-slate-400">
                    {currentSubject.completedTopics} of {currentSubject.totalTopics} completed
                  </span>
                </div>

                <div className="space-y-3">
                  {currentSubject.units.map((unit) => (
                    <div key={unit.id} className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 px-1">
                        {unit.title}
                      </div>

                      {unit.topics.map((topic) => {
                        const isExpanded = expandedTopicId === topic.id;
                        const hasMisconceptions = topic.misconceptions && topic.misconceptions.length > 0;

                        return (
                          <div
                            key={topic.id}
                            className={`rounded-2xl border transition-all duration-200 ${
                              hasMisconceptions
                                ? 'border-amber-500/40 bg-slate-950/60'
                                : 'border-slate-800 bg-slate-900/40'
                            }`}
                          >
                            {/* Topic Row Accordion Trigger */}
                            <div
                              onClick={() => toggleTopicExpand(topic.id)}
                              className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 rounded-2xl"
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-slate-400">
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                                    <span>{topic.name}</span>
                                    {hasMisconceptions && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        {topic.misconceptions.length} Misconception Detected
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {topic.concepts.length} Concepts • Confidence:{' '}
                                    <span className="capitalize text-slate-300">
                                      {topic.confidence}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="text-xs font-mono font-bold text-slate-200">
                                    {topic.status === 'not_assessed' ? '—' : `${topic.masteryScore}%`}
                                  </span>
                                </div>
                                <div>{getStatusBadge(topic.status)}</div>
                              </div>
                            </div>

                            {/* Expanded Individual Concepts & Misconceptions */}
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 space-y-3">
                                {/* Misconception Alert Box if present */}
                                {hasMisconceptions && (
                                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                                    <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>Diagnostic Misconception Fingerprint</span>
                                    </div>
                                    {topic.misconceptions.map((mis) => (
                                      <div key={mis.id} className="text-xs space-y-1.5 pt-1">
                                        <div className="text-slate-200 font-semibold flex items-center justify-between">
                                          <span>{mis.name} ({mis.id})</span>
                                          <span className="text-amber-400 font-mono">
                                            {mis.confidence}% confidence
                                          </span>
                                        </div>
                                        <p className="text-slate-400 text-[11px] leading-relaxed">
                                          {mis.evidence}
                                        </p>
                                        <div className="p-2 rounded-lg bg-slate-900/80 text-[11px] text-cyan-200 border border-cyan-500/20">
                                          <span className="font-bold text-cyan-400">Remediation: </span>
                                          {mis.correctiveExplanation}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Individual Concepts List */}
                                <div className="space-y-1.5">
                                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                                    Individual Concepts Breakdown:
                                  </div>
                                  {topic.concepts.map((concept) => (
                                    <div
                                      key={concept.id}
                                      className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                                    >
                                      <div>
                                        <div className="font-medium text-slate-200">
                                          {concept.name}
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          {concept.description}
                                        </div>
                                      </div>
                                      <div>{getStatusBadge(concept.status)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-cyan-500/20 bg-slate-950/70 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>Data synced with Bayesian Student State Engine</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
};

