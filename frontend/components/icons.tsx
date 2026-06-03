import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      width={24}
      height={24}
      {...props}
    >
      {children}
    </svg>
  )
}

/* ── Custom Brand Icons ───────────────────────────────────────── */

/** Bison head silhouette — the BuffBites mascot mark */
export function BisonIcon({
  size = 32,
  ...props
}: IconProps & { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 44"
      width={size}
      height={size}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Left horn */}
      <path d="M12 20 C10 12 7 4 8 3 C9 2 10 2 11 3 C13 6 15 14 16 20Z" />
      {/* Right horn */}
      <path d="M28 20 C30 12 33 4 32 3 C31 2 30 2 29 3 C27 6 25 14 24 20Z" />
      {/* Head — wide oval with slight forehead indent between horns */}
      <path d="M4 30 C4 23 8 18 14 17 C16 22 24 22 26 17 C32 18 36 23 36 30 C36 37 30 43 20 43 C10 43 4 37 4 30Z" />
    </svg>
  )
}

/** Full BuffBites logo: bison mark in a dark badge + wordmark */
export function BuffBitesLogo({
  badgeSize = 64,
  showWordmark = true,
  className = '',
}: {
  badgeSize?: number
  showWordmark?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Badge */}
      <div
        className="rounded-[22%] bg-brand-black flex items-center justify-center shadow-gold flex-shrink-0"
        style={{ width: badgeSize, height: badgeSize }}
      >
        <BisonIcon
          size={Math.round(badgeSize * 0.60)}
          className="text-brand-gold"
        />
      </div>

      {showWordmark && (
        <span
          className="font-display font-bold text-brand-black tracking-tight select-none"
          style={{ fontSize: Math.round(badgeSize * 0.56), lineHeight: 1 }}
        >
          BuffBites
        </span>
      )}
    </div>
  )
}

/** Inline wordmark only (no badge) — used in page headers */
export function BuffBitesWordmark({
  className = '',
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
  }[size]

  return (
    <span className={`font-display font-bold text-brand-black tracking-tight ${sizeClass} ${className}`}>
      BuffBites
    </span>
  )
}

/* ── Navigation Icons ────────────────────────────────────────── */

export function SparklesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </Icon>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </Icon>
  )
}

export function FireIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.468 5.99 5.99 0 00-1.925 3.547 5.975 5.975 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </Icon>
  )
}

export function UserCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </Icon>
  )
}

/* ── UI Icons ────────────────────────────────────────────────── */

export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </Icon>
  )
}

export function XMarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </Icon>
  )
}

export function PhotoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </Icon>
  )
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </Icon>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </Icon>
  )
}

export function ArrowPathIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </Icon>
  )
}
