import React from 'react';

interface InfoChipProps {
  children: React.ReactNode;
  className?: string;
}

export function InfoChip({ children, className = '' }: InfoChipProps) {
  return (
    <span
      className={`inline-flex h-5 items-center text-[8px] font-bold uppercase tracking-widest leading-none px-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 ${className}`.trim()}
    >
      {children}
    </span>
  );
}
