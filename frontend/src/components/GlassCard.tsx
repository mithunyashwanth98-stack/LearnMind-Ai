import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: 'cyan' | 'violet' | 'amber' | 'blue' | 'none';
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  glowColor = 'cyan',
  onClick,
}) => {
  const getGlowClass = () => {
    switch (glowColor) {
      case 'cyan':
        return 'border-cyan-500/20 hover:border-cyan-400/50 shadow-[0_4px_24px_rgba(0,240,255,0.06)] hover:shadow-[0_8px_32px_rgba(0,240,255,0.14)]';
      case 'violet':
        return 'border-purple-500/20 hover:border-purple-400/50 shadow-[0_4px_24px_rgba(168,85,247,0.06)] hover:shadow-[0_8px_32px_rgba(168,85,247,0.14)]';
      case 'amber':
        return 'border-amber-500/20 hover:border-amber-400/50 shadow-[0_4px_24px_rgba(245,158,11,0.06)] hover:shadow-[0_8px_32px_rgba(245,158,11,0.14)]';
      case 'blue':
        return 'border-sky-500/20 hover:border-sky-400/50 shadow-[0_4px_24px_rgba(56,189,248,0.06)] hover:shadow-[0_8px_32px_rgba(56,189,248,0.14)]';
      default:
        return 'border-slate-800 hover:border-slate-700 shadow-none';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-3xl p-6 transition-all duration-300 relative overflow-hidden ${getGlowClass()} ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${className}`}
    >
      {/* Subtle top specular sheen reflection line */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />
      {children}
    </div>
  );
};

