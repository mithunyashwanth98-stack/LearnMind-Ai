import React, { useState, useEffect, useRef } from 'react';
import { Subject, Unit, Topic } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  Upload,
  Plus,
  Trash2,
  Edit2,
  Check,
  FileText,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  BookOpen,
  Target,
  Sliders,
  ChevronRight,
  X,
  RefreshCw,
  Layers,
  HelpCircle,
  FolderOpen
} from 'lucide-react';
import {
  apiExtractSyllabusPreview,
  apiConfirmSyllabus,
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
  onNavigateToTutor?: (subjectId?: string, topicId?: string) => void;
}

export type CoverageStatus = 'completed' | 'currently_studying' | 'partially_covered' | 'not_started';

interface FlattenedTopicItem {
  globalIndex: number;
  unitId: string;
  unitTitle: string;
  unitIndex: number;
  topic: Topic;
}

export const SyllabusPage: React.FC<SyllabusPageProps> = ({
  subjects,
  onAddSubject,
  onUpdateSubject,
  sessionToken = '',
  onNavigateToAssessment,
  onNavigateToTutor,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<Subject>(subjects[0] || null);

  // Modal 1: Upload & File Staging State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadStage, setUploadStage] = useState<'drop' | 'staged' | 'extracting' | 'review'>('drop');
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [extractionProgress, setExtractionProgress] = useState('');
  const [extractionError, setExtractionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable Preview State (Stage 1: Review & Edit)
  const [previewSubjectName, setPreviewSubjectName] = useState('');
  const [previewSubjectCode, setPreviewSubjectCode] = useState('');
  const [previewFileHash, setPreviewFileHash] = useState('');
  const [previewConfidence, setPreviewConfidence] = useState<number>(1.0);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [editableUnits, setEditableUnits] = useState<Unit[]>([]);
  const [newTopicInputs, setNewTopicInputs] = useState<Record<string, string>>({});
  const [isConfirmingSyllabus, setIsConfirmingSyllabus] = useState(false);

  // Modal 2: Topic-by-Topic Interactive Coverage Audit State (Stage 2)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditSubject, setAuditSubject] = useState<Subject | null>(null);
  const [auditViewMode, setAuditViewMode] = useState<'card' | 'matrix' | 'summary'>('card');
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [coverageMap, setCoverageMap] = useState<Record<string, CoverageStatus>>({});
  const [currentFocusTopicId, setCurrentFocusTopicId] = useState<string>('');
  const [isSavingTopic, setIsSavingTopic] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronize selected subject when subjects list updates
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // -------------------------------------------------------------
  // 1. FILE SELECTION & VALIDATION HANDLERS
  // -------------------------------------------------------------
  const handleFileSelected = (file: File) => {
    setValidationError('');
    setExtractionError('');

    if (!file) return;

    // Validate file type
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setValidationError(
        `Invalid file format: "${file.name}". Please upload a valid PDF document (.pdf).`
      );
      return;
    }

    // Validate file size (max 25MB)
    const MAX_SIZE_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 25MB.`
      );
      return;
    }

    if (file.size === 0) {
      setValidationError(`The selected PDF file is empty (0 bytes).`);
      return;
    }

    // Set staged file and transition to staged review card
    setStagedFile(file);
    setUploadStage('staged');

    // Reset input value so the exact same file can be selected again if replaced
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // -------------------------------------------------------------
  // 2. EXTRACT SYLLABUS PREVIEW (GEMINI ANALYSIS)
  // -------------------------------------------------------------
  const handleStartExtraction = async () => {
    if (!stagedFile) return;

    setUploadStage('extracting');
    setExtractionError('');
    setExtractionProgress('Reading binary PDF byte stream via PyMuPDF (fitz)...');

    const progressTimer1 = setTimeout(() => {
      setExtractionProgress('Deconstructing institutional units, topics & learning outcomes via Gemini...');
    }, 1200);

    const progressTimer2 = setTimeout(() => {
      setExtractionProgress('Auto-detecting subject domain, course codes & verifying grounding...');
    }, 2800);

    try {
      const res = await apiExtractSyllabusPreview(token, stagedFile, undefined, undefined, false);

      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);

      const hierarchy = res.hierarchy || {};
      const validation = res.validation || hierarchy.validation || {};

      setPreviewFileHash(res.file_hash || '');
      setPreviewSubjectName(res.subject_name || hierarchy.subjectName || stagedFile.name.replace(/\.[^/.]+$/, ''));
      setPreviewSubjectCode(res.subject_code || hierarchy.subjectCode || 'MOD-101');
      setPreviewConfidence(validation.confidenceScore ?? (res.confidence_score ?? 0.95));
      setPreviewWarnings(validation.warnings || []);

      // Map backend units to frontend Unit[] format with page numbers
      const rawUnits = hierarchy.units || [];
      const mappedUnits: Unit[] = rawUnits.map((u: any, uIdx: number) => ({
        id: u.id || `u_ext_${uIdx + 1}`,
        title: u.title || `Unit ${uIdx + 1}`,
        pageNumber: u.page_number || 1,
        topics: (u.topics || []).map((t: any, tIdx: number) => ({
          id: t.id || `top_${uIdx + 1}_${tIdx + 1}`,
          name: t.name,
          pageNumber: t.page_number || u.page_number || 1,
          status: 'not_assessed' as const,
          masteryScore: 0,
          confidence: 'none' as const,
          completed: false,
          coverageStatus: 'not_started' as const,
          misconceptions: [],
          concepts: (t.subtopics || []).map((st: string, stIdx: number) => ({
            id: `c_${uIdx + 1}_${tIdx + 1}_${stIdx + 1}`,
            name: st,
            description: `Subtopic of ${t.name}`,
            masteryScore: 0,
            status: 'not_assessed' as const,
            confidence: 'none' as const,
          })),
        })),
      }));

      setEditableUnits(mappedUnits);
      setUploadStage('review');
    } catch (err: any) {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      setUploadStage('staged');
      setExtractionError(err.message || 'Failed to extract syllabus. Please check the PDF format.');
    }
  };

  // -------------------------------------------------------------
  // 3. EDITING HANDLERS FOR EXTRACTED SYLLABUS
  // -------------------------------------------------------------
  const handleUpdateUnitTitle = (unitIndex: number, newTitle: string) => {
    setEditableUnits((prev) =>
      prev.map((u, i) => (i === unitIndex ? { ...u, title: newTitle } : u))
    );
  };

  const handleUpdateTopicName = (unitIndex: number, topicIndex: number, newName: string) => {
    setEditableUnits((prev) =>
      prev.map((u, uI) =>
        uI === unitIndex
          ? {
              ...u,
              topics: u.topics.map((t, tI) => (tI === topicIndex ? { ...t, name: newName } : t)),
            }
          : u
      )
    );
  };

  const handleDeleteTopic = (unitIndex: number, topicIndex: number) => {
    setEditableUnits((prev) =>
      prev.map((u, uI) =>
        uI === unitIndex
          ? { ...u, topics: u.topics.filter((_, tI) => tI !== topicIndex) }
          : u
      )
    );
  };

  const handleAddTopicToUnit = (unitIndex: number) => {
    const unitId = editableUnits[unitIndex]?.id;
    if (!unitId) return;
    const nameToAdd = (newTopicInputs[unitId] || '').trim();
    if (!nameToAdd) return;

    setEditableUnits((prev) =>
      prev.map((u, uI) => {
        if (uI !== unitIndex) return u;
        const newTopic: Topic = {
          id: `top_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: nameToAdd,
          pageNumber: u.pageNumber || 1,
          status: 'not_assessed',
          masteryScore: 0,
          confidence: 'none',
          completed: false,
          coverageStatus: 'not_started',
          misconceptions: [],
          concepts: [
            {
              id: `c_user_${Date.now()}`,
              name: nameToAdd,
              description: 'User added topic',
              masteryScore: 0,
              status: 'not_assessed',
              confidence: 'none',
            },
          ],
        };
        return { ...u, topics: [...u.topics, newTopic] };
      })
    );

    setNewTopicInputs((prev) => ({ ...prev, [unitId]: '' }));
  };

  const handleAddNewUnit = () => {
    const nextNum = editableUnits.length + 1;
    const newUnit: Unit = {
      id: `unit_user_${Date.now()}`,
      title: `Unit ${nextNum}: New Unit Title`,
      pageNumber: 1,
      topics: [],
    };
    setEditableUnits((prev) => [...prev, newUnit]);
  };

  const handleDeleteUnit = (unitIndex: number) => {
    setEditableUnits((prev) => prev.filter((_, i) => i !== unitIndex));
  };

  // -------------------------------------------------------------
  // 4. CONFIRM & PERSIST SYLLABUS, THEN START INDIVIDUAL TOPIC AUDIT
  // -------------------------------------------------------------
  const handleConfirmAndStartAudit = async () => {
    if (!previewSubjectName.trim() || editableUnits.length === 0) return;
    setIsConfirmingSyllabus(true);

    const totalTopicsCount = editableUnits.reduce((acc, u) => acc + u.topics.length, 0);
    if (totalTopicsCount === 0) {
      alert('Please include at least one topic in the syllabus before confirming.');
      setIsConfirmingSyllabus(false);
      return;
    }

    const hierarchyPayload = {
      subjectName: previewSubjectName.trim(),
      subjectCode: previewSubjectCode.trim() || 'MOD-101',
      totalUnits: editableUnits.length,
      totalTopics: totalTopicsCount,
      units: editableUnits.map((u, uIdx) => ({
        id: u.id,
        unitNumber: uIdx + 1,
        title: u.title,
        page_number: u.pageNumber || 1,
        topics: u.topics.map((t) => ({
          id: t.id,
          name: t.name,
          page_number: t.pageNumber || 1,
          learningObjectives: [`Understand core mechanisms of ${t.name}`],
          prerequisites: ['Foundational Concepts'],
          subtopics: t.concepts.map((c) => c.name),
        })),
      })),
      validation: {
        confidenceScore: previewConfidence,
        warnings: previewWarnings,
        needsReview: false,
      },
    };

    try {
      await apiConfirmSyllabus(token, {
        file_hash: previewFileHash,
        subject_name: previewSubjectName.trim(),
        subject_code: previewSubjectCode.trim() || 'MOD-101',
        original_filename: stagedFile?.name || 'Syllabus.pdf',
        hierarchy: hierarchyPayload,
      });

      const newSubject: Subject = {
        id: `sub_${previewSubjectName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
        name: previewSubjectName.trim(),
        code: previewSubjectCode.trim() || 'MOD-101',
        status: 'not_assessed',
        masteryScore: 0,
        confidence: 'none',
        color: anyKeywordMatch(previewSubjectName, ['java', 'oop', 'code', 'python', 'c++', 'software'])
          ? '#38bdf8'
          : '#a855f7',
        brainRegion: 'Dynamic Curriculum Node',
        nodeCoordinates: [0.6, 0.2, 0.4],
        totalTopics: totalTopicsCount,
        completedTopics: 0,
        detectedMisconceptionsCount: 0,
        recommendedNextConcept: `Start initial foundation on ${editableUnits[0]?.topics[0]?.name || previewSubjectName}`,
        units: editableUnits,
      };

      onAddSubject(newSubject);
      setSelectedSubject(newSubject);
      setIsUploadModalOpen(false);
      setIsConfirmingSyllabus(false);

      showToast(`✓ "${newSubject.name}" confirmed! Starting individual topic coverage walkthrough.`);

      // Automatically launch the interactive individual topic walkthrough!
      openTopicCoverageWalkthrough(newSubject, 0);
    } catch (err: any) {
      setIsConfirmingSyllabus(false);
      alert(`Could not confirm syllabus: ${err.message || 'Please check backend connection.'}`);
    }
  };

  const anyKeywordMatch = (text: string, keywords: string[]) => {
    const l = text.toLowerCase();
    return keywords.some((k) => l.includes(k));
  };

  // -------------------------------------------------------------
  // 5. TOPIC-BY-TOPIC COVERAGE WALKTHROUGH LOGIC (MILESTONE 2)
  // -------------------------------------------------------------
  const getFlattenedTopics = (subject: Subject | null): FlattenedTopicItem[] => {
    if (!subject) return [];
    const result: FlattenedTopicItem[] = [];
    let count = 0;
    subject.units.forEach((u, uIdx) => {
      u.topics.forEach((t) => {
        result.push({
          globalIndex: count,
          unitId: u.id,
          unitTitle: u.title,
          unitIndex: uIdx,
          topic: t,
        });
        count++;
      });
    });
    return result;
  };

  const openTopicCoverageWalkthrough = async (subject: Subject, startIdx: number = 0) => {
    setAuditSubject(subject);
    const initialMap: Record<string, CoverageStatus> = {};

    subject.units.forEach((u) => {
      u.topics.forEach((t) => {
        initialMap[t.id] = t.coverageStatus || (t.completed ? 'completed' : 'not_started');
      });
    });

    // Load any existing backend coverage records for this student
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

    // If startIdx is 0, auto-resume from the first topic that is still 'not_started' or hasn't been set
    const flattened = getFlattenedTopics(subject);
    let targetIdx = startIdx;
    if (startIdx === 0 && flattened.length > 0) {
      const firstUnanswered = flattened.findIndex(
        (item) => !initialMap[item.topic.id] || initialMap[item.topic.id] === 'not_started'
      );
      if (firstUnanswered !== -1) {
        targetIdx = firstUnanswered;
      }
    }

    setCurrentTopicIndex(Math.min(targetIdx, Math.max(0, flattened.length - 1)));
    setAuditViewMode('card');
    setIsAuditModalOpen(true);
  };

  // Save topic status immediately so student progress is NEVER lost if leaving halfway
  const handleAnswerTopic = async (topicId: string, status: CoverageStatus) => {
    if (!auditSubject) return;
    setIsSavingTopic(true);

    const nextCoverage = { ...coverageMap, [topicId]: status };
    setCoverageMap(nextCoverage);

    const isFocus = status === 'currently_studying';
    if (isFocus) {
      setCurrentFocusTopicId(topicId);
    }

    // Fire background save to backend immediately (idempotent individual save)
    try {
      await apiSaveTopicCoverage(token, auditSubject.id, [
        {
          topic_id: topicId,
          coverage_status: status,
          is_current_focus: isFocus,
        },
      ]);

      // Update parent subject state with new topic coverage
      syncSubjectTopicStatus(auditSubject, topicId, status);
    } catch (err) {
      console.warn('Notice saving individual topic coverage:', err);
    } finally {
      setIsSavingTopic(false);
    }

    // Auto-advance to next topic after a brief tactile delay
    const flattened = getFlattenedTopics(auditSubject);
    if (currentTopicIndex < flattened.length - 1) {
      setTimeout(() => {
        setCurrentTopicIndex((prev) => prev + 1);
      }, 220);
    } else {
      // Reached the end: show celebratory summary!
      setTimeout(() => {
        setAuditViewMode('summary');
      }, 300);
    }
  };

  const syncSubjectTopicStatus = (
    subj: Subject,
    topicId: string,
    status: CoverageStatus
  ) => {
    let completedCount = 0;
    const updatedUnits = subj.units.map((u) => ({
      ...u,
      topics: u.topics.map((t) => {
        const currentStat = t.id === topicId ? status : coverageMap[t.id] || t.coverageStatus || 'not_started';
        const isComp = currentStat === 'completed';
        if (isComp) completedCount++;
        return {
          ...t,
          coverageStatus: currentStat,
          completed: isComp,
          status: isComp ? ('developing' as const) : ('not_assessed' as const),
        };
      }),
    }));

    const totalTopics = subj.totalTopics || 1;
    const updatedSubject: Subject = {
      ...subj,
      units: updatedUnits,
      completedTopics: completedCount,
      masteryScore: Math.round((completedCount / totalTopics) * 100),
    };

    onUpdateSubject(updatedSubject);
    if (selectedSubject?.id === subj.id) {
      setSelectedSubject(updatedSubject);
    }
  };

  // -------------------------------------------------------------
  // 6. IN-PAGE QUICK TOPIC STATUS TOGGLE
  // -------------------------------------------------------------
  const handleQuickCycleStatus = async (topicId: string, currentStatus: CoverageStatus) => {
    if (!selectedSubject) return;

    const cycleOrder: CoverageStatus[] = ['not_started', 'partially_covered', 'currently_studying', 'completed'];
    const currentIdx = cycleOrder.indexOf(currentStatus);
    const nextStatus = cycleOrder[(currentIdx + 1) % cycleOrder.length];

    try {
      await apiSaveTopicCoverage(token, selectedSubject.id, [
        {
          topic_id: topicId,
          coverage_status: nextStatus,
          is_current_focus: nextStatus === 'currently_studying',
        },
      ]);

      syncSubjectTopicStatus(selectedSubject, topicId, nextStatus);

      const targetTopic = selectedSubject.units.flatMap((u) => u.topics).find((t) => t.id === topicId);
      const name = targetTopic?.name || 'Topic';
      showToast(`Updated "${name}" to: ${formatStatusLabel(nextStatus)}`);
    } catch (err: any) {
      showToast(`Could not update topic status: ${err.message}`);
    }
  };

  const formatStatusLabel = (s: CoverageStatus) => {
    switch (s) {
      case 'completed':
        return 'Completed';
      case 'currently_studying':
        return 'Currently Studying';
      case 'partially_covered':
        return 'Partially Covered';
      case 'not_started':
      default:
        return 'Not Started';
    }
  };

  const flattenedAuditTopics = getFlattenedTopics(auditSubject);
  const currentItem = flattenedAuditTopics[currentTopicIndex];
  const auditCompletedCount = Object.values(coverageMap).filter((s) => s === 'completed').length;
  const auditStudyingCount = Object.values(coverageMap).filter((s) => s === 'currently_studying').length;
  const auditPartialCount = Object.values(coverageMap).filter((s) => s === 'partially_covered').length;
  const auditNotStartedCount = flattenedAuditTopics.length - (auditCompletedCount + auditStudyingCount + auditPartialCount);

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
            Upload institutional syllabus PDFs (Java, OOP, Python, Engineering Math, Physics, etc.) to extract curriculum units, review topics, and walk through your coverage topic-by-topic.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedSubject && (
            <button
              onClick={() => openTopicCoverageWalkthrough(selectedSubject, 0)}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              <Sliders className="w-4 h-4" />
              <span>Audit Topic Coverage</span>
            </button>
          )}

          <button
            onClick={() => {
              setStagedFile(null);
              setValidationError('');
              setExtractionError('');
              setUploadStage('drop');
              setEditableUnits([]);
              setPreviewSubjectName('');
              setPreviewSubjectCode('');
              setIsUploadModalOpen(true);
            }}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New Syllabus</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Enrolled Syllabi Navigation */}
        <div className="space-y-3">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
            <span>Enrolled Syllabi ({subjects.length})</span>
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
                  {subj.completedTopics || 0}/{subj.totalTopics || 0} Mastered
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

        {/* Right Column: Active Syllabus Inspector */}
        <div className="lg:col-span-3 space-y-6">
          {selectedSubject ? (
            <GlassCard glowColor="cyan">
              <div className="p-6 space-y-6">
                {/* Active Subject Summary Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-black text-white">{selectedSubject.name}</h3>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-mono border border-cyan-500/20">
                        {selectedSubject.code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedSubject.units.length} Units • {selectedSubject.totalTopics} Discrete Topics Grounded
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => openTopicCoverageWalkthrough(selectedSubject, 0)}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>Audit Topic by Topic</span>
                    </button>
                    {onNavigateToAssessment && (
                      <button
                        onClick={() => onNavigateToAssessment(selectedSubject.id)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Take Diagnostic</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Units & Topics List with Interactive Status Badges */}
                <div className="space-y-6">
                  {selectedSubject.units.map((unit, uIdx) => (
                    <div key={unit.id} className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-400">
                            UNIT {uIdx + 1}
                          </span>
                          <span className="text-sm font-bold text-white">{unit.title}</span>
                          {unit.pageNumber && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              p. {unit.pageNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-mono">
                          {unit.topics.length} topics
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {unit.topics.map((topic) => {
                          const status: CoverageStatus = topic.coverageStatus || (topic.completed ? 'completed' : 'not_started');
                          return (
                            <div
                              key={topic.id}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                status === 'completed'
                                  ? 'bg-emerald-950/20 border-emerald-500/40'
                                  : status === 'currently_studying'
                                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_10px_rgba(0,240,255,0.1)]'
                                  : status === 'partially_covered'
                                  ? 'bg-amber-950/20 border-amber-500/30'
                                  : 'bg-slate-900/60 border-slate-800'
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="font-semibold text-xs text-white truncate flex items-center gap-1.5">
                                  <span>{topic.name}</span>
                                  {topic.pageNumber && (
                                    <span className="text-[9px] text-slate-500 font-mono">
                                      [p.{topic.pageNumber}]
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                  {topic.concepts.length > 0
                                    ? topic.concepts.map((c) => c.name).join(' • ')
                                    : 'Core topic concepts'}
                                </div>
                              </div>

                              {/* Interactive Coverage Status Badge */}
                              <button
                                onClick={() => handleQuickCycleStatus(topic.id, status)}
                                title="Click to cycle status: Not Started → Partial → Studying → Completed"
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer ${
                                  status === 'completed'
                                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                    : status === 'currently_studying'
                                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                                    : status === 'partially_covered'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                                }`}
                              >
                                {status === 'completed' && <Check className="w-3 h-3 stroke-[3]" />}
                                {status === 'currently_studying' && <Target className="w-3 h-3" />}
                                {status === 'partially_covered' && <Clock className="w-3 h-3" />}
                                <span>{formatStatusLabel(status)}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard glowColor="none">
              <div className="text-center py-16 text-slate-400 text-sm">
                No syllabus enrolled yet. Click "Upload New Syllabus" to get started!
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* ============================================================= */}
      {/* MODAL 1: UPLOAD, STAGING & TWO-STAGE REVIEW/EDIT WORKFLOW    */}
      {/* ============================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-3xl glass-panel rounded-3xl p-6 border border-cyan-500/30 space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Hidden native file input element */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {uploadStage === 'review'
                      ? 'Review & Edit Extracted Syllabus'
                      : uploadStage === 'staged'
                      ? 'Confirm Selected Syllabus Document'
                      : 'Upload Course Syllabus PDF'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {uploadStage === 'review'
                      ? 'Confirm detected subject, units and topics before proceeding to coverage walkthrough.'
                      : uploadStage === 'staged'
                      ? 'Verify document details before launching Gemini AI syllabus analysis.'
                      : 'PyMuPDF text stream extraction • Multi-subject Gemini AI curriculum deconstruction'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 cursor-pointer transition-colors"
                title="Close Modal"
              >
                ✕
              </button>
            </div>

            {/* ========================================================= */}
            {/* STAGE A: FILE DROPZONE & BROWSE SELECTION                 */}
            {/* ========================================================= */}
            {uploadStage === 'drop' && (
              <div className="space-y-4">
                <div
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-10 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer select-none ${
                    isDragging
                      ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_30px_rgba(0,240,255,0.25)] scale-[1.01]'
                      : 'border-cyan-500/40 bg-cyan-950/10 hover:border-cyan-400 hover:bg-cyan-950/20'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
                    <div
                      className={`p-4 rounded-full transition-all ${
                        isDragging ? 'bg-cyan-400 text-slate-950 scale-110' : 'bg-cyan-500/20 text-cyan-400 animate-bounce'
                      }`}
                    >
                      <Upload className="w-8 h-8" />
                    </div>

                    <div>
                      <div className="text-base font-bold text-white tracking-wide">
                        {isDragging ? 'Drop your syllabus PDF here now' : 'Drag & drop your syllabus PDF here'}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Supports Java OOP, Python, C++, Engineering Math, Physics, Chemistry, DBMS, OS, Networks, etc.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs text-slate-500">— OR —</span>
                    </div>

                    {/* Dedicated Browse Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="pointer-events-auto px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>Browse Computer Files</span>
                    </button>

                    <span className="text-[11px] text-slate-500 font-mono">
                      PDF files only • Up to 25MB
                    </span>
                  </div>
                </div>

                {/* Validation or extraction errors */}
                {(validationError || extractionError) && (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-xs text-rose-300 flex items-center gap-2.5 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{validationError || extractionError}</span>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* STAGE B: STAGED FILE CARD (VALIDATED & READY TO ANALYZE)  */}
            {/* ========================================================= */}
            {uploadStage === 'staged' && stagedFile && (
              <div className="space-y-6 animate-fadeIn">
                <div className="p-6 rounded-2xl bg-slate-900/90 border border-cyan-500/40 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 relative flex-shrink-0">
                        <FileText className="w-8 h-8" />
                        <span className="absolute -top-1 -right-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950">
                          PDF
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-white truncate max-w-md">
                          {stagedFile.name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 font-mono">
                          <span>Size: {formatFileSize(stagedFile.size)}</span>
                          <span>•</span>
                          <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            Validated PDF
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Select a different PDF file"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Replace</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStagedFile(null);
                          setUploadStage('drop');
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 text-xs transition-colors cursor-pointer"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>
                      Ready to analyze! Gemini will deconstruct units, chapters, topics, subtopics and page references without altering your original document.
                    </span>
                  </div>
                </div>

                {extractionError && (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-xs text-rose-300 flex items-center gap-2.5 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{extractionError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setStagedFile(null);
                      setUploadStage('drop');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    Back to File Picker
                  </button>

                  <button
                    type="button"
                    onClick={handleStartExtraction}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.35)] transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze & Extract Syllabus</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* STAGE C: EXTRACTION IN PROGRESS (ANIMATED PROGRESS)       */}
            {/* ========================================================= */}
            {uploadStage === 'extracting' && (
              <div className="py-12 px-6 text-center space-y-4 animate-fadeIn">
                <div className="inline-flex p-4 rounded-full bg-cyan-500/10 text-cyan-400 animate-spin">
                  <RefreshCw className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-white font-mono">{extractionProgress}</div>
                <div className="w-64 mx-auto bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full animate-pulse w-3/4 rounded-full" />
                </div>
                <p className="text-xs text-slate-400">
                  {stagedFile ? stagedFile.name : 'Processing document...'}
                </p>
              </div>
            )}

            {/* ========================================================= */}
            {/* STAGE D: REVIEW & EDIT EXTRACTED SYLLABUS (STAGE 1)       */}
            {/* ========================================================= */}
            {uploadStage === 'review' && (
              <div className="space-y-6 animate-fadeIn">
                {/* Detected Subject & Code Editors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Detected Subject Name</span>
                      <span className="text-[10px] text-cyan-400 font-mono">Editable</span>
                    </label>
                    <input
                      type="text"
                      value={previewSubjectName}
                      onChange={(e) => setPreviewSubjectName(e.target.value)}
                      placeholder="e.g. Object-Oriented Programming (Java)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Course / Subject Code</span>
                      <span className="text-[10px] text-cyan-400 font-mono">Editable</span>
                    </label>
                    <input
                      type="text"
                      value={previewSubjectCode}
                      onChange={(e) => setPreviewSubjectCode(e.target.value)}
                      placeholder="e.g. 25CS303 or CS-201"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                </div>

                {/* Validation Status & Warnings */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">Curriculum Verification:</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] border border-emerald-500/30">
                      {Math.round(previewConfidence * 100)}% Grounded
                    </span>
                    <span className="text-slate-400 font-mono">
                      {editableUnits.length} Units • {editableUnits.reduce((acc, u) => acc + u.topics.length, 0)} Topics
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    Always review and correct topics before confirming.
                  </span>
                </div>

                {previewWarnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Extraction Notes:</span>
                    </div>
                    {previewWarnings.map((w, i) => (
                      <div key={i} className="text-[11px] pl-5">• {w}</div>
                    ))}
                  </div>
                )}

                {/* Units & Topics Editable Tree */}
                <div className="space-y-4 max-h-[46vh] overflow-y-auto pr-1">
                  {editableUnits.map((unit, uIdx) => (
                    <div key={unit.id} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-mono font-bold text-cyan-400 whitespace-nowrap">
                            Unit {uIdx + 1}:
                          </span>
                          <input
                            type="text"
                            value={unit.title}
                            onChange={(e) => handleUpdateUnitTitle(uIdx, e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-bold focus:outline-none focus:border-cyan-400"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {unit.pageNumber && (
                            <span className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 font-mono">
                              p. {unit.pageNumber}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteUnit(uIdx)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors cursor-pointer"
                            title="Delete Unit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Topics under this unit */}
                      <div className="space-y-2 pl-3 border-l-2 border-slate-800">
                        {unit.topics.map((topic, tIdx) => (
                          <div key={topic.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={topic.name}
                              onChange={(e) => handleUpdateTopicName(uIdx, tIdx, e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                            />
                            {topic.pageNumber && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono whitespace-nowrap">
                                p.{topic.pageNumber}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteTopic(uIdx, tIdx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Topic"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        {/* Add Topic Input */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Add missing topic..."
                            value={newTopicInputs[unit.id] || ''}
                            onChange={(e) =>
                              setNewTopicInputs({ ...newTopicInputs, [unit.id]: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTopicToUnit(uIdx);
                              }
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900/40 border border-dashed border-slate-700 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddTopicToUnit(uIdx)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddNewUnit}
                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-cyan-400/60 text-slate-400 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Another Academic Unit / Module</span>
                  </button>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setStagedFile(null);
                      setUploadStage('drop');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                  >
                    Re-upload Document
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmAndStartAudit}
                    disabled={
                      !previewSubjectName.trim() ||
                      editableUnits.reduce((acc, u) => acc + u.topics.length, 0) === 0 ||
                      isConfirmingSyllabus
                    }
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] flex items-center gap-2 cursor-pointer"
                  >
                    {isConfirmingSyllabus ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm Syllabus & Start Coverage Audit</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: INTERACTIVE TOPIC-BY-TOPIC COVERAGE AUDIT (STAGE 2) */}
      {/* ============================================================= */}
      {isAuditModalOpen && auditSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl glass-panel rounded-3xl p-6 border border-cyan-500/40 space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Header with Progress Bar */}
            <div className="space-y-3 pb-4 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Curriculum Coverage Audit</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                        {auditSubject.name}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Answer honestly topic-by-topic. Topics marked <strong>"Not Started"</strong> will <strong>NOT</strong> be penalized.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAuditViewMode(auditViewMode === 'matrix' ? 'card' : 'matrix')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    {auditViewMode === 'matrix' ? 'Card Mode' : 'Grid Mode'}
                  </button>
                  <button
                    onClick={() => setIsAuditModalOpen(false)}
                    className="text-slate-400 hover:text-white p-2 cursor-pointer"
                    title="Close & Save (Progress preserved)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Progress Indicator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-cyan-400 font-bold">
                    Topic {currentTopicIndex + 1} of {flattenedAuditTopics.length}
                  </span>
                  <span className="text-slate-400">
                    {Math.round(((currentTopicIndex + 1) / (flattenedAuditTopics.length || 1)) * 100)}% Audited
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-cyan-400 to-blue-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round(((currentTopicIndex + 1) / (flattenedAuditTopics.length || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* VIEW A: FOCUSED TOPIC CARD (TOPIC-BY-TOPIC INTERACTIVE AUDIT) */}
            {auditViewMode === 'card' && currentItem && (
              <div className="space-y-6 py-2">
                {/* Topic Metadata & Badge */}
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wide">
                      {currentItem.unitTitle}
                    </span>
                    {currentItem.topic.pageNumber && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        Page {currentItem.topic.pageNumber}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xl font-bold text-white tracking-wide">
                      {currentItem.topic.name}
                    </h4>
                    {currentItem.topic.concepts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {currentItem.topic.concepts.map((c) => (
                          <span
                            key={c.id}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700 font-mono"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 italic">
                    "Have you studied this topic, or are you currently learning it?"
                  </p>
                </div>

                {/* 4 Large Color-Coded Choices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Choice 1: Completed */}
                  <button
                    type="button"
                    onClick={() => handleAnswerTopic(currentItem.topic.id, 'completed')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      coverageMap[currentItem.topic.id] === 'completed'
                        ? 'bg-emerald-950/40 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Completed</div>
                        <div className="text-[10px] text-slate-400">
                          Fully studied • Ready for assessment
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Choice 2: Currently Studying */}
                  <button
                    type="button"
                    onClick={() => handleAnswerTopic(currentItem.topic.id, 'currently_studying')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      coverageMap[currentItem.topic.id] === 'currently_studying'
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                        <Target className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Currently Studying</div>
                        <div className="text-[10px] text-slate-400">
                          Active study • Ground AI Tutor here
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Choice 3: Partially Covered */}
                  <button
                    type="button"
                    onClick={() => handleAnswerTopic(currentItem.topic.id, 'partially_covered')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      coverageMap[currentItem.topic.id] === 'partially_covered'
                        ? 'bg-amber-950/40 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-amber-500/50 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Partially Covered</div>
                        <div className="text-[10px] text-slate-400">
                          Know some basics • Need revision
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Choice 4: Not Started */}
                  <button
                    type="button"
                    onClick={() => handleAnswerTopic(currentItem.topic.id, 'not_started')}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      coverageMap[currentItem.topic.id] === 'not_started'
                        ? 'bg-slate-800 border-slate-400'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center font-bold">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Not Started</div>
                        <div className="text-[10px] text-slate-400">
                          Zero penalty • Saved for later
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={currentTopicIndex === 0}
                    onClick={() => setCurrentTopicIndex((prev) => Math.max(0, prev - 1))}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAuditModalOpen(false);
                        showToast('✓ Coverage progress saved automatically! You can resume anytime.');
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                    >
                      Save & Exit For Later
                    </button>

                    {currentTopicIndex < flattenedAuditTopics.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => setCurrentTopicIndex((prev) => prev + 1)}
                        className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>Next Topic</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAuditViewMode('summary')}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Finish Audit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW B: GRID MATRIX OVERVIEW (ALLOWS DIRECT JUMP) */}
            {auditViewMode === 'matrix' && (
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                <div className="text-xs text-slate-400">
                  Click any topic to jump to it, or click the status badge to toggle.
                </div>
                {auditSubject.units.map((unit, uIdx) => (
                  <div key={unit.id} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-cyan-400 uppercase tracking-wide">
                      {unit.title}
                    </div>
                    <div className="space-y-1.5">
                      {unit.topics.map((t) => {
                        const status = coverageMap[t.id] || 'not_started';
                        const globalIdx = flattenedAuditTopics.findIndex((item) => item.topic.id === t.id);
                        return (
                          <div
                            key={t.id}
                            className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentTopicIndex(globalIdx !== -1 ? globalIdx : 0);
                                setAuditViewMode('card');
                              }}
                              className="font-medium text-slate-200 hover:text-cyan-300 text-left truncate flex-1 pr-2 cursor-pointer"
                            >
                              {t.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAnswerTopic(t.id, status === 'completed' ? 'not_started' : 'completed')}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                                status === 'completed'
                                  ? 'bg-emerald-500 text-slate-950'
                                  : status === 'currently_studying'
                                  ? 'bg-cyan-500 text-slate-950'
                                  : status === 'partially_covered'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {formatStatusLabel(status)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VIEW C: CELEBRATORY AUDIT SUMMARY */}
            {auditViewMode === 'summary' && (
              <div className="py-6 px-4 space-y-6 text-center animate-fadeIn">
                <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div>
                  <h4 className="text-xl font-black text-white">
                    Curriculum Coverage Audit Complete!
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Your learning baseline for <strong className="text-white">{auditSubject.name}</strong> is now locked.
                  </p>
                </div>

                {/* Breakdown Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-900 border border-emerald-500/30">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      {auditCompletedCount}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">
                      Completed
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900 border border-cyan-500/30">
                    <div className="text-2xl font-black text-cyan-400 font-mono">
                      {auditStudyingCount}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">
                      Focus Topics
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900 border border-amber-500/30">
                    <div className="text-2xl font-black text-amber-400 font-mono">
                      {auditPartialCount}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1">
                      Partial
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-700">
                    <div className="text-2xl font-black text-slate-400 font-mono">
                      {auditNotStartedCount}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mt-1">
                      Not Started
                    </div>
                  </div>
                </div>

                {/* Final Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                  {onNavigateToAssessment && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAuditModalOpen(false);
                        onNavigateToAssessment(auditSubject.id);
                      }}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Take Diagnostic on Completed Topics</span>
                    </button>
                  )}

                  {onNavigateToTutor && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAuditModalOpen(false);
                        onNavigateToTutor(auditSubject.id, currentFocusTopicId);
                      }}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      <span>Open AI Tutor</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsAuditModalOpen(false)}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    View Syllabus
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
