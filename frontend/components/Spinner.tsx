/**
 * The app's loading spinner. `page` centers it in a full-height screen.
 * `className` replaces the default color, e.g. `text-white` inside a dark button.
 */
export default function Spinner({ size = 32, page = false, className = 'text-brand-deep' }: { size?: number; page?: boolean; className?: string }) {
  const svg = (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
  return page ? <div className="min-h-screen flex items-center justify-center">{svg}</div> : svg
}
