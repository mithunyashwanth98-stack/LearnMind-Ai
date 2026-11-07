import React, { useState } from 'react';
import { Subject, Topic, Concept, Misconception } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  Brain,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Cpu
} from 'lucide-react';

interface KnowledgePageProps {
  subjects: Subject[];
  isNewStudent: boolean;
  onLaunchAssessment: (subjectId: string) => void;
  onLaunchTutor: (topicName: string) => void;
}

export const KnowledgePage: React.FC<KnowledgePageProps> = ({
  subjects,
  isNewStudent,
  onLaunchAssessment,
  onLaunchTutor,
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>('top_diff');

  const currentSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null;

  if (!currentSubject) {
    return (
      <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
        <div className="py-24 text-center space-y-4 max-w-xl mx-auto">
          <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 inline-flex border border-cyan-500/30">
            <Brain className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-white">No Subjects Enrolled Yet</h3>
          <p className="text-xs text-slate-400">
            Upload your syllabus in the Syllabus Intelligence Engine to generate your knowledge matrix.
          </p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'strong':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/70 border border-cyan-400 text-cyan-300">
            Strong
          </span>
        );
      case 'good':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-950/70 border border-sky-400 text-sky-300">
            Good
          </span>
        );
      case 'developing':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/70 border border-blue-400 text-blue-300">
            Developing
          </span>
        );
      case 'needs_improvement':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/70 border border-amber-500 text-amber-300">
            Needs Improvement
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-400">
            Not Assessed
          </span>
        );
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Granular Knowledge Matrix</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              BAYESIAN BETA CONCEPTS
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Explore topic competencies, prerequisites, and detected misconception fingerprints
            across your enrolled subjects.
          </p>
        </div>

        {/* Subject Domain Tabs */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/70 border border-cyan-500/20 overflow-x-auto">
          {subjects.map((subj) => (
            <button
              key={subj.id}
              onClick={() => setSelectedSubjectId(subj.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedSubjectId === subj.id
                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: selectedSubjectId === subj.id ? '#050814' : subj.color }}
              />
              <span>{subj.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Subject Overview Banner */}
      <GlassCard glowColor="cyan">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold text-white">{currentSubject.name}</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                {currentSubject.code}
              </span>
              {getStatusBadge(currentSubject.status)}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>Cortical Location:</span>
              <span className="text-cyan-300 font-semibold">{currentSubject.brainRegion}</span>
              <span>•</span>
              <span>Topics:</span>
              <span className="text-slate-200">
                {currentSubject.completedTopics} / {currentSubject.totalTopics} Mastered
              </span>
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-slate-400">Mastery Score</div>
              <div className="text-3xl font-black text-cyan-400 font-mono">
                {currentSubject.status === 'not_assessed' ? '—' : `${currentSubject.masteryScore}%`}
              </div>
            </div>

            <div className="text-right pl-6 border-l border-slate-800">
              <div className="text-xs text-slate-400">Bayesian Variance</div>
              <div className="text-sm font-mono font-bold text-slate-300">
                {currentSubject.confidence === 'high'
                  ? 'σ² = 0.012'
                  : currentSubject.confidence === 'medium'
                  ? 'σ² = 0.038'
                  : 'Uncalibrated'}
              </div>
            </div>

            <button
              onClick={() => onLaunchAssessment(currentSubject.id)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all shrink-0"
            >
              Test Knowledge
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search concepts, topics or formulas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {['all', 'needs_improvement', 'developing', 'strong'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                statusFilter === status
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold'
                  : 'text-slate-400 hover:text-white bg-slate-900/40 border border-slate-800'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Detailed Units and Topic Hierarchy */}
      <div className="space-y-4">
        {currentSubject.units.map((unit) => (
          <div key={unit.id} className="space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <span>{unit.title}</span>
            </h4>

            <div className="space-y-3">
              {unit.topics
                .filter(
                  (t) =>
                    (statusFilter === 'all' || t.status === statusFilter) &&
                    (searchQuery === '' ||
                      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      t.concepts.some((c) =>
                        c.name.toLowerCase().includes(searchQuery.toLowerCase())
                      ))
                )
                .map((topic) => {
                  const isExpanded = expandedTopicId === topic.id;
                  const hasMisconceptions =
                    topic.misconceptions && topic.misconceptions.length > 0;

                  return (
                    <div
                      key={topic.id}
                      className={`glass-panel rounded-2xl border transition-all duration-200 overflow-hidden ${
                        hasMisconceptions
                          ? 'border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                          : 'border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Topic Bar Header */}
                      <div
                        onClick={() =>
                          setExpandedTopicId((prev) => (prev === topic.id ? null : topic.id))
                        }
                        className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-slate-400">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-cyan-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="text-base font-bold text-white flex items-center gap-2">
                              <span>{topic.name}</span>
                              {hasMisconceptions && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {topic.misconceptions.length} Conceptual Misconception Identified
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {topic.concepts.length} granular concepts • Certainty: {topic.confidence}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-base font-mono font-bold text-white">
                              {topic.status === 'not_assessed' ? '—' : `${topic.masteryScore}%`}
                            </span>
                          </div>
                          <div>{getStatusBadge(topic.status)}</div>
                        </div>
                      </div>

                      {/* Expanded Concepts & Remediation Panel */}
                      {isExpanded && (
                        <div className="px-6 pb-6 pt-2 border-t border-slate-800/60 bg-slate-950/40 space-y-4">
                          {/* Misconception Remediation Box */}
                          {hasMisconceptions && (
                            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span>Identified Student Misconceptions</span>
                                </span>
                                <button
                                  onClick={() => onLaunchTutor(topic.name)}
                                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                                >
                                  <span>Ask AI Tutor to Explain</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>

                              {topic.misconceptions.map((mis) => (
                                <div key={mis.id} className="text-xs space-y-1.5">
                                  <div className="text-slate-200 font-semibold flex items-center justify-between">
                                    <span>
                                      {mis.name} <span className="text-slate-400">({mis.id})</span>
                                    </span>
                                    <span className="text-amber-400 font-mono">
                                      {mis.confidence}% confidence
                                    </span>
                                  </div>
                                  <p className="text-slate-300 text-[11px] leading-relaxed">
                                    {mis.evidence}
                                  </p>
                                  <div className="p-2.5 rounded-lg bg-slate-900 text-cyan-200 text-[11px] border border-cyan-500/20">
                                    <span className="font-bold text-cyan-400">Corrective Logic: </span>
                                    {mis.correctiveExplanation}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Concepts List */}
                          <div className="space-y-2">
                            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                              Underlying Concept Nodes:
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {topic.concepts.map((concept) => (
                                <div
                                  key={concept.id}
                                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                                >
                                  <div>
                                    <div className="font-bold text-slate-200">{concept.name}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                      {concept.description}
                                    </div>
                                  </div>
                                  <div>{getStatusBadge(concept.status)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

