import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'default' | 'yellow' | 'success' | 'error' | 'warning';
  badge?: React.ReactNode;
}

const TONE_ICON_STYLES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'border-[#303030] bg-[#242424] text-[#F5F5F5]',
  yellow: 'border-[#FACC15]/35 bg-[#FACC15]/10 text-[#FACC15]',
  success: 'border-[#22C55E]/35 bg-[#22C55E]/10 text-[#22C55E]',
  error: 'border-[#EF4444]/35 bg-[#EF4444]/10 text-[#EF4444]',
  warning: 'border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#F59E0B]',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
  badge,
}) => {
  return (
    <div className="sr-card flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[#A3A3A3]">
          {title}
        </span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border ${TONE_ICON_STYLES[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-[#F5F5F5]">{value}</div>
        {badge}
      </div>

      {subtitle && <div className="mt-1.5 text-xs text-[#A3A3A3]">{subtitle}</div>}
    </div>
  );
};
