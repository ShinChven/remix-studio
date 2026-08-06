import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { ArrowLeft } from 'lucide-react';

interface BackLink {
  to?: string;
  label: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backLink?: BackLink;
  size?: 'default' | 'large';
  className?: string;
  headerClassName?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  backLink,
  size = 'default',
  className = '',
  headerClassName = '',
}: PageHeaderProps) {
  const isLarge = size === 'large';

  const titleEl = (
    <h2 className={cn(
      "font-bold text-neutral-900 dark:text-white mb-1 md:mb-2 font-display tracking-tight",
      isLarge ? "text-xl md:text-4xl" : "text-xl md:text-3xl"
    )}>
      {title}
    </h2>
  );

  const backClassName =
    "text-xs md:text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 inline-flex items-center gap-1 transition-colors";

  const backEl = backLink && (
    <div className="mb-2 md:mb-4">
      {backLink.to ? (
        <Link to={backLink.to} className={backClassName}>
          <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" /> {backLink.label}
        </Link>
      ) : (
        <button onClick={backLink.onClick} className={backClassName}>
          <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" /> {backLink.label}
        </button>
      )}
    </div>
  );

  return (
    <div className={cn(
      "flex flex-col lg:flex-row lg:items-center justify-between gap-0 md:gap-6",
      isLarge ? "mb-5 md:mb-12" : "mb-4 md:mb-8",
      className
    )}>
      <header className={cn("flex-1 min-w-0 mb-3 lg:mb-0", headerClassName)}>
        {backEl}
        {titleEl}
        {description && (
          <div className={cn(
            "text-[13px] md:text-base text-neutral-700 dark:text-neutral-400 leading-snug md:leading-relaxed",
            !isLarge && "max-w-2xl"
          )}>
            {description}
          </div>
        )}
      </header>

      {actions && (
        <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
