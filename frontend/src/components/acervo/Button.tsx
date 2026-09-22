import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary'

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  variant?: ButtonVariant
  block?: boolean
  busy?: boolean
  children: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--accent)] text-[var(--on-accent)] hover:enabled:bg-[var(--accent-hover)]',
  secondary:
    'border-[var(--line-strong)] bg-[var(--paper-raised)] text-[var(--ink)] hover:enabled:bg-[var(--paper-sunken)]',
}

function Button({
  variant = 'primary',
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
        'inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-4 py-2 font-[family-name:var(--font-sans)] text-sm leading-5 font-medium transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-[var(--paper-sunken)] disabled:text-[var(--ink-muted)]',
        VARIANT_CLASSES[variant],
        block ? 'w-full' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}

export default Button
