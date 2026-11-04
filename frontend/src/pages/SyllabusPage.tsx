import React, { useState, useEffect } from 'react';
import { Subject, Unit, Topic } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  FileSpreadsheet,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Check,
  FileText,
  Brain,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  BookOpen,
  Target,
  Sliders,
  ChevronRight
} from 'lucide-react';
import {
  apiUploadSyllabusFile,
  apiSaveTopicCoverage,
  apiGetTopicCoverage,
  apiToggleTopicComplete,
  TopicCoverageItemPayload
} from '../services/api';

interface SyllabusPageProps {
  subjects: Subject[];
  onAddSubject: (newSubject: Subject) => void;
  onUpdateSubject: (subject: Subject) => void;
  sessionToken?: string;
  onNavigateToAssessment?: (subjectId?: string) => void;
}

export type CoverageStatus = 'completed' | 'currently_studying' | 'partially_covered' | 'not_started';

export const SyllabusPage: React.FC<SyllabusPageProps> = ({
  subjects,
  onAddSubject,
  onUpdateSubject,
  sessionToken = '',
  onNavigateToAssessment,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<Subject>(subjects[0] || null);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');
  const [extractionError, setExtractionError] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // New subject form state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newBrainRegion, setNewBrainRegion] = useState('Temporal Lobe (Language & Sequences)');
  const [extractedUnits, setExtractedUnits] = useState<Unit[]>([]);

  // Coverage audit modal state
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditSubject, setAuditSubject] = useState<Subject | null>(null);
  const [coverageMap, setCoverageMap] = useState<Record<string, CoverageStatus>>({});
  const [currentFocusTopicId, setCurrentFocusTopicId] = useState<string>('');
  const [isSavingCoverage, setIsSavingCoverage] = useState(false);

  // Toast notice for topic toggle
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronize selected subject if subjects list updates
  useEffect(() => {
    if (subjects.length > 0) {
      if (!selectedSubject || !subjects.some((s) => s.id === selectedSubject.id)) {
        setSelectedSubject(subjects[0]);
      } else {
        const fresh = subjects.find((s) => s.id === selectedSubject.id);
        if (fresh) setSelectedSubject(fresh);
      }
    }
  }, [subjects]);

  const token =
    sessionToken ||
    sessionStorage.getItem('learnmind_session_token') ||
    localStorage.getItem('learnmind_session_token') ||
    '';

  // 1. REAL PDF UPLOAD VIA PYMUPDF + GEMINI HIERARCHY EXTRACTION
  const handleRealPdfUpload = async (file: File) => {
    setUploadedFile(file);
    setIsExtracting(true);
    setExtractionError('');
    setExtractionProgress('Reading binary PDF byte stream via PyMuPDF (fitz)...');

    const progressTimer1 = setTimeout(() => {
      setExtractionProgress('Deconstructing institutional units, topics & learning outcomes via Gemini...');
    }, 1200);

    const progressTimer2 = setTimeout(() => {
      setExtractionProgress('Auto-detecting subject domain, course codes & prerequisite relationships...');
    }, 2800);

    try {
      const res = await apiUploadSyllabusFile(
        token,
        file,
        newSubjectName.trim() || undefined,
        newSubjectCode.trim() || undefined
      );

      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);

      const syl = res.syllabus;
      const hierarchy = syl?.hierarchy || {};

      // Auto-populate detected Subject Name and Code if not manually provided
      const detectedName = syl?.subject_name || hierarchy?.subjectName || file.name.replace(/\.[^/.]+$/, '');
      const detectedCode = syl?.subject_code || hierarchy?.subjectCode || 'MOD-101';
      const detectedRegion = hierarchy?.brainRegion || (
        detectedName.toLowerCase().includes('java') || detectedName.toLowerCase().includes('oop') || detectedName.toLowerCase().includes('python')
          ? 'Temporal Lobe (Language & Sequences)'
          : 'Frontal Lobe (Reasoning & Mathematics)'
      );

      setNewSubjectName(detectedName);
      setNewSubjectCode(detectedCode);
      setNewBrainRegion(detectedRegion);

      // Map raw units to frontend Unit[] format
      const rawUnits = hierarchy?.units || [];
      const mappedUnits: Unit[] = rawUnits.map((u: any, uIdx: number) => ({
        id: u.id || `u_ext_${uIdx + 1}`,
        title: u.title || `Unit ${uIdx + 1}`,
        topics: (u.topics || []).map((t: any, tIdx: number) => ({
          id: t.id || `top_${uIdx + 1}_${tIdx + 1}`,
          name: t.name,
          status: 'not_assessed',
          masteryScore: 0,
          confidence: 'none',
          completed: false,
          misconceptions: [],
          concepts: (t.subtopics || []).map((st: string, stIdx: number) => ({
            id: `c_${uIdx + 1}_${tIdx + 1}_${stIdx + 1}`,
            name: st,
            description: `Subtopic of ${t.name}`,
            masteryScore: 0,
            status: 'not_assessed',
            confidence: 'none'
          }))
        }))
      }));

      setExtractedUnits(mappedUnits);
      setIsExtracting(false);
      setExtractionProgress('');
    } catch (err: any) {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      setIsExtracting(false);
      setExtractionError(err.message || 'Failed to extract syllabus. Please check the PDF format.');
    }
  };

  // 2. CONFIRM & PROCEED TO COVERAGE AUDIT
  const handleSaveConfirmedSyllabus = () => {
    if (!newSubjectName.trim() || extractedUnits.length === 0) return;

    const newSubject: Subject = {
      id: `sub_${newSubjectName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
      name: newSubjectName,
      code: newSubjectCode || 'MOD-101',
      status: 'not_assessed',
      masteryScore: 0,
      confidence: 'none',
      color: newSubjectName.toLowerCase().includes('java') || newSubjectName.toLowerCase().includes('oop')
        ? '#38bdf8'
        : '#a855f7',
      brainRegion: newBrainRegion,
      nodeCoordinates: [0.6, 0.2, 0.4],
      totalTopics: extractedUnits.reduce((acc, u) => acc + u.topics.length, 0),
      completedTopics: 0,
      detectedMisconceptionsCount: 0,
      recommendedNextConcept: `Start initial foundation on ${extractedUnits[0]?.topics[0]?.name || newSubjectName}`,
      units: extractedUnits,
    };

    onAddSubject(newSubject);
    setSelectedSubject(newSubject);
    setIsAddingSubject(false);
    setNewSubjectName('');
    setNewSubjectCode('');
    setExtractedUnits([]);
    setUploadedFile(null);

    // Automatically prompt student: "How much of this syllabus have you covered?"
    openCoverageAuditModal(newSubject);
  };

  // 3. OPEN COVERAGE AUDIT MODAL
  const openCoverageAuditModal = async (subject: Subject) => {
    setAuditSubject(subject);
    const initialMap: Record<string, CoverageStatus> = {};
    subject.units.forEach((u) => {
      u.topics.forEach((t) => {
        initialMap[t.id] = t.completed ? 'completed' : 'not_started';
      });
    });

    // Try to load any existing backend coverage records
    try {
      const res = await apiGetTopicCoverage(token, subject.id);
      if (res.coverage && res.coverage.length > 0) {
        res.coverage.forEach((c: any) => {
          initialMap[c.topic_id] = c.coverage_status;
          if (c.is_current_focus) {
            setCurrentFocusTopicId(c.topic_id);
          }
        });
      }
    } catch {}

    setCoverageMap(initialMap);
    setIsAuditModalOpen(true);
  };

  // Bulk coverage setters
  const setAllTopicsStatus = (status: CoverageStatus) => {
    if (!auditSubject) return;
    const next: Record<string, CoverageStatus> = {};
    auditSubject.units.forEach((u) => {
      u.topics.forEach((t) => {
        next[t.id] = status;
      });
    });
    setCoverageMap(next);
  };

  // 4. SAVE COVERAGE AUDIT & UPDATE STUDENT PROGRESS
  const handleSaveCoverage = async (andLaunchAssessment: boolean = false) => {
    if (!auditSubject) return;
    setIsSavingCoverage(true);

    const payload: TopicCoverageItemPayload[] = Object.entries(coverageMap).map(([topicId, status]) => ({
      topic_id: topicId,
      coverage_status: status,
      is_current_focus: topicId === currentFocusTopicId,
    }));

    try {
      await apiSaveTopicCoverage(token, auditSubject.id, payload);

      // Update local subject topics
      let completedCount = 0;
      const updatedUnits = auditSubject.units.map((u) => ({
        ...u,
        topics: u.topics.map((t) => {
          const status = coverageMap[t.id] || 'not_started';
          const isComp = status === 'completed';
          if (isComp) completedCount++;
          return {
            ...t,
            completed: isComp,
            status: isComp ? ('developing' as const) : ('not_assessed' as const),
          };
        }),
      }));

      const totalTopics = auditSubject.totalTopics || 1;
      const updatedSubject: Subject = {
        ...auditSubject,
        units: updatedUnits,
        completedTopics: completedCount,
        masteryScore: Math.round((completedCount / totalTopics) * 100),
      };

      onUpdateSubject(updatedSubject);
      setSelectedSubject(updatedSubject);
      setIsAuditModalOpen(false);
      setIsSavingCoverage(false);

      showToast(`Coverage saved! ${completedCount} topics recorded as completed.`);

      if (andLaunchAssessment && onNavigateToAssessment) {
        onNavigateToAssessment(auditSubject.id);
      }
    } catch (err: any) {
      setIsSavingCoverage(false);
      alert(`Error saving coverage: ${err.message || 'Please try again.'}`);
    }
  };

  // 5. QUICK IN-PAGE TOPIC COMPLETION TOGGLE
  const handleToggleTopicComplete = async (topicId: string, currentCompleted: boolean) => {
    if (!selectedSubject) return;

    const nextCompleted = !currentCompleted;

    try {
      await apiToggleTopicComplete(token, selectedSubject.id, topicId, nextCompleted);

      let completedCount = 0;
      const updatedUnits = selectedSubject.units.map((u) => ({
        ...u,
        topics: u.topics.map((t) => {
          const isComp = t.id === topicId ? nextCompleted : t.completed;
          if (isComp) completedCount++;
          return {
            ...t,
            completed: isComp,
            status: isComp ? ('developing' as const) : ('not_assessed' as const),
          };
        }),
      }));

      const totalTopics = selectedSubject.totalTopics || 1;
      const updatedSubject: Subject = {
        ...selectedSubject,
        units: updatedUnits,
        completedTopics: completedCount,
        masteryScore: Math.round((completedCount / totalTopics) * 100),
      };

      onUpdateSubject(updatedSubject);
      setSelectedSubject(updatedSubject);

      const targetTopic = selectedSubject.units.flatMap((u) => u.topics).find((t) => t.id === topicId);
      const name = targetTopic?.name || 'Topic';
      showToast(
        nextCompleted
          ? `🎉 "${name}" marked as Completed! The AI Tutor and Assessment engine are updated.`
          : `"${name}" reverted to Pending.`
      );
    } catch (err: any) {
      showToast(`Could not update topic status: ${err.message}`);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl bg-slate-900 border border-cyan-400 text-cyan-300 shadow-[0_0_25px_rgba(0,240,255,0.3)] flex items-center gap-3 text-xs font-semibold animate-slideDown">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Syllabus Intelligence Engine</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              ALL SUBJECTS • PYMUPDF + GEMINI
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Upload institutional syllabus PDFs (Java, OOP, Python, Engineering Math, etc.) to automatically extract curriculum units, audit your progress, and ground the AI Tutor.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedSubject && (
            <button
              onClick={() => openCoverageAuditModal(selectedSubject)}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              <Sliders className="w-4 h-4" />
              <span>Audit Syllabus Coverage</span>
            </button>
          )}

          <button
            onClick={() => {
              setUploadedFile(null);
              setExtractedUnits([]);
              setNewSubjectName('');
              setNewSubjectCode('');
              setExtractionError('');
              setIsAddingSubject(true);
            }}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New Syllabus</span>
          </button>
        </div>
      </div>

      {/* Main Content: Subject Selection & Syllabus Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Subjects List */}
        <div className="space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 px-1">
            Enrolled Syllabi ({subjects.length})
          </div>

          {subjects.map((subj) => (
            <div
              key={subj.id}
              onClick={() => setSelectedSubject(subj)}
              className={`p-4 rounded-2xl glass-panel border cursor-pointer transition-all ${
                selectedSubject?.id === subj.id
                  ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: subj.color || '#38bdf8' }}
                  />
                  <div className="font-bold text-sm text-white">{subj.name}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {subj.code}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                <span>{subj.units.length} Units</span>
                <span className="text-emerald-400 font-medium">
                  {subj.completedTopics || 0}/{subj.totalTopics || 0} Done
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all"
                  style={{
                    width: `${subj.totalTopics ? Math.round(((subj.completedTopics || 0) / subj.totalTopics) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Active Syllabus Inspector & Editor */}
        <div className="lg:col-span-3 space-y-6">
          {selectedSubject ? (
            <GlassCard glowColor="cyan">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    <span>{selectedSubject.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">
                      {selectedSubject.code}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Cerebral Lobe Mapping: <span className="text-cyan-300">{selectedSubject.brainRegion}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openCoverageAuditModal(selectedSubject)}
                    className="text-xs px-3.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-all font-mono flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Audit Coverage</span>
                  </button>
                  <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-700 font-mono">
                    {selectedSubject.completedTopics || 0}/{selectedSubject.totalTopics || 0} Mastered
                  </span>
                </div>
              </div>

              {/* Units & Topics List with Completion Checkmarks */}
              <div className="mt-6 space-y-6">
                {selectedSubject.units.map((unit, unitIdx) => (
                  <div
                    key={unit.id}
                    className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{unit.title}</span>
                      </h4>
                      <span className="text-xs text-slate-500 font-mono">Unit {unitIdx + 1}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {unit.topics.map((topic) => (
                        <div
                          key={topic.id}
                          className={`p-3.5 rounded-xl border transition-all flex items-center justify-between text-xs ${
                            topic.completed
                              ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                              : 'bg-slate-900/70 border-slate-800'
                          }`}
                        >
                          <div className="flex-1 pr-3">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{topic.name}</span>
                              {topic.completed && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                  Done
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {topic.concepts.length > 0
                                ? `${topic.concepts.length} granular concepts`
                                : 'Core concepts mapped'}
                            </div>
                          </div>

                          {/* Quick Interactive Complete Toggle */}
                          <button
                            onClick={() => handleToggleTopicComplete(topic.id, topic.completed)}
                            title={topic.completed ? 'Mark as Not Completed' : 'Mark as Completed'}
                            className={`p-2 rounded-xl transition-all flex items-center gap-1.5 ${
                              topic.completed
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-mono">
                              {topic.completed ? 'Mastered' : 'Mark Done'}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          ) : (
            <GlassCard glowColor="none">
              <div className="text-center py-12 text-slate-400 text-sm">
                No syllabus enrolled yet. Click "Upload New Syllabus" to get started!
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* MODAL 1: Real PyMuPDF + Gemini Upload Pipeline */}
      {isAddingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl glass-panel rounded-3xl p-6 border border-cyan-500/30 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Upload Syllabus Document</h3>
                  <p className="text-xs text-slate-400">
                    PyMuPDF Text Stream & Gemini Cognitive Curriculum Deconstruction
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingSubject(false)}
                className="text-slate-400 hover:text-white p-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Optional Subject Fields - Auto-detected if omitted! */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Subject Name</span>
                    <span className="text-[10px] text-cyan-400 font-mono">Auto-detected from PDF</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Object-Oriented Programming (Java)"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Subject Code</span>
                    <span className="text-[10px] text-cyan-400 font-mono">Auto-detected</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 25CS303 or CS-201"
                    value={newSubjectCode}
                    onChange={(e) => setNewSubjectCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">
                  3D Brain Cortical Region Mapping
                </label>
                <select
                  value={newBrainRegion}
                  onChange={(e) => setNewBrainRegion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="Temporal Lobe (Language & Sequences)">
                    Temporal Lobe (Language & Sequences — Java, Python, Programming)
                  </option>
                  <option value="Frontal Lobe (Reasoning & Mathematics)">
                    Frontal Lobe (Reasoning & Mathematics — Calculus, Logic, Discrete)
                  </option>
                  <option value="Parietal Lobe (Spatial & Architecture)">
                    Parietal Lobe (Spatial & Architecture — Systems, Networks, DB)
                  </option>
                  <option value="Occipital Lobe (Visual & Mechanics)">
                    Occipital Lobe (Visual & Mechanics — Graphics, Design, Physics)
                  </option>
                </select>
              </div>

              {/* PDF Dropzone */}
              <div className="p-6 border-2 border-dashed border-cyan-500/30 rounded-2xl bg-cyan-950/10 text-center hover:border-cyan-400 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf"
                  disabled={isExtracting}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleRealPdfUpload(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-cyan-500/20 text-cyan-400">
                    <Upload className={`w-6 h-6 ${isExtracting ? 'animate-spin' : 'animate-bounce'}`} />
                  </div>
                  <div className="text-xs font-bold text-white">
                    {uploadedFile ? uploadedFile.name : 'Drop your Course Syllabus PDF here or Browse'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supports any subject PDF (e.g. 25CS303 OOP Syllabus.docx.pdf) • Real PyMuPDF + Gemini Extraction
                  </p>
                </div>
              </div>

              {/* Extraction Processing State */}
              {isExtracting && (
                <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
                    <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>{extractionProgress}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full animate-pulse w-3/4 rounded-full" />
                  </div>
                </div>
              )}

              {/* Extraction Error Notice */}
              {extractionError && (
                <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{extractionError}</span>
                </div>
              )}

              {/* Extracted Preview & Hierarchy Verification */}
              {extractedUnits.length > 0 && !isExtracting && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 max-h-60 overflow-y-auto">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      Extracted {extractedUnits.length} Units & {extractedUnits.reduce((acc, u) => acc + u.topics.length, 0)} Discrete Topics
                    </span>
                    <span className="text-[10px] text-slate-400">Verified for: {newSubjectName}</span>
                  </div>

                  {extractedUnits.map((u) => (
                    <div key={u.id} className="text-xs p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                      <div className="font-bold text-white flex items-center justify-between">
                        <span>{u.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{u.topics.length} topics</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 pl-2 border-l border-cyan-500/30 space-y-0.5">
                        {u.topics.map((t) => t.name).join(' • ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setIsAddingSubject(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirmedSyllabus}
                disabled={!newSubjectName.trim() || extractedUnits.length === 0 || isExtracting}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors shadow-[0_0_15px_rgba(0,240,255,0.3)] flex items-center gap-2"
              >
                <span>Confirm & Audit Coverage</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: "HOW MUCH OF THIS SYLLABUS HAVE YOU COVERED?" AUDIT MODAL */}
      {isAuditModalOpen && auditSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-3xl glass-panel rounded-3xl p-6 border border-cyan-500/40 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>How much of this syllabus have you covered?</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                      {auditSubject.name}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Be honest! Topics marked <strong className="text-slate-300">"Not Started"</strong> will{' '}
                    <strong className="text-cyan-300">NOT be scored as zero failure</strong>. The AI Tutor and Assessment engine adapt to your actual position.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="text-slate-400 hover:text-white p-2"
              >
                ✕
              </button>
            </div>

            {/* Bulk Selection Shortcuts */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs">
              <span className="text-slate-400 font-medium">Quick Bulk Actions:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllTopicsStatus('not_started')}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors"
                >
                  Set All: Not Started (Complete Beginner)
                </button>
                <button
                  type="button"
                  onClick={() => setAllTopicsStatus('completed')}
                  className="px-3 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono transition-colors"
                >
                  Set All: Completed
                </button>
              </div>
            </div>

            {/* Units & Topics Coverage Audit Table */}
            <div className="space-y-4">
              {auditSubject.units.map((unit, uIdx) => (
                <div key={unit.id} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-cyan-300 uppercase tracking-wide flex items-center justify-between">
                    <span>{unit.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Unit {uIdx + 1}</span>
                  </div>

                  <div className="space-y-2">
                    {unit.topics.map((topic) => {
                      const currentStatus = coverageMap[topic.id] || 'not_started';
                      const isFocus = currentFocusTopicId === topic.id;

                      return (
                        <div
                          key={topic.id}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-white">{topic.name}</div>
                            {topic.concepts.length > 0 && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Subtopics: {topic.concepts.map((c) => c.name).join(', ')}
                              </div>
                            )}
                          </div>

                          {/* 4 Status Pills */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setCoverageMap({ ...coverageMap, [topic.id]: 'completed' })}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                currentStatus === 'completed'
                                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Completed
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCoverageMap({ ...coverageMap, [topic.id]: 'currently_studying' });
                                setCurrentFocusTopicId(topic.id);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                currentStatus === 'currently_studying'
                                  ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Studying Now
                            </button>

                            <button
                              type="button"
                              onClick={() => setCoverageMap({ ...coverageMap, [topic.id]: 'partially_covered' })}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                currentStatus === 'partially_covered'
                                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Partially
                            </button>

                            <button
                              type="button"
                              onClick={() => setCoverageMap({ ...coverageMap, [topic.id]: 'not_started' })}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                currentStatus === 'not_started'
                                  ? 'bg-slate-600 text-white'
                                  : 'bg-slate-800/60 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              Not Started
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                <span>
                  {Object.values(coverageMap).filter((s) => s === 'completed').length} completed •{' '}
                  {Object.values(coverageMap).filter((s) => s === 'currently_studying').length} current focus •{' '}
                  {Object.values(coverageMap).filter((s) => s === 'not_started').length} not started
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveCoverage(false)}
                  disabled={isSavingCoverage}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Save Coverage
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveCoverage(true)}
                  disabled={isSavingCoverage}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Save & Take Diagnostic</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
