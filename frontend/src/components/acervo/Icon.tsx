const ICON_PATHS = {
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17.2v.1'],
} as const

type IconName = keyof typeof ICON_PATHS

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export default Icon
