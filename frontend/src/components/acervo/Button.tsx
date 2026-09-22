import type { ButtonHTMLAttributes, ReactNode } from 'react'

import Icon from './Icon'
import type { IconName } from './Icon'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
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
  children?: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--accent)] text-[var(--on-accent)] hover:enabled:bg-[var(--accent-hover)]',
  secondary:
    'border-[var(--line-strong)] bg-[var(--paper-raised)] text-[var(--ink)] hover:enabled:bg-[var(--paper-sunken)]',
  ghost:
    'border-transparent bg-transparent text-[var(--ink)] hover:enabled:bg-[var(--paper-sunken)]',
}

function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconOnly,
  block,
  busy,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border font-[family-name:var(--font-sans)] font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--paper-sunken)] disabled:text-[var(--ink-muted)]',
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
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {!iconOnly && children}
    </button>
  )
}

export default Button
