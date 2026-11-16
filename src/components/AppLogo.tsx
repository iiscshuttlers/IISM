import type { SVGProps } from "react";

export function AppLogo({
  size = 32,
  className = "",
  rounded = true,
  ...props
}: {
  size?: number | string;
  className?: string;
  rounded?: boolean;
} & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="IISM Badminton Logo"
      {...props}
    >
      <defs>
        {/* Background Gradient */}
        <linearGradient id="iism-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="60%" stopColor="#115e59" />
          <stop offset="100%" stopColor="#042f2e" />
        </linearGradient>

        {/* Glow Accent Gradient */}
        <linearGradient id="iism-accent-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>

        {/* Feather Fill Gradient */}
        <linearGradient id="iism-feather-grad" x1="20%" y1="20%" x2="80%" y2="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ccfbf1" stopOpacity="0.85" />
        </linearGradient>

        {/* Cork Gradient */}
        <linearGradient id="iism-cork-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>

        {/* Speed Ribbon Gradient */}
        <linearGradient id="iism-speed-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      {/* Outer Squircle Container */}
      <rect
        width="100"
        height="100"
        rx={rounded ? "22" : "0"}
        fill="url(#iism-bg-grad)"
      />

      {/* Subtle Court Line / Ring */}
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#14b8a6"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        opacity="0.3"
      />

      {/* Motion Speed Trails */}
      <path
        d="M20 72 C 28 65, 38 62, 50 63"
        stroke="url(#iism-speed-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M26 80 C 35 76, 44 75, 54 77"
        stroke="url(#iism-speed-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M16 62 C 24 55, 36 53, 46 54"
        stroke="url(#iism-speed-grad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* Dynamic Badminton Shuttlecock Angled Top-Right (~45deg) */}
      <g transform="translate(6, -2)">
        {/* Feather Fan (4 overlapping aerodynamic vanes) */}
        {/* Left vane */}
        <path
          d="M 33 55 C 34 46, 42 34, 52 28 C 50 37, 44 48, 38 58 Z"
          fill="url(#iism-feather-grad)"
          opacity="0.8"
        />
        {/* Center-left vane */}
        <path
          d="M 40 59 C 43 48, 52 35, 63 26 C 60 37, 53 49, 46 62 Z"
          fill="url(#iism-feather-grad)"
        />
        {/* Center-right vane */}
        <path
          d="M 47 63 C 51 51, 62 38, 73 31 C 69 42, 60 53, 52 65 Z"
          fill="url(#iism-feather-grad)"
        />
        {/* Right vane */}
        <path
          d="M 53 66 C 59 56, 70 45, 80 40 C 74 49, 64 59, 56 68 Z"
          fill="url(#iism-feather-grad)"
          opacity="0.85"
        />

        {/* Binding Thread / Ribbon Across Feathers */}
        <path
          d="M 36 53 C 44 51, 57 53, 72 58"
          fill="none"
          stroke="#0f766e"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M 41 44 C 48 42, 59 44, 71 49"
          fill="none"
          stroke="#0d9488"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Feather Ribs / Quills */}
        <path d="M 43 65 L 53 30" stroke="#0d9488" strokeWidth="0.8" opacity="0.6" />
        <path d="M 48 68 L 64 28" stroke="#0d9488" strokeWidth="0.8" opacity="0.7" />
        <path d="M 53 70 L 73 33" stroke="#0d9488" strokeWidth="0.8" opacity="0.6" />

        {/* Cork Collar / Black Stripe */}
        <ellipse
          cx="44"
          cy="70"
          rx="6.5"
          ry="3"
          transform="rotate(-40 44 70)"
          fill="#042f2e"
        />

        {/* Rounded Cork Dome */}
        <path
          d="M 38 66 C 35 69, 36 75, 40 78 C 44 81, 50 80, 52 76 C 50 73, 44 68, 38 66 Z"
          fill="url(#iism-cork-grad)"
        />
        {/* Cork Specular Highlight */}
        <circle cx="42" cy="74" r="1.5" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Subtle Glowing Corner Crest */}
      <circle cx="82" cy="18" r="3" fill="url(#iism-accent-grad)" />
      <path
        d="M 82 12 L 82 24 M 76 18 L 88 18"
        stroke="#5eead4"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}
