'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useCombos } from '@/hooks/useCombos'
import DiningSelector from '@/components/DiningSelector'
import MealPeriodTabs from '@/components/MealPeriodTabs'
import ComboCard from '@/components/ComboCard'
import ComboDetail from '@/components/ComboDetail'
import MenuView from '@/components/MenuView'
import { ArrowPathIcon, DevicePhoneMobileIcon } from '@/components/icons'
import { openInstallGuide } from '@/components/InstallPrompt'
import Image from 'next/image'
import { logMeal, addFavorite, removeFavorite, getUser } from '@/services/usersService'
import { publishCombo, getUserCombos } from '@/services/communityService'
import { isoOffsetMST, isoToLocalNoon, currentMealPeriodMST } from '@/lib/date'
import type { Combo, DiningHall, MealPeriod, FavoriteCombo, NutritionGoals, DietaryPreference } from '@/types'

const HALL_ALTERNATES: Record<DiningHall, string> = {
  alley: 'C4C or Sewall',
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
  const router = useRouter()
  const { firebaseUser, firebaseUid, username, defaultDiningHall, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  // "Eat Now" — open straight to the meal period the dining hall is serving now.
  const nowPeriod = useMemo(() => currentMealPeriodMST(), [])

  const [selectedDining, setSelectedDining] = useState<DiningHall>(
    (defaultDiningHall as DiningHall | null) ?? 'c4c'
  )
  const [selectedPeriod, setSelectedPeriod] = useState<MealPeriod>(nowPeriod)
  const [view, setView] = useState<HomeView>('combos')
  const [activeCombo, setActiveCombo] = useState<Combo | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [ateStates, setAteStates] = useState<Record<string, 'ate' | 'skipped'>>({})
  const [shareStates, setShareStates] = useState<Record<string, 'sharing' | 'shared'>>({})
  const [favorites, setFavorites] = useState<FavoriteCombo[]>([])
  const [userRestrictions, setUserRestrictions] = useState<string[]>([])
  const [dietaryPrefs, setDietaryPrefs] = useState<DietaryPreference[]>([])
  const [pastTitles, setPastTitles] = useState<Set<string>>(new Set())
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals | undefined>()
  const [loggedMealKeys, setLoggedMealKeys] = useState<Set<string>>(new Set())
  const [postedComboKeys, setPostedComboKeys] = useState<Set<string>>(new Set())

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

  // Load user favorites + restrictions once on mount
  useEffect(() => {
    if (!firebaseUid) return
    getUser(firebaseUid).then((p) => {
      setFavorites(p.favorites ?? [])
      setUserRestrictions(p.restrictions ?? [])
      setDietaryPrefs((p.dietary_preferences ?? []) as DietaryPreference[])
      setPastTitles(new Set((p.meal_log ?? []).map((e) => e.title)))
      setLoggedMealKeys(new Set((p.meal_log ?? []).map((e) => mealLogKey(e.dining_hall, e.date, e.meal_period, e.title))))
      if (p.nutrition_goals) setNutritionGoals(p.nutrition_goals)
    }).catch(() => {})
  }, [firebaseUid])

  // Load combos the user has already posted to the community, to keep "Post to community" disabled across reloads.
  useEffect(() => {
    if (!firebaseUid) return
    getUserCombos(firebaseUid).then((combos) => {
      setPostedComboKeys(new Set(combos.map((c) => comboPostKey(c.dining_hall, c.date, c.title))))
    }).catch(() => {})
  }, [firebaseUid])

  useEffect(() => {
    if (authLoading) return
    if (!firebaseUid) router.replace('/')
  }, [firebaseUid, authLoading, router])

  function ateKey(combo: Combo, index: number) {
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
    const key = ateKey(combo, index)
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
    } catch {
      setAteStates((prev) => { const n = { ...prev }; delete n[key]; return n })
      showToast('Failed to log meal', 'error')
    }
  }

  function handleSkip(combo: Combo, index: number) {
    const key = ateKey(combo, index)
    setAteStates((prev) => ({ ...prev, [key]: 'skipped' }))
  }

  async function handleFavorite(combo: Combo, index: number) {
    if (!firebaseUid) return
    const key = ateKey(combo, index)
    const alreadyFav = favorites.some(
      (f) => f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate
    )
    if (alreadyFav) {
      setFavorites((prev) => prev.filter(
        (f) => !(f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate)
      ))
      removeFavorite(firebaseUid, combo.title, selectedDining, selectedDate).catch(() => {})
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
      addFavorite(firebaseUid, fav).catch(() => {})
    }
    void key
  }

  function getAllergyWarning(combo: Combo): string | undefined {
    if (userRestrictions.length === 0) return undefined
    const dishText = combo.dishes.map((d) => d.name.toLowerCase()).join(' ')
    const tagText = combo.tags.join(' ').toLowerCase()
    const matched = userRestrictions.filter((r) => {
      const rLower = r.toLowerCase()
      return dishText.includes(rLower) || tagText.includes(rLower)
    })
    return matched.length > 0 ? `May contain: ${matched.join(', ')}` : undefined
  }

  async function handleShare(combo: Combo, index: number) {
    if (!firebaseUser || !username) return
    const key = ateKey(combo, index)
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
        username,
      )
      setShareStates((prev) => ({ ...prev, [key]: 'shared' }))
      showToast('Posted to community!', 'success')
    } catch {
      setShareStates((prev) => { const n = { ...prev }; delete n[key]; return n })
      showToast('Failed to post', 'error')
    }
  }

  if (authLoading || !firebaseUid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-brand-gold" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-surface-warm">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
              <Image src="/logoi.jpeg" alt="BuffBites" width={28} height={28} className="object-cover w-full h-full" />
            </div>
            <span className="font-display text-[17px] font-bold text-brand-black tracking-tight leading-none">
              BuffBites
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openInstallGuide}
              aria-label="How to add BuffBites to your home screen"
              className="flex items-center gap-1 rounded-full bg-brand-gold/15 text-brand-gold ring-1 ring-brand-gold/30 px-2.5 py-1 hover:bg-brand-gold/25 transition-colors"
            >
              <DevicePhoneMobileIcon width={15} height={15} />
              <span className="text-[11px] font-semibold">Install</span>
            </button>
            <button
              onClick={() => setShowDatePicker((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted bg-surface-overlay rounded-full px-3 py-1.5 hover:bg-surface-warm transition-colors"
            >
              {selectedDateObj.label === 'Today' ? 'Today' : `${selectedDateObj.label} ${selectedDateObj.day}`}
              <svg className={`w-3 h-3 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={refetch}
              disabled={loading}
              aria-label="Refresh combos"
              className="p-1.5 rounded-full text-muted hover:text-brand-black hover:bg-surface-overlay transition-colors disabled:opacity-40"
            >
              <ArrowPathIcon width={17} height={17} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {showDatePicker && (
          <div className="max-w-md mx-auto px-4 pb-2 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 w-max">
              {dateOptions.map((opt) => (
                <button
                  key={opt.iso}
                  onClick={() => { setSelectedDate(opt.iso); setShowDatePicker(false) }}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-xs font-display font-semibold transition-all flex-shrink-0 ${
                    opt.iso === selectedDate
                      ? 'bg-brand-gold text-brand-black shadow-gold-sm'
                      : 'bg-surface-overlay text-muted hover:bg-surface-warm'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide">{opt.label}</span>
                  <span className="text-base font-bold leading-none mt-0.5">{opt.day}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dining hall picker + Combos/Menu toggle share a row to cut down on stacked rows */}
        <div className="max-w-md mx-auto px-4 pb-2 pt-1.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <DiningSelector selected={selectedDining} onChange={setSelectedDining} />
          </div>
          <div className="flex-shrink-0 flex gap-1 bg-surface-overlay rounded-full p-0.5">
            {(['combos', 'menu'] as HomeView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-display font-semibold tracking-wide transition-all whitespace-nowrap ${
                  view === v
                    ? 'bg-brand-black text-brand-gold'
                    : 'text-muted hover:text-brand-black'
                }`}
              >
                {v === 'combos' ? '✦ Combos' : 'Menu'}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-md mx-auto">
          <MealPeriodTabs
            selected={selectedPeriod}
            onChange={setSelectedPeriod}
            counts={counts}
            nowPeriod={selectedDate === dateOptions[0].iso ? nowPeriod : null}
          />
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4 animate-page-in">
        {view === 'menu' && (
          <MenuView dining={selectedDining} date={selectedDate} period={selectedPeriod} />
        )}

        {view === 'combos' && <>
        {loading && <ComboSkeletons />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-muted">{error}</p>
            <button
              onClick={refetch}
              className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-medium hover:opacity-90 transition-opacity"
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
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-gold text-brand-black text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : '✦ Generate combos'}
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
                    onClick={() => setActiveCombo(combo)}
                    ateState={
                      ateStates[ateKey(combo, i)] ??
                      (loggedMealKeys.has(mealLogKey(selectedDining, selectedDate, selectedPeriod, combo.title)) ? 'ate' : null)
                    }
                    onAte={(cal) => handleAte(combo, i)}
                    onSkip={() => handleSkip(combo, i)}
                    shareState={
                      shareStates[ateKey(combo, i)] ??
                      (postedComboKeys.has(comboPostKey(selectedDining, selectedDate, combo.title)) ? 'shared' : null)
                    }
                    onShare={() => handleShare(combo, i)}
                    isFavorited={favorites.some(
                      (f) => f.title === combo.title && f.dining_hall === selectedDining && f.date === selectedDate
                    )}
                    onFavorite={() => handleFavorite(combo, i)}
                    allergyWarning={getAllergyWarning(combo)}
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
    </div>
  )
}

function ComboSkeletons() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-gray-100 p-4 space-y-3 overflow-hidden">
          <div className="flex justify-between items-center">
            <div className="h-4 shimmer rounded-full w-2/3" />
            <div className="h-4 shimmer rounded-full w-14" />
          </div>
          <div className="space-y-2">
            <div className="h-3 shimmer rounded-full" />
            <div className="h-3 shimmer rounded-full w-4/5" />
          </div>
          <div className="border-t border-gray-50 pt-2.5">
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
