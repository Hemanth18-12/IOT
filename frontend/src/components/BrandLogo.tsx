import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false }) => {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#FACC15]/40 bg-[#FACC15]/10">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#FACC15]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <rect x="9" y="10" width="6" height="5" rx="1" />
          <path d="M10 10V8.5a2 2 0 1 1 4 0V10" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-[#F5F5F5]">
            <span className="text-[#FACC15]">Smart</span>Room
          </div>
          <div className="text-[11px] font-medium text-[#A3A3A3]">
            IoT Control &amp; Security
          </div>
        </div>
      )}
    </div>
  );
};
