import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Bot,
  FileSpreadsheet,
  Activity,
  GitBranch,
  LineChart,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { NavSection } from '../Sidebar';

export interface NavigationItem {
  id: NavSection;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  side: 'left' | 'right';
  slotIndex: number;
}

interface BrainNavigationRingProps {
  isVisible: boolean;
  onSelectSection: (section: NavSection) => void;
  selectedSection: NavSection | null;
}

// Left side items (3 items: My Knowledge, Syllabus, Diagnostic Assessment)
const leftNavItems: NavigationItem[] = [
  {
    id: 'knowledge',
    title: 'My Knowledge',
    subtitle: 'COGNITIVE MATRIX',
    description: 'Explore granular concept mastery, subject domains & misconceptions',
    icon: <BrainCircuit className="w-5 h-5" />,
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.65)',
    side: 'left',
    slotIndex: 0,
  },
  {
    id: 'syllabus',
    title: 'Syllabus',
    subtitle: 'PYMUPDF PARSER',
    description: 'Course curriculum upload, OCR extraction & unit structuring',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.65)',
    side: 'left',
    slotIndex: 1,
  },
  {
    id: 'assessment',
    title: 'Diagnostic Assessment',
    subtitle: 'BAYESIAN BETA TEST',
    description: 'Adaptive diagnostic probes testing conceptual misconception signatures',
    icon: <Activity className="w-5 h-5" />,
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.65)',
    side: 'left',
    slotIndex: 2,
  },
];

// Right side items (4 items: AI Tutor, Learning Path, Progress, Settings)
const rightNavItems: NavigationItem[] = [
  {
    id: 'tutor',
    title: 'AI Tutor',
    subtitle: 'HOLO-JARVIS VOICE',
    description: 'Multimodal voice tutor with step-by-step misconception remediation',
    icon: <Bot className="w-5 h-5" />,
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.65)',
    side: 'right',
    slotIndex: 0,
  },
  {
    id: 'learning-path',
    title: 'Learning Path',
    subtitle: 'NETWORKX PREREQUISITES',
    description: 'Topologically ordered roadmap targeting root cognitive gaps first',
    icon: <GitBranch className="w-5 h-5" />,
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.65)',
    side: 'right',
    slotIndex: 1,
  },
  {
    id: 'progress',
    title: 'Progress',
    subtitle: 'RESEARCH TELEMETRY',
    description: 'Mastery analytics, misconception logs & scientific ablation metrics',
    icon: <LineChart className="w-5 h-5" />,
    color: '#c084fc',
    glowColor: 'rgba(192, 132, 252, 0.65)',
    side: 'right',
    slotIndex: 2,
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'MODEL CONFIG',
    description: 'Gemini cloud API, local offline model switcher & voice configs',
    icon: <SettingsIcon className="w-5 h-5" />,
    color: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.65)',
    side: 'right',
    slotIndex: 3,
  },
];

const allNavItems = [...leftNavItems, ...rightNavItems];

export const BrainNavigationRing: React.FC<BrainNavigationRingProps> = ({
  isVisible,
  onSelectSection,
  selectedSection,
}) => {
  const [hoveredId, setHoveredId] = useState<NavSection | null>(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const hasSelection = selectedSection !== null;

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isVisible) return null;

  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  // Responsive lateral offset ensuring labels stay outside the brain and inside screen
  // Brain radius ~ 190-220px. Base lateral offset placed at 340px to 480px.
  const isCompactScreen = dimensions.width < 1024;
  const lateralBaseOffset = Math.min(
    480,
    Math.max(280, dimensions.width * (isCompactScreen ? 0.34 : 0.31))
  );

  // Vertical offsets for Left Column (3 items: slots 0, 1, 2)
  const leftYOffsets = [-160, 0, 160];
  // Arc curvature for Left Column (middle item slightly further out)
  const leftXOffsets = [-lateralBaseOffset, -(lateralBaseOffset + 35), -lateralBaseOffset];

  // Vertical offsets for Right Column (4 items: slots 0, 1, 2, 3)
  const rightYOffsets = [-190, -65, 65, 190];
  // Arc curvature for Right Column (middle items slightly further out)
  const rightXOffsets = [
    lateralBaseOffset,
    lateralBaseOffset + 35,
    lateralBaseOffset + 35,
    lateralBaseOffset,
  ];

  // Brain attachment origin coordinates for neural SVG lines
  const brainLeftEdgeX = cx - Math.min(180, lateralBaseOffset * 0.45);
  const brainRightEdgeX = cx + Math.min(180, lateralBaseOffset * 0.45);

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden select-none animate-fadeIn">
      {/* 1. Animated Radial Energy Shockwave Rings Expanding Outward from Brain Center */}
      <div className="absolute w-44 h-44 rounded-full border border-cyan-400/60 pointer-events-none animate-ping opacity-60 shadow-[0_0_50px_rgba(0,240,255,0.4)]" />
      <div
        className="absolute w-72 h-72 rounded-full border border-purple-500/40 pointer-events-none animate-ping opacity-40 shadow-[0_0_70px_rgba(168,85,247,0.3)]"
        style={{ animationDuration: '2.5s', animationDelay: '0.4s' }}
      />

      {/* 2. SVG Holographic Neural Tendrils Connecting Brain to Left and Right Nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <defs>
          <filter id="neural-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {allNavItems.map((item) => (
            <linearGradient
              key={`grad-${item.id}`}
              id={`line-grad-${item.id}`}
              x1={item.side === 'left' ? '100%' : '0%'}
              y1="50%"
              x2={item.side === 'left' ? '0%' : '100%'}
              y2="50%"
            >
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
              <stop offset="60%" stopColor={item.color} stopOpacity="0.7" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0.9" />
            </linearGradient>
          ))}
        </defs>

        {/* Draw Left Side Neural Lines */}
        {leftNavItems.map((item) => {
          const x = cx + leftXOffsets[item.slotIndex];
          const y = cy + leftYOffsets[item.slotIndex];
          const nodeTargetX = x + 120; // right anchor of left card
          const nodeTargetY = y;
          const isHovered = hoveredId === item.id;
          const isSelected = selectedSection === item.id;
          const isDimmed = hasSelection && !isSelected;

          const controlX1 = brainLeftEdgeX - (brainLeftEdgeX - nodeTargetX) * 0.45;
          const controlY1 = cy;
          const controlX2 = nodeTargetX + 40;
          const controlY2 = nodeTargetY;

          return (
            <g
              key={`path-${item.id}`}
              className="transition-opacity duration-300"
              style={{ opacity: isDimmed ? 0.12 : isHovered || isSelected ? 1 : 0.65 }}
            >
              <path
                d={`M ${brainLeftEdgeX} ${cy} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${nodeTargetX} ${nodeTargetY}`}
                fill="none"
                stroke={`url(#line-grad-${item.id})`}
                strokeWidth={isHovered || isSelected ? '2.8' : '1.5'}
                strokeDasharray={isHovered ? 'none' : '4 4'}
                filter="url(#neural-glow)"
              />
              {/* Traveling Synaptic Energy Spark */}
              <circle r={isHovered ? '4.5' : '3'} fill={item.color} filter="url(#neural-glow)">
                <animateMotion
                  path={`M ${brainLeftEdgeX} ${cy} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${nodeTargetX} ${nodeTargetY}`}
                  dur={isHovered ? '1.2s' : '2.6s'}
                  repeatCount="indefinite"
                  keyPoints={isSelected ? '1;0' : '0;1'}
                  keyTimes="0;1"
                />
              </circle>
            </g>
          );
        })}

        {/* Draw Right Side Neural Lines */}
        {rightNavItems.map((item) => {
          const x = cx + rightXOffsets[item.slotIndex];
          const y = cy + rightYOffsets[item.slotIndex];
          const nodeTargetX = x - 120; // left anchor of right card
          const nodeTargetY = y;
          const isHovered = hoveredId === item.id;
          const isSelected = selectedSection === item.id;
          const isDimmed = hasSelection && !isSelected;

          const controlX1 = brainRightEdgeX + (nodeTargetX - brainRightEdgeX) * 0.45;
          const controlY1 = cy;
          const controlX2 = nodeTargetX - 40;
          const controlY2 = nodeTargetY;

          return (
            <g
              key={`path-${item.id}`}
              className="transition-opacity duration-300"
              style={{ opacity: isDimmed ? 0.12 : isHovered || isSelected ? 1 : 0.65 }}
            >
              <path
                d={`M ${brainRightEdgeX} ${cy} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${nodeTargetX} ${nodeTargetY}`}
                fill="none"
                stroke={`url(#line-grad-${item.id})`}
                strokeWidth={isHovered || isSelected ? '2.8' : '1.5'}
                strokeDasharray={isHovered ? 'none' : '4 4'}
                filter="url(#neural-glow)"
              />
              {/* Traveling Synaptic Energy Spark */}
              <circle r={isHovered ? '4.5' : '3'} fill={item.color} filter="url(#neural-glow)">
                <animateMotion
                  path={`M ${brainRightEdgeX} ${cy} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${nodeTargetX} ${nodeTargetY}`}
                  dur={isHovered ? '1.2s' : '2.6s'}
                  repeatCount="indefinite"
                  keyPoints={isSelected ? '1;0' : '0;1'}
                  keyTimes="0;1"
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* 3. Holographic Interactive Node Buttons: LEFT COLUMN */}
      {leftNavItems.map((item, index) => {
        const x = cx + leftXOffsets[item.slotIndex];
        const y = cy + leftYOffsets[item.slotIndex];
        const isHovered = hoveredId === item.id;
        const isSelected = selectedSection === item.id;
        const isDimmed = hasSelection && !isSelected;

        return (
          <div
            key={item.id}
            className="absolute z-20 pointer-events-auto transition-all duration-300"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-50%, -50%)',
              opacity: isDimmed ? 0.15 : 1,
              animation: `fadeIn 0.5s ease-out forwards ${index * 0.1}s`,
            }}
          >
            <button
              onClick={() => onSelectSection(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`relative group p-3.5 rounded-2xl glass-panel border transition-all duration-300 flex items-center gap-3.5 select-none text-left backdrop-blur-2xl cursor-pointer min-w-[210px] ${
                isSelected
                  ? 'scale-115 border-white shadow-[0_0_50px_rgba(255,255,255,0.85)] bg-slate-900/95 ring-2 ring-cyan-400'
                  : isHovered
                  ? 'scale-108 bg-slate-900/90 shadow-[0_0_30px_var(--glow)] -translate-x-1.5'
                  : 'bg-slate-950/80 border-cyan-500/30 hover:border-cyan-400/70 shadow-lg'
              }`}
              style={
                {
                  borderColor: isHovered || isSelected ? item.color : undefined,
                  '--glow': item.glowColor,
                } as React.CSSProperties
              }
            >
              {/* Glowing Node Icon Bulb */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${item.color}25`,
                  borderColor: item.color,
                  color: item.color,
                  boxShadow: isHovered
                    ? `0 0 20px ${item.color}, inset 0 0 10px ${item.color}40`
                    : `0 0 10px ${item.color}30`,
                }}
              >
                {item.icon}
              </div>

              {/* Node Label Text */}
              <div className="pr-1">
                <div className="text-[10px] font-mono tracking-widest uppercase font-bold text-slate-400 flex items-center gap-1.5">
                  <span>{item.subtitle}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-ping"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
                <div className="text-sm font-bold text-white tracking-wide group-hover:text-glow-cyan">
                  {item.title}
                </div>
              </div>

              {/* Hover Tooltip Description */}
              {isHovered && (
                <div
                  className="absolute left-1/2 -bottom-14 -translate-x-1/2 whitespace-nowrap px-3.5 py-1.5 rounded-xl bg-slate-950/95 border border-cyan-400/60 text-xs text-cyan-200 font-medium backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.35)] animate-fadeIn z-30 pointer-events-none flex items-center gap-2"
                  style={{ borderColor: item.color }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                  <span>{item.description}</span>
                </div>
              )}
            </button>
          </div>
        );
      })}

      {/* 4. Holographic Interactive Node Buttons: RIGHT COLUMN */}
      {rightNavItems.map((item, index) => {
        const x = cx + rightXOffsets[item.slotIndex];
        const y = cy + rightYOffsets[item.slotIndex];
        const isHovered = hoveredId === item.id;
        const isSelected = selectedSection === item.id;
        const isDimmed = hasSelection && !isSelected;

        return (
          <div
            key={item.id}
            className="absolute z-20 pointer-events-auto transition-all duration-300"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-50%, -50%)',
              opacity: isDimmed ? 0.15 : 1,
              animation: `fadeIn 0.5s ease-out forwards ${0.2 + index * 0.1}s`,
            }}
          >
            <button
              onClick={() => onSelectSection(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`relative group p-3.5 rounded-2xl glass-panel border transition-all duration-300 flex items-center gap-3.5 select-none text-left backdrop-blur-2xl cursor-pointer min-w-[210px] ${
                isSelected
                  ? 'scale-115 border-white shadow-[0_0_50px_rgba(255,255,255,0.85)] bg-slate-900/95 ring-2 ring-cyan-400'
                  : isHovered
                  ? 'scale-108 bg-slate-900/90 shadow-[0_0_30px_var(--glow)] translate-x-1.5'
                  : 'bg-slate-950/80 border-cyan-500/30 hover:border-cyan-400/70 shadow-lg'
              }`}
              style={
                {
                  borderColor: isHovered || isSelected ? item.color : undefined,
                  '--glow': item.glowColor,
                } as React.CSSProperties
              }
            >
              {/* Glowing Node Icon Bulb */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${item.color}25`,
                  borderColor: item.color,
                  color: item.color,
                  boxShadow: isHovered
                    ? `0 0 20px ${item.color}, inset 0 0 10px ${item.color}40`
                    : `0 0 10px ${item.color}30`,
                }}
              >
                {item.icon}
              </div>

              {/* Node Label Text */}
              <div className="pr-1">
                <div className="text-[10px] font-mono tracking-widest uppercase font-bold text-slate-400 flex items-center gap-1.5">
                  <span>{item.subtitle}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-ping"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
                <div className="text-sm font-bold text-white tracking-wide group-hover:text-glow-cyan">
                  {item.title}
                </div>
              </div>

              {/* Hover Tooltip Description */}
              {isHovered && (
                <div
                  className="absolute left-1/2 -bottom-14 -translate-x-1/2 whitespace-nowrap px-3.5 py-1.5 rounded-xl bg-slate-950/95 border border-cyan-400/60 text-xs text-cyan-200 font-medium backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.35)] animate-fadeIn z-30 pointer-events-none flex items-center gap-2"
                  style={{ borderColor: item.color }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                  <span>{item.description}</span>
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};
