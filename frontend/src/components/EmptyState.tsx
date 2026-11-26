import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-[#303030] bg-[#141414] px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#303030] bg-[#1C1C1C] text-[#A3A3A3]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[#F5F5F5]">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-[#A3A3A3]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
