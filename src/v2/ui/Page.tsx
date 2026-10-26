import type { HTMLAttributes, ReactNode } from 'react';
import { Button, cx, Icon, LoadingIndicator, Shape, Text, type MaterialShapeName } from '../../m3';

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  /** `wide` uses the full width of the window; `default` caps the line length of forms and lists. */
  width?: 'default' | 'wide' | 'narrow' | 'full';
  /** `compact` tightens every control on the page (busy editors and tables). */
  density?: 'compact';
}

/** Page body inside the scaffold: consistent gutters, max width and optional compact density. */
export function Page({ width = 'wide', density, className, children, ...rest }: PageProps) {
  return (
    <div {...rest} className={cx('v2-page', className)} data-width={width} data-density={density}>
      {children}
    </div>
  );
}

export interface BackLink {
  to?: string;
  label: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Trailing actions, end-aligned on wide windows and wrapped under the title on narrow ones. */
  actions?: ReactNode;
  backLink?: BackLink;
  /** `large` for top-level destinations, `default` for nested pages. */
  size?: 'default' | 'large';
  /** Content between the title row and the page body (tabs, filters). */
  children?: ReactNode;
  className?: string;
}

/** Title block of a page: back link, emphasized headline, description and actions. */
export function PageHeader({ title, description, actions, backLink, size = 'default', children, className }: PageHeaderProps) {
  return (
    <header className={cx('v2-page-header', className)} data-size={size}>
      {backLink && (
        <div className="v2-page-header__back">
          <Button
            variant="text"
            size="xs"
            icon="arrow_back"
            {...(backLink.to !== undefined ? { href: backLink.to } : { onClick: backLink.onClick })}
          >
            {backLink.label}
          </Button>
        </div>
      )}
      <div className="v2-page-header__row">
        <div className="v2-page-header__titles">
          <Text
            as="h1"
            variant={size === 'large' ? 'headline-large' : 'headline-medium'}
            emphasized
            className="v2-page-header__title"
          >
            {title}
          </Text>
          {description && (
            <Text as="div" variant="body-medium" className="v2-page-header__description">
              {description}
            </Text>
          )}
        </div>
        {actions && <div className="v2-page-header__actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Container style: `plain` (no container), `card` (surface container), `outlined`. */
  variant?: 'plain' | 'card' | 'outlined' | 'tonal';
}

/** A titled group of content, optionally in a surface container. */
export function Section({ title, description, icon, actions, variant = 'plain', className, children, ...rest }: SectionProps) {
  return (
    <section {...rest} className={cx('v2-section', className)} data-variant={variant}>
      {(title || actions) && (
        <div className="v2-section__head">
          {icon && <span className="v2-section__icon">{typeof icon === 'string' ? <Icon name={icon} /> : icon}</span>}
          <div className="v2-section__titles">
            {title && (
              <Text as="h2" variant="title-medium" emphasized>
                {title}
              </Text>
            )}
            {description && (
              <Text as="div" variant="body-small" className="text-on-surface-variant">
                {description}
              </Text>
            )}
          </div>
          {actions && <div className="v2-section__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Centered loading indicator for a region that is waiting for data. */
export function LoadingState({ label, className, minHeight = 240 }: { label?: string; className?: string; minHeight?: number }) {
  return (
    <div className={cx('v2-state', className)} style={{ minHeight }} role="status" aria-live="polite">
      <LoadingIndicator contained aria-label={label} />
      {label && (
        <Text variant="body-medium" className="text-on-surface-variant">
          {label}
        </Text>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Material shape behind the icon. */
  shape?: MaterialShapeName;
  icon?: string;
  action?: ReactNode;
  className?: string;
  /** `inline` for small regions such as an empty carousel row. */
  size?: 'default' | 'inline';
}

/** Empty or zero state: an icon on an expressive shape, a short title and an optional action. */
export function EmptyState({ title, description, shape = 'cookie-9', icon = 'inbox', action, className, size = 'default' }: EmptyStateProps) {
  return (
    <div className={cx('v2-state v2-empty', className)} data-size={size}>
      <span className="v2-empty__art" aria-hidden>
        <Shape name={shape} size={size === 'inline' ? 56 : 96} className="v2-empty__shape" />
        <span className="material-symbols-outlined v2-empty__icon">{icon}</span>
      </span>
      <Text variant={size === 'inline' ? 'title-small' : 'title-medium'} emphasized>
        {title}
      </Text>
      {description && (
        <Text variant="body-medium" className="max-w-md text-center text-on-surface-variant">
          {description}
        </Text>
      )}
      {action}
    </div>
  );
}

/** Inline error message with an optional retry. */
export function ErrorState({ message, onRetry, retryLabel }: { message: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="v2-error" role="alert">
      <span className="material-symbols-outlined">error</span>
      <Text as="div" variant="body-medium" className="flex-1">
        {message}
      </Text>
      {onRetry && (
        <Button variant="text" size="xs" onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </Button>
      )}
    </div>
  );
}
