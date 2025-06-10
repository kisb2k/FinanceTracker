import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 50"
      width="120"
      height="30"
      aria-label="FinTrack AI Logo"
      {...props}
    >
      <rect width="200" height="50" fill="transparent" />
      <text
        x="10"
        y="35"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="28"
        fontWeight="bold"
        fill="hsl(var(--primary))"
      >
        FinTrack
      </text>
      <text
        x="135"
        y="35"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="28"
        fontWeight="normal"
        fill="hsl(var(--accent))"
      >
        AI
      </text>
      <circle cx="130" cy="15" r="5" fill="hsl(var(--primary))" />
      <path d="M128 22 Q 130 28, 132 22" stroke="hsl(var(--accent))" strokeWidth="1.5" fill="none" />

    </svg>
  );
}
