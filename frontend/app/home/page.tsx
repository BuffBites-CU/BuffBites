'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useCombos } from '@/hooks/useCombos'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import DiningSelector from '@/components/DiningSelector'
import MealPeriodTabs from '@/components/MealPeriodTabs'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import MenuView from '@/components/MenuView'
import TrendingRail from '@/components/TrendingRail'
import Doodle from '@/components/Doodle'
import Spinner from '@/components/Spinner'
import SnapPlate from '@/components/SnapPlate'
import FuelPlanCard from '@/components/FuelPlanCard'
import { ArrowPathIcon, DevicePhoneMobileIcon } from '@/components/icons'
import { openInstallGuide } from '@/components/InstallPrompt'
import Image from 'next/image'
import Link from 'next/link'
import { logMeal, addFavorite, removeFavorite } from '@/services/usersService'
import { publishCombo, getUserCombos } from '@/services/communityService'
import { isoOffsetMST, isoToLocalNoon, currentMealPeriodMST } from '@/lib/date'
import { CLOSED_HALLS } from '@/types'
import type { Combo, CommunityCombo, DiningHall, MealPeriod, FavoriteCombo } from '@/types'

const HALL_ALTERNATES: Record<DiningHall, string> = {
  alley: 'C4C or Sewall', // closed until Aug 2028; kept for type completeness
  c4c: 'Sewall or Village Center',
  libby: 'C4C or Village Center',
  seec: 'C4C or Village Center',
  sewall: 'C4C or Libby',
  village_center: 'C4C or Sewall',
}

function buildDateOptions() {
  // Dates follow Mountain Time so "today" matches the dining halls' clock.
  return Array.from({ length: 7 }, (_, i) => {
    const iso = isoOffsetMST(i)
    const d = isoToLocalNoon(iso)
    const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
    const day = d.getDate()
    return { iso, label, day }
  })
}

type HomeView = 'combos' | 'menu'

export default function HomePage() {
  // Mount the page only once auth has resolved. By then AuthContext has loaded the
  // profile, so the saved hall, goals and preferences are in place before the first
  // combo request (a cold start used to generate C4C combos with no preferences first).
  const signedIn = useRequireAuth()
  const { profile, refreshProfile } = useAuth()
  const [profileTried, setProfileTried] = useState(false)
  // A failed first profile load gets one retry; after that Home runs with defaults.
  useEffect(() => {
    if (!signedIn || profile) return
    let alive = true
    refreshProfile().catch(() => {}).finally(() => { if (alive) setProfileTried(true) })
    return () => { alive = false }
  }, [signedIn, profile, refreshProfile])
  if (!signedIn || (!profile && !profileTried)) return <Spinner page />
  return <Home />
}

function Home() {
  const { firebaseUser, firebaseUid, username, profile, refreshProfile, defaultDiningHall } = useAuth()
  const { showToast } = useToast()

  // "Eat Now" — open straight to the meal period the dining hall is serving now.
  const nowPeriod = useMemo(() => currentMealPeriodMST(), [])

  const [selectedDining, setSelectedDining] = useState<DiningHall>(() => {
    // A saved default can point at a hall that has since closed (The Alley).
    const saved = defaultDiningHall as DiningHall | null
    return saved && !CLOSED_HALLS[saved] ? saved : 'c4c'
  })
  const [selectedPeriod, setSelectedPeriod] = useState<MealPeriod>(nowPeriod)
  const [view, setView] = useState<HomeView>('combos')
  const [activeCombo, setActiveCombo] = useState<Combo | null>(null)
  const [activeTrend, setActiveTrend] = useState<CommunityCombo | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [ateStates, setAteStates] = useState<Record<string, 'ate' | 'skipped'>>({})
  const [shareStates, setShareStates] = useState<Record<string, 'sharing' | 'shared'>>({})
  const [favorites, setFavorites] = useState<FavoriteCombo[]>(() => profile?.favorites ?? [])
  const [pastTitles] = useState(() => new Set((profile?.meal_log ?? []).map((e) => e.title)))
  const [loggedMealKeys] = useState(() => new Set((profile?.meal_log ?? []).map((e) => mealLogKey(e.dining_hall, e.date, e.meal_period, e.title))))
  const [postedComboKeys, setPostedComboKeys] = useState<Set<string>>(new Set())
  const dietaryPrefs = profile?.dietary_preferences ?? []
  const nutritionGoals = profile?.nutrition_goals ?? undefined
  const calorieTarget = profile?.preferred_calories_per_meal || undefined

  const dateOptions = useMemo(buildDateOptions, [])
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].iso)
  const selectedDateObj = dateOptions.find((d) => d.iso === selectedDate) ?? dateOptions[0]

  const { data, loading, error, refetch } = useCombos(selectedDining, selectedDate, nutritionGoals, dietaryPrefs)

  const combosForPeriod = data?.combos[selectedPeriod] ?? []
  const counts = useMemo(
    () => ({
      Breakfast: data?.combos.Breakfast.length ?? 0,
      Lunch: data?.combos.Lunch.length ?? 0,
      Dinner: data?.combos.Dinner.length ?? 0,
    }),
    [data],
  )

  // Load combos the user has already posted to the community, to keep "Post to community" disabled across reloads.
  useEffect(() => {
    if (!firebaseUid) return
    getUserCombos(firebaseUid).then((combos) => {
      setPostedComboKeys(new Set(combos.map((c) => comboPostKey(c.dining_hall, c.date, c.title))))
    }).catch(() => {})
  }, [firebaseUid])

  function ateKey(index: number) {
    return `${selectedDining}-${selectedDate}-${selectedPeriod}-${index}`
  }

  function mealLogKey(dining: string, date: string, period: string, title: string) {
    return `${dining}-${date}-${period}-${title}`
  }

  function comboPostKey(dining: string, date: string, title: string) {
    return `${dining}-${date}-${title}`
  }

  async function handleAte(combo: Combo, index: number) {
    if (!firebaseUid) return
    const key = ateKey(index)
    setAteStates((prev) => ({ ...prev, [key]: 'ate' }))
    try {
      await logMeal(firebaseUid, {
        title: combo.title,
        calories: combo.approximate_calories,
        protein_g: combo.approximate_protein_g || undefined,
        fat_g: combo.approximate_fat_g || undefined,
        carbs_g: combo.approximate_carbs_g || undefined,
        date: selectedDate,
        dining_hall: selectedDining,
        meal_period: selectedPeriod,
      })
      showToast(`Logged ${combo.approximate_calories} cal`, 'success')
      // Keep the shared profile current, so this meal still shows as logged when /home is opened again.
      refreshProfile().catch(() => {})
    } catch {
      setAteStates((prev) => { const n = { ...prev }; delete n[key]; return n })
      showToast('Failed to log meal', 'error')
    }
  }

  function handleSkip(index: number) {
    const key = ateKey(index)
    setAteStates((prev) => ({ ...prev, [key]: 'skipped' }))
  }

  async function handleFavorite(combo: Combo) {
    if (!firebaseUid) return
    const alreadyFav = favorites.some(
      (f) => f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate
    )
    if (alreadyFav) {
      setFavorites((prev) => prev.filter(
        (f) => !(f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate)
      ))
      removeFavorite(firebaseUid, combo.title, selectedDining, selectedDate).then(() => refreshProfile()).catch(() => {})
    } else {
      const fav: Omit<FavoriteCombo, 'saved_at'> = {
        title: combo.title,
        dining_hall: selectedDining,
        date: selectedDate,
        description: combo.description,
        approximate_calories: combo.approximate_calories,
        tags: combo.tags,
        dishes: combo.dishes,
      }
      setFavorites((prev) => [...prev, { ...fav, saved_at: new Date().toISOString() }])
      addFavorite(firebaseUid, fav).then(() => refreshProfile()).catch(() => {})
    }
  }

  async function handleShare(combo: Combo, index: number) {
    if (!firebaseUser) return
    const key = ateKey(index)
    setShareStates((prev) => ({ ...prev, [key]: 'sharing' }))
    try {
      const token = await firebaseUser.getIdToken()
      await publishCombo(
        {
          title: combo.title,
          dining_hall: selectedDining,
          date: selectedDate,
          dishes: combo.dishes.map((d) => ({ name: d.name, station: d.station, servings: 1 })),
          tags: combo.tags,
          description: combo.description,
          images: [],
        },
        token,
      )
      setShareStates((prev) => ({ ...prev, [key]: 'shared' }))
      showToast('Posted to community!', 'success')
    } catch {
      setShareStates((prev) => { const n = { ...prev }; delete n[key]; return n })
      showToast('Failed to post', 'error')
    }
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="app-header">
        <div className="max-w-md mx-auto px-4 pt-3 flex items-center gap-3">
          <Image src="/logoi.jpeg" alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover shadow-sticker" />
          <div className="min-w-0 flex-1">
            <span className="block font-display text-[22px] text-brand-black leading-none">Buff Bites</span>
            <span className="mt-1 block truncate text-[12px] text-muted">
              {isoToLocalNoon(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <button
            onClick={openInstallGuide}
            aria-label="How to add BuffBites to your home screen"
            className="pill-gold card-press !px-2.5"
          >
            <DevicePhoneMobileIcon width={14} height={14} />
            App
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            aria-label="Refresh combos"
            className="w-9 h-9 flex items-center justify-center rounded-full text-brand-black hover:bg-surface-overlay transition-colors disabled:opacity-40"
          >
            <ArrowPathIcon width={18} height={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Hall + day */}
        <div className="max-w-md mx-auto px-4 pt-2.5 pb-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <DiningSelector selected={selectedDining} onChange={setSelectedDining} />
          </div>
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            aria-expanded={showDatePicker}
            className="flex-shrink-0 flex items-center gap-1 rounded-xl font-display text-[16px] text-brand-black bg-surface-card shadow-soft px-3.5 py-2 card-press"
          >
            {selectedDateObj.label === 'Today' ? 'Today' : `${selectedDateObj.label} ${selectedDateObj.day}`}
            <svg className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {showDatePicker && (
          <div className="max-w-md mx-auto px-4 pb-2 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 w-max">
              {dateOptions.map((opt, i) => (
                <button
                  key={opt.iso}
                  onClick={() => { setSelectedDate(opt.iso); setShowDatePicker(false) }}
                  className={`flex flex-col items-center px-3.5 py-2 rounded-2xl font-display transition-all flex-shrink-0 animate-pop-in ${
                    opt.iso === selectedDate
                      ? 'bg-brand text-white'
                      : 'bg-surface-card text-muted shadow-soft'
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <span className="text-[13px] leading-none">{opt.label}</span>
                  <span className="text-xl leading-none mt-1">{opt.day}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto">
          <MealPeriodTabs
            selected={selectedPeriod}
            onChange={setSelectedPeriod}
            counts={counts}
            nowPeriod={selectedDate === dateOptions[0].iso ? nowPeriod : null}
          />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-3 animate-page-in">
        <p className="text-sm text-muted mb-3">
          <span className="plan-label !text-brand-black mr-1.5">Note</span>
          Hey{username ? ` ${username}` : ''}. {PERIOD_LINES[selectedPeriod]}
        </p>

        <SnapPlate
          dining={selectedDining}
          date={dateOptions[0].iso /* a plate photo is always today's meal */}
          period={selectedPeriod}
          firebaseUid={firebaseUid}
          calorieTarget={calorieTarget}
        />

        <FuelPlanCard dining={selectedDining} />

        <Link href="/social" className="card card-press mb-6 flex items-center gap-3 p-3.5">
          <Doodle name="plate" size={40} draw={false} className="text-brand-black flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[18px] leading-tight text-brand-black">Eating alone?</span>
            <span className="block text-[12px] text-muted">Join a table or open one at your hall.</span>
          </span>
          <span className="plan-label !text-brand-black flex-shrink-0">Find a table →</span>
        </Link>

        {/* Two big tiles, like Gallery / Camera in the reference */}
        <div className="grid grid-cols-2 gap-3 mb-6" role="tablist" aria-label="View">
          {([
            { v: 'combos', label: 'AI combos', doodle: 'bowl', room: 'Picked for you' },
            { v: 'menu', label: 'Full menu', doodle: 'plate', room: 'Every station' },
          ] as const).map(({ v, label, doodle, room }) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`card card-press flex items-center gap-2.5 px-3.5 py-3 text-left ring-2 transition-colors ${
                view === v ? 'ring-brand hatch' : 'ring-transparent'
              }`}
            >
              <Doodle name={doodle} size={32} draw={false} className="text-brand-black flex-shrink-0" />
              <span className="min-w-0">
                <span className="plan-label block">{room}</span>
                <span className="block font-display text-[18px] text-brand-black leading-tight">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {view === 'menu' && (
          <MenuView dining={selectedDining} date={selectedDate} period={selectedPeriod} />
        )}

        {view === 'combos' && <>
        <TrendingRail onOpen={setActiveTrend} />
        <SectionHeader title={`Your ${selectedPeriod.toLowerCase()} picks`} />
        {loading && <ComboSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">Tap to generate AI combos for today&apos;s menu.</p>
            <button
              onClick={refetch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              ✦ Generate combos
            </button>
          </div>
        )}

        {!loading && !error && combosForPeriod.length === 0 && data && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">🍽</span>
            <p className="text-sm font-medium text-brand-black">
              {selectedPeriod} isn&apos;t served here today.
            </p>
            <p className="text-sm text-muted">
              Try {HALL_ALTERNATES[selectedDining]} — both typically serve {selectedPeriod.toLowerCase()}.
            </p>
          </div>
        )}

        {!loading && !error && combosForPeriod.length > 0 && (
          <>
            <div className="space-y-3">
              {combosForPeriod.map((combo, i) => (
                <div
                  key={i}
                  className="animate-page-in"
                  style={{ animationDelay: `${i * 80}ms`, opacity: 0 }}
                >
                  <ComboCard
                    title={combo.title}
                    description={combo.description}
                    tags={combo.tags}
                    dishes={combo.dishes}
                    approximate_calories={combo.approximate_calories}
                    protein_g={combo.approximate_protein_g || undefined}
                    carbs_g={combo.approximate_carbs_g}
                    fat_g={combo.approximate_fat_g}
                    calorieTarget={calorieTarget}
                    onClick={() => setActiveCombo(combo)}
                    ateState={
                      ateStates[ateKey(i)] ??
                      (loggedMealKeys.has(mealLogKey(selectedDining, selectedDate, selectedPeriod, combo.title)) ? 'ate' : null)
                    }
                    onAte={() => handleAte(combo, i)}
                    onSkip={() => handleSkip(i)}
                    shareState={
                      shareStates[ateKey(i)] ??
                      (postedComboKeys.has(comboPostKey(selectedDining, selectedDate, combo.title)) ? 'shared' : null)
                    }
                    onShare={() => handleShare(combo, i)}
                    isFavorited={favorites.some(
                      (f) => f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate
                    )}
                    onFavorite={() => handleFavorite(combo)}
                    ateBeforeHint={pastTitles.has(combo.title)}
                  />
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-muted mt-5 mb-2 opacity-50">✦ Powered by Claude</p>
          </>
        )}
        </>}
      </div>

      {activeCombo && (
        <ComboDetail
          combo={activeCombo}
          type="ai"
          diningHall={selectedDining}
          date={selectedDate}
          onClose={() => setActiveCombo(null)}
        />
      )}

      {activeTrend && (
        <ComboDetail
          combo={activeTrend}
          type="community"
          onClose={() => setActiveTrend(null)}
        />
      )}
    </div>
  )
}

const PERIOD_LINES: Record<MealPeriod, string> = {
  Breakfast: 'Fuel up before that 8 AM.',
  Lunch: 'Midday refuel — between classes.',
  Dinner: 'Dinner plans, sorted.',
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-[24px] text-brand-black leading-tight">{title}</h2>
        </div>
      </div>
      <div className="dim-line mt-1.5" aria-hidden />
    </div>
  )
}

function ComboSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-brand-black/25 p-4 space-y-3 overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-4 shimmer rounded-full w-2/3" />
            <div className="h-4 shimmer rounded-full w-14" />
          </div>
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-full" />
            <div className="h-3 shimmer rounded-full w-4/5" />
          </div>
          <div className="border-t border-brand-black/25 pt-2.5">
            <div className="h-3 shimmer rounded-full w-3/4" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 shimmer rounded-full w-16" />
            <div className="h-5 shimmer rounded-full w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
