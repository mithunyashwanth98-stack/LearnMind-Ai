import React, { useState } from 'react';
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
  AlertCircle
} from 'lucide-react';

interface SyllabusPageProps {
  subjects: Subject[];
  onAddSubject: (newSubject: Subject) => void;
  onUpdateSubject: (subject: Subject) => void;
}

export const SyllabusPage: React.FC<SyllabusPageProps> = ({
  subjects,
  onAddSubject,
  onUpdateSubject,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<Subject>(subjects[0]);
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // New subject form state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newBrainRegion, setNewBrainRegion] = useState('Frontal Lobe');
  const [extractedUnits, setExtractedUnits] = useState<Unit[]>([]);

  const handleSimulatedPdfUpload = (file: File) => {
    setUploadedFile(file);
    setIsExtracting(true);
    setExtractionProgress('Reading binary PDF stream via PyMuPDF (fitz)...');

    setTimeout(() => {
      setExtractionProgress('Performing OCR heuristic bounding & layout analysis...');
    }, 900);

    setTimeout(() => {
      setExtractionProgress('Deconstructing hierarchical units, topics & learning outcomes...');
    }, 1800);

    setTimeout(() => {
      // Mock extracted unit structure for demonstration
      setExtractedUnits([
        {
          id: `u_ext_1_${Date.now()}`,
          title: 'Unit 1: Core Fundamentals & Principles',
          topics: [
            {
              id: `t_ext_1_${Date.now()}`,
              name: 'Mathematical Foundations',
              status: 'not_assessed',
              masteryScore: 0,
              confidence: 'none',
              completed: false,
              misconceptions: [],
              concepts: [
                { id: `c_1_${Date.now()}`, name: 'Foundational Theorems', description: 'Core principles', masteryScore: 0, status: 'not_assessed', confidence: 'none' },
                { id: `c_2_${Date.now()}`, name: 'Operational Syntax', description: 'Standard notations', masteryScore: 0, status: 'not_assessed', confidence: 'none' }
              ]
            },
            {
              id: `t_ext_2_${Date.now()}`,
              name: 'Structural Properties',
              status: 'not_assessed',
              masteryScore: 0,
              confidence: 'none',
              completed: false,
              misconceptions: [],
              concepts: [
                { id: `c_3_${Date.now()}`, name: 'Transformation Rules', description: 'Algebraic mapping', masteryScore: 0, status: 'not_assessed', confidence: 'none' }
              ]
            }
          ]
        },
        {
          id: `u_ext_2_${Date.now()}`,
          title: 'Unit 2: Advanced Applied Methodologies',
          topics: [
            {
              id: `t_ext_3_${Date.now()}`,
              name: 'Calculus of Applications',
              status: 'not_assessed',
              masteryScore: 0,
              confidence: 'none',
              completed: false,
              misconceptions: [],
              concepts: [
                { id: `c_4_${Date.now()}`, name: 'Optimization & Rate of Change', description: 'Differential rates', masteryScore: 0, status: 'not_assessed', confidence: 'none' }
              ]
            }
          ]
        }
      ]);
      setIsExtracting(false);
      setExtractionProgress('');
    }, 2800);
  };

  const handleSaveConfirmedSyllabus = () => {
    if (!newSubjectName.trim()) return;

    const newSubject: Subject = {
      id: `sub_${Date.now()}`,
      name: newSubjectName,
      code: newSubjectCode || 'MOD-101',
      status: 'not_assessed',
      masteryScore: 0,
      confidence: 'none',
      color: '#38bdf8',
      brainRegion: newBrainRegion,
      nodeCoordinates: [0.5, -0.4, 0.6],
      totalTopics: extractedUnits.reduce((acc, u) => acc + u.topics.length, 0),
      completedTopics: 0,
      detectedMisconceptionsCount: 0,
      recommendedNextConcept: 'Start Initial Diagnostic Assessment',
      units: extractedUnits,
    };

    onAddSubject(newSubject);
    setSelectedSubject(newSubject);
    setIsAddingSubject(false);
    setNewSubjectName('');
    setNewSubjectCode('');
    setExtractedUnits([]);
    setUploadedFile(null);
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Syllabus Intelligence Engine</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              PYMUPDF PARSER
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Upload institutional syllabus PDFs to automatically construct unit hierarchies, topic
            nodes, and learning objectives.
          </p>
        </div>

        <button
          onClick={() => setIsAddingSubject(true)}
          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Subject</span>
        </button>
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
                selectedSubject.id === subj.id
                  ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: subj.color }}
                  />
                  <div className="font-bold text-sm text-white">{subj.name}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {subj.code}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                <span>{subj.units.length} Units</span>
                <span>{subj.totalTopics} Topics</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Active Syllabus Inspector & Editor */}
        <div className="lg:col-span-3 space-y-6">
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

              <div className="flex items-center gap-2">
                <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 text-slate-300 border border-slate-700 font-mono">
                  {selectedSubject.units.reduce((acc, u) => acc + u.topics.length, 0)} Total Extracted Topics
                </span>
              </div>
            </div>

            {/* Units & Topics List */}
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
                        className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{topic.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {topic.concepts.length} granular concepts
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            topic.completed
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {topic.completed ? 'Mastered' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Add New Subject Modal with PyMuPDF Upload Pipeline */}
      {isAddingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl glass-panel rounded-3xl p-6 border border-cyan-500/30 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Upload Subject Syllabus</h3>
                  <p className="text-xs text-slate-400">PyMuPDF Text & Structural Extraction Pipeline</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingSubject(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    Subject Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Data Structures & Algorithms"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 mb-1 block">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CS-301"
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
                  <option value="Frontal Lobe">Frontal Lobe (Reasoning & Mathematics)</option>
                  <option value="Temporal Lobe">Temporal Lobe (Language & Sequences)</option>
                  <option value="Parietal Lobe">Parietal Lobe (Spatial & Architecture)</option>
                  <option value="Occipital Lobe">Occipital Lobe (Visual & Mechanics)</option>
                </select>
              </div>

              {/* PDF Dropzone */}
              <div className="p-6 border-2 border-dashed border-cyan-500/30 rounded-2xl bg-cyan-950/10 text-center hover:border-cyan-400 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleSimulatedPdfUpload(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-3 rounded-full bg-cyan-500/20 text-cyan-400">
                    <Upload className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="text-xs font-bold text-white">
                    {uploadedFile ? uploadedFile.name : 'Drop your Course Syllabus PDF here or Browse'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supported: PDF files up to 25MB • Automated PyMuPDF text & structure extraction
                  </p>
                </div>
              </div>

              {/* Extraction Processing State */}
              {isExtracting && (
                <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/40 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>{extractionProgress}</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full animate-pulse w-3/4 rounded-full" />
                  </div>
                </div>
              )}

              {/* Extracted Preview & Verification */}
              {extractedUnits.length > 0 && !isExtracting && (
                <div className="space-y-3 p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 max-h-60 overflow-y-auto">
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      Extracted {extractedUnits.length} Units & Topics
                    </span>
                    <span className="text-[10px] text-slate-400">Review & edit before saving</span>
                  </div>

                  {extractedUnits.map((u, i) => (
                    <div key={u.id} className="text-xs p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                      <div className="font-bold text-white">{u.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1 pl-2 border-l border-cyan-500/30">
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
                disabled={!newSubjectName.trim() || extractedUnits.length === 0}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider transition-colors shadow-[0_0_15px_rgba(0,240,255,0.3)]"
              >
                Confirm & Add to Brain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

