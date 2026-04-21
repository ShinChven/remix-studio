import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  animateIcon?: boolean;
}

export function EmptyState({ Icon, title, description, animateIcon = true }: EmptyStateProps) {
  return (
    <div className="bg-white/40 dark:bg-neutral-900/40 border-2 border-dashed border-neutral-200/50 dark:border-white/5 rounded-3xl p-12 md:p-24 m-4 md:m-8 text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center gap-6 transition-colors hover:border-neutral-700 shadow-inner backdrop-blur-xl animate-in fade-in zoom-in duration-700">
      <Icon className={`w-16 h-16 text-neutral-800 dark:text-neutral-700 ${animateIcon ? 'animate-pulse' : 'opacity-20'}`} />
      <div>
        <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400 tracking-wider uppercase">
          {title}
        </p>
        <p className="text-[10px] font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-2 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
