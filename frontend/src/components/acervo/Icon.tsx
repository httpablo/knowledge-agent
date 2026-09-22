const ICON_PATHS = {
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17.2v.1'],
  eye: [
    'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z',
    'M12 15a3 3 0 100-6 3 3 0 000 6z',
  ],
  'eye-off': [
    'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94',
    'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19',
    'M14.12 14.12a3 3 0 1 1-4.24-4.24',
    'M1 1l22 22',
  ],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z', 'M12 7v5l3 2'],
  upload: ['M12 16V4', 'M8 8l4-4 4 4', 'M5 20h14'],
  file: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  logout: ['M10 4H5v16h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  send: ['M12 19V5', 'M6 11l6-6 6 6'],
  stop: ['M7 7h10v10H7z'],
} as const

export type IconName = keyof typeof ICON_PATHS

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
