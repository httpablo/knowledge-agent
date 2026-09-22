import type { ButtonHTMLAttributes, ReactNode } from 'react'

import Icon from './Icon'
import type { IconName } from './Icon'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'sm'

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconOnly?: boolean
  block?: boolean
  busy?: boolean
  tooltip?: string
  children?: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--accent)] text-[var(--on-accent)] hover:enabled:bg-[var(--accent-hover)]',
  secondary:
    'border-[var(--line-strong)] bg-[var(--paper-raised)] text-[var(--ink)] hover:enabled:bg-[var(--paper-sunken)]',
  ghost:
    'border-transparent bg-transparent text-[var(--ink)] hover:enabled:bg-[var(--paper-sunken)]',
  danger:
    'border-transparent bg-[var(--danger-soft)] text-[var(--danger)] hover:enabled:bg-[var(--danger)] hover:enabled:text-[var(--on-accent)]',
}

function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconOnly,
  block,
  busy,
  tooltip,
  type = 'button',
  className,
  children,
  'aria-label': ariaLabel,
  ...rest
}: ButtonProps) {
  const tooltipText = iconOnly ? (tooltip ?? ariaLabel) : undefined

  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      className={[
        'group relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border font-[family-name:var(--font-sans)] font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--paper-sunken)] disabled:text-[var(--ink-muted)]',
        size === 'sm'
          ? 'min-h-7 text-[13px] leading-4'
          : 'min-h-9 text-sm leading-5',
        iconOnly
          ? size === 'sm'
            ? 'w-7 px-1'
            : 'w-9 px-2'
          : size === 'sm'
            ? 'px-2.5 py-1'
            : 'px-4 py-2',
        VARIANT_CLASSES[variant],
        block ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
        />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />
      )}
      {!iconOnly && children}
      {tooltipText && (
        <span
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 hidden -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-2 py-1 font-[family-name:var(--font-sans)] text-xs leading-4 whitespace-nowrap text-[var(--paper)] group-hover:block group-focus-visible:block"
        >
          {tooltipText}
        </span>
      )}
    </button>
  )
}

export default Button
