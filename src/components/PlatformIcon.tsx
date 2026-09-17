type Platform = 'macos' | 'windows' | 'linux'

export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const svgProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    'aria-hidden': true as const,
    className: 'shrink-0',
  }

  if (platform === 'macos') {
    return (
      <svg {...svgProps}>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    )
  }

  if (platform === 'windows') {
    return (
      <svg {...svgProps}>
        <path d="M3 5.5 10.5 4.2v7.6H3V5.5zm8.5-.9L21 2.5v9.2h-9.5V4.6zM3 13.8h7.5v7.6L3 20.1v-6.3zm9.5 0H21v9.2l-8.5-1.5v-7.7z" />
      </svg>
    )
  }

  return (
    <svg {...svgProps} className="platform-icon platform-icon-linux shrink-0" fill="none">
      <path
        fill="#2c2c2c"
        d="M12 1.5C6.2 1.5 1.5 6.4 1.5 12.3c0 2.3.7 4.4 2 6.1-1.2 1.1-2 2.7-2 4.4 0 1.5.9 2.8 2.2 3.3.4-.3.9-.5 1.4-.6.6-1.9 2.1-3.3 3.9-3.8.5 1.4 1.6 2.3 2.9 2.3s2.4-.9 2.9-2.3c1.8.5 3.3 1.9 3.9 3.8.5.1 1 .3 1.4.6 1.3-.5 2.2-1.8 2.2-3.3 0-1.7-.8-3.3-2-4.4 1.3-1.7 2-3.8 2-6.1C22.5 6.4 17.8 1.5 12 1.5z"
      />
      <ellipse cx="12" cy="14.2" rx="4.2" ry="4.8" fill="#ffffff" />
      <ellipse cx="12" cy="9.2" rx="4.8" ry="4.2" fill="#ffffff" />
      <ellipse cx="12" cy="8.8" rx="3.4" ry="2.9" fill="#2c2c2c" />
      <circle cx="10.4" cy="8.3" r="0.85" fill="#ffffff" />
      <circle cx="13.6" cy="8.3" r="0.85" fill="#ffffff" />
      <circle cx="10.4" cy="8.3" r="0.42" fill="#2c2c2c" />
      <circle cx="13.6" cy="8.3" r="0.42" fill="#2c2c2c" />
      <path fill="#f0a020" d="M11.1 9.5h1.8v1.35h-1.8z" />
      <ellipse cx="6.2" cy="10.8" rx="2.1" ry="3.1" fill="#2c2c2c" transform="rotate(-18 6.2 10.8)" />
      <ellipse cx="17.8" cy="10.8" rx="2.1" ry="3.1" fill="#2c2c2c" transform="rotate(18 17.8 10.8)" />
      <ellipse cx="9.4" cy="20.6" rx="1.75" ry="0.85" fill="#f0a020" />
      <ellipse cx="14.6" cy="20.6" rx="1.75" ry="0.85" fill="#f0a020" />
    </svg>
  )
}
