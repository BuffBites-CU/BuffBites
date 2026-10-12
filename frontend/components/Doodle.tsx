'use client'

/**
 * Hand-drawn line-art food doodles (black strokes on white cards).
 *
 * Every shape has pathLength="1" so the `.doodle-draw` class in globals.css can
 * animate the stroke and make the drawing "sketch itself" on screen.
 */

import type { SVGProps } from 'react'

export type DoodleName =
  | 'burger' | 'pizza' | 'bowl' | 'salad' | 'taco' | 'icecream' | 'egg'
  | 'coffee' | 'sandwich' | 'skewer' | 'soup' | 'cake' | 'plate' | 'scan'

const S = { pathLength: 1 } as const

const DOODLES: Record<DoodleName, JSX.Element> = {
  burger: (
    <>
      <path {...S} d="M12 30c0-10 9-17 20-17s20 7 20 17c0 1.5-1 2.5-2.5 2.5h-35C13 32.5 12 31.5 12 30z" />
      <path {...S} d="M22 21.5l1.5 1M31 18.5l.5 1.6M40 21l1.4-.9M27 25.5l1.2.6M36 25l1.3.4" />
      <path {...S} d="M10 37c3-2.5 5 1.5 8-.5s5 2 8 0 5 2 8 0 5 2 8 0 5 2 8 0 4 1.5 4 1.5" />
      <path {...S} d="M13 41.5h38c1.5 0 2.5 1.2 2.5 2.6v.6c0 1.4-1 2.6-2.5 2.6H13c-1.5 0-2.5-1.2-2.5-2.6v-.6c0-1.4 1-2.6 2.5-2.6z" />
      <path {...S} d="M12.5 50.5h39c0 3.5-3 6-6.5 6h-26c-3.5 0-6.5-2.5-6.5-6z" />
    </>
  ),
  pizza: (
    <>
      <path {...S} d="M10 15c14-5 30-5 44 0L33 55c-.6 1.2-1.6 1.2-2.2 0z" />
      <path {...S} d="M12.5 21c12.5-4 26.5-4 39 0" />
      <circle {...S} cx="27" cy="28" r="3.6" />
      <circle {...S} cx="38" cy="31" r="3" />
      <circle {...S} cx="31.5" cy="41" r="2.8" />
      <path {...S} d="M22 34.5l1.6 1.2M41 24l1.2-1.4M35 47l-.6 1.5" />
    </>
  ),
  bowl: (
    <>
      <path {...S} d="M9 31h46c0 12-10 21-23 21S9 43 9 31z" />
      <path {...S} d="M24 52.5l-1.5 4h19l-1.5-4" />
      <path {...S} d="M15 31c2-4 5-4 7 0s5 4 7 0 5-4 7 0 5 4 7 0 5-4 6 0" />
      <path {...S} d="M38 25L55 8M42 27L58 13" />
      <path {...S} d="M22 22c-2-3 2-5 0-8M30 21c-2-3 2-5 0-8" />
    </>
  ),
  salad: (
    <>
      <path {...S} d="M8 32h48c0 11-10.5 20-24 20S8 43 8 32z" />
      <path {...S} d="M14 32c-2-6 3-10 8-8 1-5 8-7 11-3 3-4 10-3 11 2 5-1 9 3 7 9" />
      <path {...S} d="M24 31c1-3 3-4 5-4M36 31c0-3 2-5 4-5" />
      <circle {...S} cx="31" cy="27.5" r="2.4" />
      <path {...S} d="M26 52l-1 4h14l-1-4" />
    </>
  ),
  taco: (
    <>
      <path {...S} d="M8 46c0-14 10.7-25 24-25s24 11 24 25z" />
      <path {...S} d="M12 34c2-3 4-1 6-4s4-1 6-4 4-1 6-3 4 0 6-1 4 2 6 3 4 3 6 5 4 4 5 6" />
      <circle {...S} cx="22" cy="38" r="1.8" />
      <circle {...S} cx="33" cy="35" r="1.8" />
      <circle {...S} cx="43" cy="39" r="1.8" />
      <path {...S} d="M6 46h52" />
    </>
  ),
  icecream: (
    <>
      <path {...S} d="M21 31l11 27 11-27" />
      <path {...S} d="M24 38l13 6M26.5 45l8 3.5M40 38L27 44" />
      <path {...S} d="M19 31c-3-2-3-8 2-9 0-7 7-11 13-8 5-3 11 1 10 7 4 1 5 7 1 10z" />
      <path {...S} d="M31 10c0-3 3-5 5-4" />
      <circle {...S} cx="36.5" cy="6" r="1.6" />
    </>
  ),
  egg: (
    <>
      <path {...S} d="M15 34c-4-9 4-17 12-15 4-6 15-5 18 2 8 0 12 9 7 15 3 7-4 13-11 11-5 5-15 4-18-2-8 1-13-6-8-11z" />
      <circle {...S} cx="32" cy="34" r="7" />
      <path {...S} d="M29 31.5c1-1.5 2.5-2 4-1.7" />
    </>
  ),
  coffee: (
    <>
      <path {...S} d="M13 26h32l-3 26c-.3 2.5-2.3 4-4.7 4H20.7c-2.4 0-4.4-1.5-4.7-4z" />
      <path {...S} d="M45 31c5-1 8 2 7 6s-5 6-9 5" />
      <path {...S} d="M10 58h42" />
      <path {...S} d="M22 20c-2-3 2-5 0-9M30 20c-2-3 2-5 0-9M38 20c-2-3 2-5 0-9" />
    </>
  ),
  sandwich: (
    <>
      <path {...S} d="M10 40L32 14l22 26z" />
      <path {...S} d="M10 40c2 3 5 0 7 3s5 0 7 3 5 0 8 3 5 0 8-3 5 0 7-3 5 0 7-3" />
      <path {...S} d="M8 49h48c0 2.8-2.2 5-5 5H13c-2.8 0-5-2.2-5-5z" />
      <path {...S} d="M26 30l2 1.4M35 27l1.5 1M32 34l1.3 1.2" />
    </>
  ),
  skewer: (
    <>
      <path {...S} d="M8 56L56 8" />
      <path {...S} d="M17 39c-3-3-2-8 2-9s8 2 7 6-6 6-9 3z" />
      <path {...S} d="M27 29c-3-3-2-8 2-9s8 2 7 6-6 6-9 3z" />
      <path {...S} d="M37 19c-3-3-2-8 2-9s8 2 7 6-6 6-9 3z" />
      <path {...S} d="M24 44l3 3M14 49l2.6 2.6" />
    </>
  ),
  soup: (
    <>
      <path {...S} d="M8 30h48c0 12-10.5 21-24 21S8 42 8 30z" />
      <path {...S} d="M10 30c4-2 8 2 12 0s8 2 12 0 8 2 12 0 6 1 8 0" />
      <path {...S} d="M42 26c3-6 8-12 14-15" />
      <path {...S} d="M23 22c-2-3 2-5 0-8M31 22c-2-3 2-5 0-8" />
      <path {...S} d="M24 51l-1 4h18l-1-4" />
    </>
  ),
  cake: (
    <>
      <path {...S} d="M10 30l40-12v34H10z" />
      <path {...S} d="M10 30c3 4 6-1 9 3s6-1 9 3 6-1 9 3 6-1 9 2 4-2 4-2" />
      <path {...S} d="M10 41h40" />
      <path {...S} d="M33 15c0-4 3-7 6-6-1 3 1 5-1 7" />
      <circle {...S} cx="35" cy="12" r="1.4" />
    </>
  ),
  plate: (
    <>
      <circle {...S} cx="32" cy="34" r="19" />
      <circle {...S} cx="32" cy="34" r="12.5" />
      <path {...S} d="M6 18v9c0 2 1.5 3.5 3.5 3.5V56M9.5 18v9M13 18v9c0 2-1.5 3.5-3.5 3.5" />
      <path {...S} d="M58 18c-4 2-5 8-5 14h5v24" />
    </>
  ),
  scan: (
    <>
      <path {...S} d="M8 18v-6c0-2 1.6-4 4-4h6M46 8h6c2.4 0 4 2 4 4v6M56 46v6c0 2.4-1.6 4-4 4h-6M18 56h-6c-2.4 0-4-1.6-4-4v-6" />
      <path {...S} d="M17 34h30c0 8-6.7 14-15 14s-15-6-15-14z" />
      <path {...S} d="M22 34c1-4 4-5 6-2 2-4 6-4 8-1 3-3 7-1 6 3" />
      <path {...S} d="M47 14l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2zM14 40l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
}

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: DoodleName
  size?: number
  /** Animate the strokes drawing in when mounted. */
  draw?: boolean
}

export default function Doodle({ name, size = 64, draw = true, className = '', ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${draw ? 'doodle-draw' : ''} ${className}`}
      {...rest}
    >
      {DOODLES[name]}
    </svg>
  )
}

const RULES: Array<[RegExp, DoodleName]> = [
  [/pizza|italian|stone-fired|calzone|flatbread/, 'pizza'],
  [/burger|grill|smoke|bbq|fries|hot dog/, 'burger'],
  [/ramen|noodle|asia|stir|wok|pho|udon|rice bowl|teriyaki|curry/, 'bowl'],
  [/salad|green|wholesome|veggie|plant/, 'salad'],
  [/taco|latin|burrito|quesadilla|nacho|salsa|enchilada/, 'taco'],
  [/ice cream|gelato|soft serve|sundae|frozen/, 'icecream'],
  [/cake|cookie|brownie|dessert|pastr|pie|muffin|donut/, 'cake'],
  [/egg|omelet|breakfast|pancake|waffle|scramble|bacon|hash/, 'egg'],
  [/coffee|latte|espresso|tea|beverage|smoothie/, 'coffee'],
  [/sandwich|deli|sub|wrap|panini|toast|bagel|bread/, 'sandwich'],
  [/kabob|kebab|skewer|persia|shawarma|gyro|mediterr/, 'skewer'],
  [/soup|stew|chili|chowder|broth/, 'soup'],
]

/** Pick a doodle from any mix of station names, dish names or tags. */
export function doodleFor(...texts: Array<string | undefined>): DoodleName {
  const t = texts.filter(Boolean).join(' ').toLowerCase()
  for (const [re, name] of RULES) if (re.test(t)) return name
  return 'plate'
}
