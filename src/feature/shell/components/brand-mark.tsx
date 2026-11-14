export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <rect width="1024" height="1024" rx="224" fill="#2a2d32" />
      <path
        d="M470 770V420C470 320 530 262 650 262"
        fill="none"
        stroke="#fff"
        strokeWidth="96"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M360 478H600" fill="none" stroke="#fff" strokeWidth="96" strokeLinecap="round" />
      <circle cx="640" cy="742" r="62" fill="#8b5cf6" />
    </svg>
  );
}
