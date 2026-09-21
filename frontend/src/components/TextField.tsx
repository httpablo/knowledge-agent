import type { InputHTMLAttributes } from 'react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
}

function TextField({ id, label, ...input }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base hover:border-muted-foreground sm:text-sm"
      />
    </div>
  )
}

export default TextField
