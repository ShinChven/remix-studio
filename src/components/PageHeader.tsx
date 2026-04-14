import React from 'react';
import { Link } from 'react-router-dom';
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
    <h2 className={`
      font-bold text-neutral-900 dark:text-white mb-2 font-display tracking-tight
      ${isLarge ? 'text-2xl md:text-4xl' : 'text-2xl md:text-3xl'}
    `}>
      {title}
    </h2>
  );

  const backEl = backLink && (
    <div className="mb-4">
      {backLink.to ? (
        <Link
          to={backLink.to}
          className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {backLink.label}
        </Link>
      ) : (
        <button
          onClick={backLink.onClick}
          className="text-sm text-neutral-500 dark:text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {backLink.label}
        </button>
      )}
    </div>
  );

  return (
    <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 ${isLarge ? 'mb-8 md:mb-12' : 'mb-6 md:mb-8'} ${className}`}>
      <header className={`flex-1 min-w-0 ${headerClassName}`}>
        {backEl}
        {titleEl}
        {description && (
          <div className={`text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed ${!isLarge ? 'max-w-2xl' : ''}`}>
            {description}
          </div>
        )}
      </header>

      {actions && (
        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
