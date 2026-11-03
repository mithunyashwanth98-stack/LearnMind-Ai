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

interface NavigationItem {
  id: NavSection;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  angleDeg: number;
}

interface BrainNavigationRingProps {
  isVisible: boolean;
  onSelectSection: (section: NavSection) => void;
  selectedSection: NavSection | null;
}

const navItems: NavigationItem[] = [
  {
    id: 'knowledge',
    title: 'My Knowledge',
    subtitle: 'COGNITIVE MATRIX',
    description: 'Explore granular concept mastery, subject domains & misconceptions',
    icon: <BrainCircuit className="w-5 h-5" />,
    color: '#00f0ff',
    glowColor: 'rgba(0, 240, 255, 0.65)',
    angleDeg: -90, // Top
  },
  {
    id: 'tutor',
    title: 'AI Tutor',
    subtitle: 'HOLO-JARVIS VOICE',
    description: 'Multimodal voice tutor with step-by-step misconception remediation',
    icon: <Bot className="w-5 h-5" />,
    color: '#a855f7',
    glowColor: 'rgba(168, 85, 247, 0.65)',
    angleDeg: -38.5, // Top-Right
  },
  {
    id: 'syllabus',
    title: 'Syllabus',
    subtitle: 'PYMUPDF PARSER',
    description: 'Course curriculum upload, OCR extraction & unit structuring',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    color: '#38bdf8',
    glowColor: 'rgba(56, 189, 248, 0.65)',
    angleDeg: 12.8, // Bottom-Right
  },
  {
    id: 'assessment',
    title: 'Diagnostic Assessment',
    subtitle: 'BAYESIAN BETA TEST',
    description: 'Adaptive diagnostic probes testing conceptual misconception signatures',
    icon: <Activity className="w-5 h-5" />,
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.65)',
    angleDeg: 64.2, // Bottom-Center-Right
  },
  {
    id: 'learning-path',
    title: 'Learning Path',
    subtitle: 'NETWORKX PREREQUISITES',
    description: 'Topologically ordered roadmap targeting root cognitive gaps first',
    icon: <GitBranch className="w-5 h-5" />,
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.65)',
    angleDeg: 115.7, // Bottom-Center-Left
  },
  {
    id: 'progress',
    title: 'Progress',
    subtitle: 'RESEARCH TELEMETRY',
    description: 'Mastery analytics, misconception logs & scientific ablation metrics',
    icon: <LineChart className="w-5 h-5" />,
    color: '#c084fc',
    glowColor: 'rgba(192, 132, 252, 0.65)',
    angleDeg: 167.1, // Bottom-Left
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'MODEL CONFIG',
    description: 'Gemini cloud API, local offline model switcher & voice configs',
    icon: <SettingsIcon className="w-5 h-5" />,
    color: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.65)',
    angleDeg: 218.5, // Top-Left
  },
];

export const BrainNavigationRing: React.FC<BrainNavigationRingProps> = ({
  isVisible,
  onSelectSection,
  selectedSection,
}) => {
  const [hoveredId, setHoveredId] = useState<NavSection | null>(null);
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const hasSelection = selectedSection !== null;

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isVisible) return null;

  // Responsive orbital radii based on viewport size
  const rx = Math.min(460, Math.max(300, windowDimensions.width * 0.28));
  const ry = Math.min(290, Math.max(190, windowDimensions.height * 0.31));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
      {/* 1. Animated Radial Energy Shockwave Ring Expanding Outward from Brain Center */}
      <div className="absolute w-44 h-44 rounded-full border border-cyan-400/60 pointer-events-none animate-ping opacity-60 shadow-[0_0_50px_rgba(0,240,255,0.4)]" />
      <div
        className="absolute w-72 h-72 rounded-full border border-purple-500/40 pointer-events-none animate-ping opacity-40 shadow-[0_0_70px_rgba(168,85,247,0.3)]"
        style={{ animationDuration: '2.5s', animationDelay: '0.4s' }}
      />

      {/* 2. SVG Neural Connection Lines & Anchors Between Brain Surface and Nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <defs>
          <filter id="neuralGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {navItems.map((item) => {
          const rad = (item.angleDeg * Math.PI) / 180;
          const isHovered = hoveredId === item.id;
          const isSelected = selectedSection === item.id;
          const hasSelection = selectedSection !== null;

          // Target node center coordinates from center
          const tx = Math.cos(rad) * rx;
          const ty = Math.sin(rad) * ry;

          // Origin anchor point on brain surface (~85px from brain nucleus)
          const sx = Math.cos(rad) * 88;
          const sy = Math.sin(rad) * 88;

          // Cybernetic curvature control point
          const cx = Math.cos(rad) * (rx * 0.52);
          const cy = Math.sin(rad) * (ry * 0.52) + (rad > 0 ? 25 : -25);

          // If something else is selected, fade out this line
          const lineOpacity = hasSelection && !isSelected ? 0.08 : isSelected ? 1.0 : isHovered ? 0.9 : 0.28;

          return (
            <g key={item.id} className="transition-all duration-300" opacity={lineOpacity}>
              {/* Brain Surface Origin Synaptic Anchor Dot */}
              <circle
                cx={`calc(50% + ${sx}px)`}
                cy={`calc(50% + ${sy}px)`}
                r={isSelected ? '6' : isHovered ? '4.5' : '3'}
                fill={isSelected ? '#ffffff' : isHovered ? item.color : '#00f0ff'}
                filter="url(#neuralGlow)"
              />

              {/* Connecting Neural Tendril Path */}
              <path
                d={
                  isSelected
                    ? `M calc(50% + ${tx}px) calc(50% + ${ty}px) Q calc(50% + ${cx}px) calc(50% + ${cy}px), calc(50% + ${sx}px) calc(50% + ${sy}px)`
                    : `M calc(50% + ${sx}px) calc(50% + ${sy}px) Q calc(50% + ${cx}px) calc(50% + ${cy}px), calc(50% + ${tx}px) calc(50% + ${ty}px)`
                }
                fill="none"
                stroke={isSelected ? '#ffffff' : isHovered ? item.color : 'rgba(0, 240, 255, 0.35)'}
                strokeWidth={isSelected ? 3.5 : isHovered ? 2.8 : 1.2}
                strokeDasharray={isSelected || isHovered ? 'none' : '5 4'}
                filter={isSelected || isHovered ? 'url(#neuralGlow)' : undefined}
                className="transition-all duration-300"
              />

              {/* Action Potential Data Particle Pulsing Along the Line */}
              <circle
                r={isSelected ? '6' : isHovered ? '4.5' : '2.5'}
                fill={isSelected || isHovered ? '#ffffff' : item.color}
                filter="url(#neuralGlow)"
              >
                <animateMotion
                  path={
                    isSelected
                      ? `M calc(50% + ${tx}px) calc(50% + ${ty}px) Q calc(50% + ${cx}px) calc(50% + ${cy}px), calc(50% + ${sx}px) calc(50% + ${sy}px)`
                      : `M calc(50% + ${sx}px) calc(50% + ${sy}px) Q calc(50% + ${cx}px) calc(50% + ${cy}px), calc(50% + ${tx}px) calc(50% + ${ty}px)`
                  }
                  dur={isSelected ? '0.45s' : isHovered ? '0.85s' : '1.8s'}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* 3. Orbiting Holographic Navigation Node Pills */}
      <div className="relative w-full h-full flex items-center justify-center">
        {navItems.map((item, idx) => {
          const rad = (item.angleDeg * Math.PI) / 180;
          const x = Math.cos(rad) * rx;
          const y = Math.sin(rad) * ry;

          const isHovered = hoveredId === item.id;
          const isSelected = selectedSection === item.id;

          return (
            <div
              key={item.id}
              style={{
                transform: `translate(${x}px, ${y}px)`,
                animationDelay: `${idx * 85}ms`,
              }}
              className={`absolute pointer-events-auto transition-all duration-300 animate-fadeIn ${
                hasSelection && !isSelected ? 'opacity-15 pointer-events-none scale-90 blur-[1px]' : 'opacity-100'
              }`}
            >
              <button
                onClick={() => onSelectSection(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative group p-3.5 rounded-2xl glass-panel border transition-all duration-300 flex items-center gap-3.5 select-none text-left backdrop-blur-2xl ${
                  isSelected
                    ? 'scale-115 border-white shadow-[0_0_50px_rgba(255,255,255,0.85)] bg-slate-900/95 ring-2 ring-cyan-400'
                    : isHovered
                    ? 'scale-108 bg-slate-900/90 shadow-[0_0_30px_var(--glow)] -translate-y-1.5'
                    : 'bg-slate-950/75 border-cyan-500/30 hover:border-cyan-400/70 shadow-lg'
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
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:scale-110"
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
                <div className="pr-2">
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

                {/* Expanded Hover Tooltip Description */}
                {isHovered && (
                  <div
                    className="absolute left-1/2 -bottom-16 -translate-x-1/2 whitespace-nowrap px-4 py-2 rounded-xl bg-slate-950/95 border border-cyan-400/60 text-xs text-cyan-200 font-medium backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.35)] animate-fadeIn z-30 pointer-events-none flex items-center gap-2"
                    style={{ borderColor: item.color }}
                  >
                    <Sparkles className="w-4 h-4 text-cyan-400 animate-spin-slow" />
                    <span>{item.description}</span>
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
