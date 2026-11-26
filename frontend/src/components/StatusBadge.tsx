import React from 'react';

type BadgeVariant = 'success' | 'error' | 'warning' | 'yellow' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
}

const STYLES: Record<BadgeVariant, string> = {
  success: 'border-[#22C55E]/35 bg-[#22C55E]/15 text-[#4ADE80]',
  error: 'border-[#EF4444]/35 bg-[#EF4444]/15 text-[#FCA5A5]',
  warning: 'border-[#F59E0B]/35 bg-[#F59E0B]/15 text-[#FCD34D]',
  yellow: 'border-[#FACC15]/40 bg-[#FACC15]/15 text-[#FACC15]',
  neutral: 'border-[#303030] bg-[#242424] text-[#A3A3A3]',
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  success: 'bg-[#22C55E]',
  error: 'bg-[#EF4444]',
  warning: 'bg-[#F59E0B]',
  yellow: 'bg-[#FACC15]',
  neutral: 'bg-[#A3A3A3]',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  dot = false,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[variant]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[variant]}`} />}
      {label}
    </span>
  );
};
