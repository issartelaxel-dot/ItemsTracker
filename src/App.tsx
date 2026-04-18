import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import itemsData from './data/items.json'
import './App.css'

type Mastery = 'Mauvais' | 'Moyen' | 'Bon' | 'Très bon' | 'Parfait'
type Theme = 'light' | 'dark'
type SortKey = 'reviews' | 'progress'
type SheetColor = 'jaune' | 'rouge' | 'vert' | 'vertfonce'
type SheetKind = 'lisaSheets' | 'platformSheets'
type QuizAnimationStyle = 'flip' | 'fade'
type RewardIntensity = 'low' | 'medium' | 'high'
type QuizResult = 'again' | 'hard' | 'good' | 'easy'

type ItemBase = {
  itemNumber: number
  shortDescription: string
  tagCodes: string[]
  tagLabels: string[]
}

type ReviewEvent = {
  date: string
  delta: number
}

type ItemActionLog = {
  at: string
  action: string
}

type CollegeTracking = {
  favorite: boolean
  reviews: number
  mastery: Mastery
  comments: string
  lastReviewedAt: string | null
  reviewHistory: ReviewEvent[]
}

type ReferenceSheet = {
  id: string
  name: string
  url: string
  color: SheetColor
  tracking: CollegeTracking
}

type QuizCard = {
  id: string
  question: string
  answer: string
}

type QuizConfig = {
  enabled: boolean
  cards: QuizCard[]
  activeCardId: string | null
  animationStyle: QuizAnimationStyle
  showTags: boolean
  showColleges: boolean
  showNotes: boolean
  rewardIntensity: RewardIntensity
  updateProgressOnSuccess: boolean
}

type ItemTracking = {
  assignedColleges: string[]
  byCollege: Record<string, CollegeTracking>
  lisaSheets: ReferenceSheet[]
  platformSheets: ReferenceSheet[]
  noLisaSheets: boolean
  noPlatformSheets: boolean
  itemComment: string
  itemMastery: Mastery | 'Non évalué'
  itemIcon: string
  itemColor: string
  itemLabel: string
  lastQuizResult: QuizResult | null
  quizCount: number
  lastReviewDate: string | null
  quiz: QuizConfig
  actionLogs: ItemActionLog[]
}

type LegacyItemTracking = Partial<ItemTracking> & {
  last_quiz_result?: unknown
  quiz_count?: unknown
  last_review_date?: unknown
}

type TrackerState = {
  items: Record<number, ItemTracking>
}

type ProfileState = {
  firstName: string
  lastName: string
  email: string
  photoUrl: string
  password: string
  avatarGradient: string
}

type BackupPayload = {
  app: 'med-learning-tracker'
  version: 1
  exportedAt: string
  data: {
    trackingState: TrackerState
    theme: Theme
    focusMode: boolean
    profile?: ProfileState
  }
}

type ItemComputed = ItemBase & {
  tracking: ItemTracking
  totalReviews: number
  progress: number
  lastReviewDate: string | null
}

type AuthStatus = 'loading' | 'guest' | 'authed'
type AuthView = 'login' | 'register'
type AuthUser = {
  id: number
  email: string
  displayName: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const APP_BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
const AUTH_TOKEN_KEY = 'med-auth-token-v1'
const HABIT_TRACKER_YEAR = 2026
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #f90021 0%, #ff8f00 58%, #ffe400 100%)',
  'linear-gradient(135deg, #1d976c 0%, #93f9b9 100%)',
  'linear-gradient(135deg, #4776e6 0%, #8e54e9 100%)',
  'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
  'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
  'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
] as const
const SHEET_COLORS: Array<{ value: SheetColor; label: string; emoji: string }> = [
  { value: 'jaune', label: 'Jaune', emoji: '🟡' },
  { value: 'rouge', label: 'Rouge', emoji: '🔴' },
  { value: 'vert', label: 'Vert', emoji: '🟢' },
  { value: 'vertfonce', label: 'Vert fonce', emoji: '🟢' },
]

const MASTERY_LEVELS: Mastery[] = ['Mauvais', 'Moyen', 'Bon', 'Très bon', 'Parfait']
const MASTERY_SCORE: Record<Mastery, number> = {
  Mauvais: 0,
  Moyen: 1,
  Bon: 2,
  'Très bon': 3,
  Parfait: 4,
}

const QUIZ_RESULT_META: Record<
  QuizResult,
  { label: string; mastery: Mastery; icon: string; actionVerb: string; rewardTone: 'neutral' | 'good' | 'easy' }
> = {
  again: { label: 'Revoir', mastery: 'Mauvais', icon: '❌', actionVerb: 'à revoir', rewardTone: 'neutral' },
  hard: { label: 'Difficile', mastery: 'Moyen', icon: '⚠️', actionVerb: 'difficile', rewardTone: 'neutral' },
  good: { label: 'Bon', mastery: 'Bon', icon: '✅', actionVerb: 'bon', rewardTone: 'good' },
  easy: { label: 'Parfait', mastery: 'Parfait', icon: '⚡', actionVerb: 'parfait', rewardTone: 'easy' },
}

const COLLEGES = [
  'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES',
  'ANESTHÉSIE - RÉANIMATION',
  'CANCÉROLOGIE',
  'CHIRURGIE DIGESTIVE',
  'CHIRURGIE MAXILLO-FACIALE',
  'DERMATOLOGIE',
  'DOULEUR - SOINS PALLIATIFS',
  'ENDOCRINOLOGIE',
  'GÉNÉTIQUE',
  'GÉRIATRIE',
  'GYNÉCOLOGIE MÉDICALE',
  'GYNÉCOLOGIE OBSTÉTRIQUE',
  'HÉMATOLOGIE',
  'HÉPATO-GASTRO-ENTÉROLOGIE',
  'IMAGERIE MÉDICALE',
  'IMMUNOPATHOLOGIE',
  'INFECTIOLOGIE',
  'MÉDECINE CARDIOVASCULAIRE',
  'MÉDECINE GÉNÉRALE',
  'MÉDECINE INTENSIVE - RÉANIMATION - URGENCES',
  'MÉDECINE INTERNE',
  'MÉDECINE LÉGALE - MÉDECINE DU TRAVAIL',
  'MÉDECINE MOLÉCULAIRE',
  'MÉDECINE PHYSIQUE ET RÉADAPTATION',
  'MÉDECINE VASCULAIRE',
  'NÉPHROLOGIE',
  'NEUROCHIRURGIE',
  'NEUROLOGIE',
  'NUTRITION',
  'OPHTALMOLOGIE',
  'ORL',
  'ORTHOPÉDIE - TRAUMATOLOGIE',
  'PARASITOLOGIE',
  'PÉDIATRIE',
  'PNEUMOLOGIE',
  'PSYCHIATRIE - ADDICTOLOGIE',
  'RHUMATOLOGIE',
  'SANTÉ PUBLIQUE',
  'THÉRAPEUTIQUE',
  'UROLOGIE',
] as const

const rawItems = itemsData as ItemBase[]

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function resolveApiCandidates(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return [path]
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const candidates = new Set<string>()

  if (API_BASE_URL) {
    candidates.add(`${API_BASE_URL}${normalizedPath}`)
  } else {
    candidates.add(normalizedPath)
  }

  if (typeof window !== 'undefined') {
    candidates.add(`${window.location.origin}${normalizedPath}`)
    if (APP_BASE_URL && APP_BASE_URL !== '/') {
      candidates.add(`${window.location.origin}${APP_BASE_URL}${normalizedPath}`)
    }
  }

  return Array.from(candidates)
}

function getDefaultCollegeTracking(): CollegeTracking {
  return {
    favorite: false,
    reviews: 0,
    mastery: 'Mauvais',
    comments: '',
    lastReviewedAt: null,
    reviewHistory: [],
  }
}

function getDefaultQuizConfig(): QuizConfig {
  const defaultCardId = `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    enabled: true,
    cards: [{ id: defaultCardId, question: '', answer: '' }],
    activeCardId: defaultCardId,
    animationStyle: 'flip',
    showTags: true,
    showColleges: true,
    showNotes: false,
    rewardIntensity: 'medium',
    updateProgressOnSuccess: false,
  }
}

function makeQuizCard(partial?: Partial<QuizCard>): QuizCard {
  return {
    id: partial?.id ?? `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: partial?.question ?? '',
    answer: partial?.answer ?? '',
  }
}

function getDefaultItemTracking(): ItemTracking {
  return {
    assignedColleges: [],
    byCollege: {},
    lisaSheets: [],
    platformSheets: [],
    noLisaSheets: false,
    noPlatformSheets: false,
    itemComment: '',
    itemMastery: 'Non évalué',
    itemIcon: '',
    itemColor: '',
    itemLabel: '',
    lastQuizResult: null,
    quizCount: 0,
    lastReviewDate: null,
    quiz: getDefaultQuizConfig(),
    actionLogs: [],
  }
}

function makeReferenceSheet(): ReferenceSheet {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    url: '',
    color: 'jaune',
    tracking: getDefaultCollegeTracking(),
  }
}

function isQuizResult(value: unknown): value is QuizResult {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy'
}

function normalizeItemTracking(tracking?: Partial<ItemTracking>): ItemTracking {
  const rawTracking = tracking as LegacyItemTracking | undefined
  const normalizeSheet = (sheet: Partial<ReferenceSheet>) => ({
    id: sheet.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: sheet.name ?? '',
    url: sheet.url ?? '',
    color: (sheet.color ?? 'jaune') as SheetColor,
    tracking: {
      ...getDefaultCollegeTracking(),
      ...(sheet.tracking ?? {}),
    },
  })

  const rawQuiz = tracking?.quiz as Partial<QuizConfig> & { customQuestion?: unknown; customAnswer?: unknown } | undefined
  const fallbackCard = makeQuizCard({
    question: typeof rawQuiz?.customQuestion === 'string' ? rawQuiz.customQuestion : '',
    answer: typeof rawQuiz?.customAnswer === 'string' ? rawQuiz.customAnswer : '',
  })
  const normalizedCards =
    Array.isArray(rawQuiz?.cards) && rawQuiz.cards.length > 0
      ? rawQuiz.cards
          .filter((card) => Boolean(card && typeof card === 'object'))
          .map((card) => makeQuizCard(card))
      : [fallbackCard]
  const normalizedActiveCardId =
    typeof rawQuiz?.activeCardId === 'string' && normalizedCards.some((card) => card.id === rawQuiz.activeCardId)
      ? rawQuiz.activeCardId
      : normalizedCards[0]?.id ?? null

  const rawLastQuizResult =
    typeof rawTracking?.lastQuizResult === 'string'
      ? rawTracking.lastQuizResult
      : typeof rawTracking?.last_quiz_result === 'string'
        ? rawTracking.last_quiz_result
        : null
  const normalizedLastQuizResult = isQuizResult(rawLastQuizResult) ? rawLastQuizResult : null
  const rawQuizCount =
    typeof rawTracking?.quizCount === 'number'
      ? rawTracking.quizCount
      : typeof rawTracking?.quiz_count === 'number'
        ? rawTracking.quiz_count
        : 0
  const normalizedQuizCount = Number.isFinite(rawQuizCount) ? Math.max(0, Math.floor(rawQuizCount)) : 0
  const rawLastReviewDate =
    typeof rawTracking?.lastReviewDate === 'string'
      ? rawTracking.lastReviewDate
      : typeof rawTracking?.last_review_date === 'string'
        ? rawTracking.last_review_date
        : null

  return {
    assignedColleges: tracking?.assignedColleges ?? [],
    byCollege: tracking?.byCollege ?? {},
    lisaSheets: (tracking?.lisaSheets ?? []).map((sheet) => normalizeSheet(sheet)),
    platformSheets: (tracking?.platformSheets ?? []).map((sheet) => normalizeSheet(sheet)),
    noLisaSheets: tracking?.noLisaSheets ?? false,
    noPlatformSheets: tracking?.noPlatformSheets ?? false,
    itemComment: tracking?.itemComment ?? '',
    itemMastery:
      tracking?.itemMastery && MASTERY_LEVELS.includes(tracking.itemMastery as Mastery)
        ? (tracking.itemMastery as Mastery)
        : 'Non évalué',
    itemIcon: tracking?.itemIcon ?? '',
    itemColor: tracking?.itemColor ?? '',
    itemLabel: tracking?.itemLabel ?? '',
    lastQuizResult: normalizedLastQuizResult,
    quizCount: normalizedQuizCount,
    lastReviewDate: rawLastReviewDate ?? null,
    quiz: {
      ...getDefaultQuizConfig(),
      ...(rawQuiz ?? {}),
      cards: normalizedCards,
      activeCardId: normalizedActiveCardId,
    },
    actionLogs: Array.isArray(tracking?.actionLogs)
      ? tracking.actionLogs
          .filter((entry): entry is ItemActionLog => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            at: typeof entry.at === 'string' ? entry.at : new Date().toISOString(),
            action: typeof entry.action === 'string' ? entry.action : '',
          }))
          .filter((entry) => entry.action.trim().length > 0)
      : [],
  }
}

function appendActionLogs(itemTracking: ItemTracking, actions: string[]): ItemTracking {
  if (actions.length === 0) {
    return itemTracking
  }

  const now = new Date().toISOString()
  const newLogs = actions.map((action) => ({ at: now, action }))
  return {
    ...itemTracking,
    actionLogs: [...itemTracking.actionLogs, ...newLogs].slice(-200),
  }
}

function getNextSheetColor(current: SheetColor): SheetColor {
  const idx = SHEET_COLORS.findIndex((sheetColor) => sheetColor.value === current)
  if (idx === -1) {
    return SHEET_COLORS[0].value
  }
  return SHEET_COLORS[(idx + 1) % SHEET_COLORS.length].value
}

function getProfileInitials(profile: ProfileState): string {
  const first = (profile.firstName ?? '').trim()
  const last = (profile.lastName ?? '').trim()
  if (first || last) {
    return `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}` || 'ME'
  }

  const emailPart = (profile.email ?? '').split('@')[0].replace(/[^a-zA-Z0-9]/g, '')
  if (emailPart.length >= 2) {
    return emailPart.slice(0, 2).toUpperCase()
  }
  if (emailPart.length === 1) {
    return emailPart.toUpperCase()
  }
  return 'ME'
}

function computeItemProgress(itemTracking: ItemTracking): number {
  const excludeLisaAxis = itemTracking.noLisaSheets && itemTracking.lisaSheets.length === 0
  const excludePlatformAxis = itemTracking.noPlatformSheets && itemTracking.platformSheets.length === 0

  const hasPerfectCollege = itemTracking.assignedColleges.some((college) => {
    const tracking = itemTracking.byCollege[college]
    return tracking?.mastery === 'Parfait'
  })
  const hasPerfectLisa =
    excludeLisaAxis || itemTracking.lisaSheets.some((sheet) => sheet.tracking.mastery === 'Parfait')
  const hasPerfectPlatform =
    excludePlatformAxis || itemTracking.platformSheets.some((sheet) => sheet.tracking.mastery === 'Parfait')

  // If all required axes have at least one "Parfait", item is fully completed.
  if (hasPerfectCollege && hasPerfectLisa && hasPerfectPlatform) {
    return 1
  }

  const normalizeMastery = (mastery: Mastery) => MASTERY_SCORE[mastery] / MASTERY_SCORE.Parfait

  const collegeValues = itemTracking.assignedColleges
    .map((college) => itemTracking.byCollege[college])
    .filter(Boolean)
    .map((tracking) => normalizeMastery(tracking.mastery))

  const lisaValues = itemTracking.lisaSheets.map((sheet) => normalizeMastery(sheet.tracking.mastery))
  const platformValues = itemTracking.platformSheets.map((sheet) => normalizeMastery(sheet.tracking.mastery))

  const average = (values: number[]) => {
    if (values.length === 0) {
      return 0
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  const collegeProgress = average(collegeValues)
  const lisaProgress = average(lisaValues)
  const platformProgress = average(platformValues)

  const axes = [collegeProgress]
  if (!excludeLisaAxis) {
    axes.push(lisaProgress)
  }
  if (!excludePlatformAxis) {
    axes.push(platformProgress)
  }

  return average(axes)
}

function formatDate(dateString: string | null) {
  if (!dateString) {
    return 'Jamais'
  }
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(dateString))
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(dateString))
}

function getAutoQuizQuestion(item: ItemBase): string {
  const short = item.shortDescription.trim()
  if (!short) {
    return `Quel est le point clé de l'item #${item.itemNumber} ?`
  }
  return `Item #${item.itemNumber}: peux-tu expliquer ce concept en 20 secondes ?`
}

function startOfWeek(date: Date) {
  const day = date.getDay()
  const shift = day === 0 ? -6 : 1 - day
  const result = new Date(date)
  result.setDate(result.getDate() + shift)
  result.setHours(0, 0, 0, 0)
  return result
}

function toDayKey(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const year = day.getFullYear()
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const datePart = String(day.getDate()).padStart(2, '0')
  return `${year}-${month}-${datePart}`
}

function getIntensity(count: number) {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

function toWeekKey(date: Date) {
  const weekStart = startOfWeek(date)
  const year = weekStart.getFullYear()
  const month = String(weekStart.getMonth() + 1).padStart(2, '0')
  const day = String(weekStart.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getInitialTrackingState(): TrackerState {
  const normalizedCollegeMap = new Map(COLLEGES.map((college) => [normalizeText(college), college]))

  const items: Record<number, ItemTracking> = {}

  for (const item of rawItems) {
    const inferred = new Set<string>()
    for (const label of item.tagLabels) {
      const normalized = normalizeText(label)
      const college = normalizedCollegeMap.get(normalized)
      if (college) {
        inferred.add(college)
      }
    }

    const assignedColleges = Array.from(inferred)
    const byCollege = assignedColleges.reduce<Record<string, CollegeTracking>>((acc, college) => {
      acc[college] = getDefaultCollegeTracking()
      return acc
    }, {})

    items[item.itemNumber] = {
      assignedColleges,
      byCollege,
      lisaSheets: [],
      platformSheets: [],
      noLisaSheets: false,
      noPlatformSheets: false,
      itemComment: '',
      itemMastery: 'Non évalué',
      itemIcon: '',
      itemColor: '',
      itemLabel: '',
      lastQuizResult: null,
      quizCount: 0,
      lastReviewDate: null,
      quiz: getDefaultQuizConfig(),
      actionLogs: [],
    }
  }

  return { items }
}

function getDefaultProfile(): ProfileState {
  return {
    firstName: '',
    lastName: '',
    email: '',
    photoUrl: '',
    password: '',
    avatarGradient: AVATAR_GRADIENTS[0],
  }
}

function getProfileFromAuthUser(authUser: AuthUser | null): ProfileState {
  const base = getDefaultProfile()
  if (!authUser) {
    return base
  }

  const parts = authUser.displayName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? ''
  const lastName = parts.slice(1).join(' ')

  return {
    ...base,
    firstName,
    lastName,
    email: authUser.email,
  }
}

function normalizeProfileInput(rawProfile: unknown, authUser: AuthUser | null): ProfileState {
  const base = getProfileFromAuthUser(authUser)

  if (!rawProfile || typeof rawProfile !== 'object') {
    return base
  }

  const profile = rawProfile as Partial<ProfileState>
  return {
    ...base,
    firstName: typeof profile.firstName === 'string' && profile.firstName.trim() ? profile.firstName.trim() : base.firstName,
    lastName: typeof profile.lastName === 'string' && profile.lastName.trim() ? profile.lastName.trim() : base.lastName,
    email: typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim() : base.email,
    photoUrl: '',
    password: '',
    avatarGradient:
      typeof profile.avatarGradient === 'string' && profile.avatarGradient ? profile.avatarGradient : base.avatarGradient,
  }
}

function App() {
  const [trackingState, setTrackingState] = useState<TrackerState>(getInitialTrackingState())
  const [theme, setTheme] = useState<Theme>('light')
  const [focusMode, setFocusMode] = useState<boolean>(false)
  const [selectedItemId, setSelectedItemId] = useState<number>(rawItems[0]?.itemNumber ?? 1)
  const [search, setSearch] = useState('')
  const [collegeFilter, setCollegeFilter] = useState<string>('ALL')
  const [masteryFilter, setMasteryFilter] = useState<string>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('reviews')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const hasLoadedRemoteStateRef = useRef(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authView, setAuthView] = useState<AuthView>('login')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [firstNameInput, setFirstNameInput] = useState('')
  const [lastNameInput, setLastNameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [resetCodeInput, setResetCodeInput] = useState('')
  const [resetPasswordInput, setResetPasswordInput] = useState('')
  const [profile, setProfile] = useState<ProfileState>(getDefaultProfile())
  const [historyItemId, setHistoryItemId] = useState<number | null>(null)
  const [quizItemId, setQuizItemId] = useState<number | null>(null)
  const [quizSide, setQuizSide] = useState<'front' | 'back'>('front')
  const [quizFeedback, setQuizFeedback] = useState<QuizResult | null>(null)
  const [quizEditMode, setQuizEditMode] = useState(false)
  const [quizPulseByItem, setQuizPulseByItem] = useState<Record<number, number>>({})
  const [reviewFx, setReviewFx] = useState<Record<string, { delta: number; id: number }>>({})
  const [starFx, setStarFx] = useState<Record<string, number>>({})
  const [masteryFx, setMasteryFx] = useState<Record<string, number>>({})
  const [authTransitionPhase, setAuthTransitionPhase] = useState<'idle' | 'expanding'>('idle')
  const [authExpandStyle, setAuthExpandStyle] = useState<CSSProperties>({})
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const authCardRef = useRef<HTMLDivElement | null>(null)
  const passwordStrength = getPasswordStrengthMeta(passwordInput)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    void refreshAuth()
  }, [])

  useEffect(() => {
    setAuthError('')
    setAuthMessage('')
    setResetMode(false)
    setLoginPending(false)
  }, [authView])

  useEffect(() => {
    if (historyItemId === null && quizItemId === null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryItemId(null)
        setQuizItemId(null)
        setQuizFeedback(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [historyItemId, quizItemId])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser) {
      hasLoadedRemoteStateRef.current = false
      return
    }

    let cancelled = false

    const loadRemoteState = async () => {
      try {
        const payload = await apiRequest('/api/state')
        if (cancelled) {
          return
        }

        const remoteState = payload.state as
          | {
              trackingState?: unknown
              theme?: unknown
              focusMode?: unknown
              profile?: unknown
            }
          | null
          | undefined

        if (remoteState && typeof remoteState === 'object') {
          if (remoteState.trackingState && typeof remoteState.trackingState === 'object') {
            setTrackingState(remoteState.trackingState as TrackerState)
          } else {
            setTrackingState(getInitialTrackingState())
          }

          setTheme(remoteState.theme === 'dark' ? 'dark' : 'light')
          setFocusMode(Boolean(remoteState.focusMode))

          setProfile(normalizeProfileInput(remoteState.profile, authUser))
        } else {
          setTrackingState(getInitialTrackingState())
          setTheme('light')
          setFocusMode(false)
          setProfile(getProfileFromAuthUser(authUser))
        }
      } catch {
        if (!cancelled) {
          setTrackingState(getInitialTrackingState())
          setTheme('light')
          setFocusMode(false)
          setProfile(getProfileFromAuthUser(authUser))
        }
      } finally {
        if (!cancelled) {
          hasLoadedRemoteStateRef.current = true
        }
      }
    }

    void loadRemoteState()
    return () => {
      cancelled = true
    }
  }, [authStatus, authUser?.id])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteStateRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      void persistUserState({ silent: true })
    }, 600)

    return () => window.clearTimeout(timer)
  }, [authStatus, authUser?.id, trackingState, theme, focusMode, profile])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteStateRef.current) {
      return
    }

    const interval = window.setInterval(() => {
      void persistUserState({ silent: true, force: true })
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [authStatus, authUser?.id])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteStateRef.current) {
      return
    }

    const payload = JSON.stringify({
      trackingState,
      theme,
      focusMode,
      profile,
    })

    const flushWithKeepalive = () => {
      const candidates = resolveApiCandidates('/api/state')
      const target = candidates[0]
      if (!target) {
        return
      }
      const token = localStorage.getItem(AUTH_TOKEN_KEY) || ''
      void fetch(target, {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payload,
      }).catch(() => undefined)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushWithKeepalive()
      }
    }

    window.addEventListener('beforeunload', flushWithKeepalive)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', flushWithKeepalive)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [authStatus, authUser?.id, trackingState, theme, focusMode, profile])

  async function apiRequest(url: string, init?: RequestInit) {
    let response: Response | null = null
    let lastFetchError: unknown = null
    const candidates = resolveApiCandidates(url)

    const token = localStorage.getItem(AUTH_TOKEN_KEY) || ''

    for (const candidate of candidates) {
      try {
        response = await fetch(candidate, {
          ...init,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token && !('Authorization' in (init?.headers ?? {})) ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {}),
          },
        })
        break
      } catch (error) {
        lastFetchError = error
      }
    }

    if (!response) {
      if (lastFetchError instanceof Error) {
        throw new Error(`API indisponible: ${lastFetchError.message}`)
      }
      throw new Error("API indisponible. Lance aussi le serveur backend (`npm run dev:full`) et vérifie la connexion.")
    }

    let payload: Record<string, unknown> = {}
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    } else {
      const text = await response.text().catch(() => '')
      payload = { error: text.slice(0, 180) }
    }

    if (!response.ok) {
      const apiError = String(payload.error ?? '').trim()
      throw new Error(apiError || `Erreur API (${response.status})`)
    }
    return payload
  }

  async function persistUserState(options?: { silent?: boolean; force?: boolean }) {
    const silent = Boolean(options?.silent)
    const force = Boolean(options?.force)

    if (authStatus !== 'authed' || !authUser) {
      return false
    }

    if (!force && !hasLoadedRemoteStateRef.current) {
      return false
    }

    if (saveInFlightRef.current) {
      return saveInFlightRef.current
    }

    const savePromise = (async () => {
      if (!silent) {
        setSaveStatus('saving')
      }
      try {
        const payload = await apiRequest('/api/state', {
          method: 'PUT',
          body: JSON.stringify({
            trackingState,
            theme,
            focusMode,
            profile,
          }),
        })
        const updatedAtRaw = typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString()
        const savedAt = new Date(updatedAtRaw)
        if (!Number.isNaN(savedAt.getTime())) {
          setLastSavedAt(
            new Intl.DateTimeFormat('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(savedAt),
          )
        }
        if (!silent) {
          setSaveStatus('saved')
          window.setTimeout(() => setSaveStatus('idle'), 1800)
        }
        return true
      } catch {
        if (!silent) {
          setSaveStatus('error')
          window.setTimeout(() => setSaveStatus('idle'), 2200)
        }
        return false
      } finally {
        saveInFlightRef.current = null
      }
    })()

    saveInFlightRef.current = savePromise
    return savePromise
  }

  async function refreshAuth() {
    try {
      const payload = await apiRequest('/api/auth/me')
      setAuthUser(payload.user as AuthUser)
      setAuthStatus('authed')
    } catch (error) {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      setAuthUser(null)
      setAuthStatus('guest')
      hasLoadedRemoteStateRef.current = false
      if (error instanceof Error && error.message.includes('404')) {
        setAuthError(
          "API introuvable (/api/auth/me). Configure `VITE_API_BASE_URL` vers ton backend, puis rebuild/redeploy.",
        )
      }
    }
  }

  function startAuthSuccessTransition(user: AuthUser) {
    setAuthUser(user)

    const cardRect = authCardRef.current?.getBoundingClientRect()
    if (!cardRect) {
      setAuthStatus('authed')
      setLoginPending(false)
      return
    }

    setAuthExpandStyle(
      {
        '--auth-start-top': `${cardRect.top}px`,
        '--auth-start-left': `${cardRect.left}px`,
        '--auth-start-width': `${cardRect.width}px`,
        '--auth-start-height': `${cardRect.height}px`,
        '--auth-start-radius': '22px',
      } as CSSProperties,
    )
    setAuthTransitionPhase('expanding')

    window.setTimeout(() => {
      setAuthTransitionPhase('idle')
      setAuthStatus('authed')
      setLoginPending(false)
    }, 780)
  }

function getPasswordStrengthError(password: string) {
  if (password.length < 12 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Mot de passe invalide: minimum 12 caractères, au moins 1 chiffre et 1 caractère spécial.'
  }
  return null
}

function getPasswordStrengthMeta(password: string) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  if (!password) {
    return { score: 0, label: 'Aucun', tone: 'weak' as const }
  }
  if (score <= 2) {
    return { score, label: 'Faible', tone: 'weak' as const }
  }
  if (score <= 4) {
    return { score, label: 'Moyen', tone: 'medium' as const }
  }
  return { score, label: 'Fort', tone: 'strong' as const }
}

  async function handleRequestCode() {
    setAuthError('')
    setAuthMessage('')
    const passwordError = getPasswordStrengthError(passwordInput)
    if (passwordError) {
      setAuthError(passwordError)
      return
    }
    try {
      const payload = await apiRequest('/api/auth/register/request', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstNameInput,
          lastName: lastNameInput,
          email: emailInput,
          password: passwordInput,
        }),
      })
      setAuthMessage(String(payload.message ?? 'Demande envoyée.'))
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Erreur lors de la demande.')
    }
  }

  async function handleVerifyCode() {
    setAuthError('')
    setAuthMessage('')
    try {
      const payload = await apiRequest('/api/auth/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput,
          code: codeInput,
        }),
      })
      if (typeof payload.token === 'string' && payload.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, payload.token)
      }
      if (payload.user) {
        setAuthUser(payload.user as AuthUser)
        setAuthStatus('authed')
      } else {
        await refreshAuth()
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Erreur lors de la vérification.')
    }
  }

  async function handleLogin() {
    if (loginPending || authTransitionPhase !== 'idle') {
      return
    }
    setLoginPending(true)
    setAuthError('')
    setAuthMessage('')
    try {
      const payload = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput,
          password: passwordInput,
        }),
      })
      if (typeof payload.token === 'string' && payload.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, payload.token)
      }
      if (payload.user) {
        startAuthSuccessTransition(payload.user as AuthUser)
      } else {
        const mePayload = await apiRequest('/api/auth/me')
        if (mePayload.user) {
          startAuthSuccessTransition(mePayload.user as AuthUser)
        } else {
          setLoginPending(false)
          await refreshAuth()
        }
      }
    } catch (error) {
      setLoginPending(false)
      setAuthError(error instanceof Error ? error.message : 'Erreur de connexion.')
    }
  }

  async function handleRequestPasswordReset() {
    setAuthError('')
    setAuthMessage('')
    if (!emailInput.trim()) {
      setAuthError('Saisis ton email pour recevoir un code de réinitialisation.')
      return
    }
    try {
      const payload = await apiRequest('/api/auth/password/request', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput,
        }),
      })
      setAuthMessage(String(payload.message ?? 'Si le compte existe, un code a été envoyé par email.'))
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Erreur lors de la demande de réinitialisation.')
    }
  }

  async function handleConfirmPasswordReset() {
    setAuthError('')
    setAuthMessage('')
    const passwordError = getPasswordStrengthError(resetPasswordInput)
    if (passwordError) {
      setAuthError(passwordError)
      return
    }
    if (!resetCodeInput.trim()) {
      setAuthError('Saisis le code à 8 chiffres reçu par email.')
      return
    }

    try {
      const payload = await apiRequest('/api/auth/password/confirm', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput,
          code: resetCodeInput,
          newPassword: resetPasswordInput,
        }),
      })
      if (typeof payload.token === 'string' && payload.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, payload.token)
      }
      setAuthMessage(String(payload.message ?? 'Mot de passe mis à jour.'))
      setResetMode(false)
      setResetCodeInput('')
      setResetPasswordInput('')
      if (payload.user) {
        setAuthUser(payload.user as AuthUser)
        setAuthStatus('authed')
      } else {
        await refreshAuth()
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Erreur lors de la réinitialisation du mot de passe.')
    }
  }

  async function handleLogout() {
    await persistUserState({ force: true, silent: true })
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    hasLoadedRemoteStateRef.current = false
    setAuthUser(null)
    setAuthStatus('guest')
    setTrackingState(getInitialTrackingState())
    setTheme('light')
    setFocusMode(false)
    setProfile(getDefaultProfile())
  }

  const items = useMemo<ItemComputed[]>(() => {
    return rawItems.map((item) => {
      const tracking = normalizeItemTracking(trackingState.items[item.itemNumber] ?? getDefaultItemTracking())
      const selectedCollegeTrackers = tracking.assignedColleges.map(
        (college) => tracking.byCollege[college] ?? getDefaultCollegeTracking(),
      )

      const totalReviews = selectedCollegeTrackers.reduce((sum, entry) => sum + entry.reviews, 0)
      const lastReviewDate = selectedCollegeTrackers.reduce<string | null>((latest, entry) => {
        if (!entry.lastReviewedAt) {
          return latest
        }
        if (!latest || new Date(entry.lastReviewedAt) > new Date(latest)) {
          return entry.lastReviewedAt
        }
        return latest
      }, null)
      const mergedLastReviewDate =
        tracking.lastReviewDate && (!lastReviewDate || new Date(tracking.lastReviewDate) > new Date(lastReviewDate))
          ? tracking.lastReviewDate
          : lastReviewDate

      return {
        ...item,
        tracking,
        totalReviews,
        progress: computeItemProgress(tracking),
        lastReviewDate: mergedLastReviewDate,
      }
    })
  }, [trackingState])

  const filteredAndSortedItems = useMemo(() => {
    const normalizedSearch = normalizeText(search)

    const filtered = items.filter((item) => {
      if (normalizedSearch) {
        const searchable = normalizeText(
          [
            item.shortDescription,
            item.tagCodes.join(' '),
            item.tagLabels.join(' '),
            item.tracking.itemLabel,
            item.tracking.assignedColleges.join(' '),
            item.tracking.lisaSheets.map((sheet) => `${sheet.name} ${sheet.url}`).join(' '),
            item.tracking.platformSheets.map((sheet) => `${sheet.name} ${sheet.url}`).join(' '),
            String(item.itemNumber),
          ].join(' '),
        )
        if (!searchable.includes(normalizedSearch)) {
          return false
        }
      }

      if (collegeFilter !== 'ALL' && !item.tracking.assignedColleges.includes(collegeFilter)) {
        return false
      }

      if (masteryFilter !== 'ALL') {
        const hasMastery = item.tracking.assignedColleges.some(
          (college) => item.tracking.byCollege[college]?.mastery === masteryFilter,
        )
        if (!hasMastery) {
          return false
        }
      }

      return true
    })

    return filtered.sort((a, b) => {
      if (sortKey === 'reviews') {
        return b.totalReviews - a.totalReviews || a.itemNumber - b.itemNumber
      }
      if (sortKey === 'progress') {
        return b.progress - a.progress || b.totalReviews - a.totalReviews || a.itemNumber - b.itemNumber
      }
      return b.totalReviews - a.totalReviews || b.progress - a.progress || a.itemNumber - b.itemNumber
    })
  }, [items, search, collegeFilter, masteryFilter, sortKey])

  const suggestions = useMemo(() => {
    const lowMastery = items
      .filter((item) =>
        item.tracking.assignedColleges.some((college) => {
          const entry = item.tracking.byCollege[college]
          return entry && MASTERY_SCORE[entry.mastery] <= MASTERY_SCORE.Moyen
        }),
      )
      .sort((a, b) => a.progress - b.progress || a.itemNumber - b.itemNumber)
      .slice(0, 8)

    const stale = items
      .filter((item) => item.tracking.assignedColleges.length > 0)
      .filter((item) => {
        if (!item.lastReviewDate) {
          return true
        }
        const days = (Date.now() - new Date(item.lastReviewDate).getTime()) / (1000 * 60 * 60 * 24)
        return days > 14
      })
      .sort((a, b) => {
        if (!a.lastReviewDate) {
          return -1
        }
        if (!b.lastReviewDate) {
          return 1
        }
        return new Date(a.lastReviewDate).getTime() - new Date(b.lastReviewDate).getTime()
      })
      .slice(0, 8)

    return { lowMastery, stale }
  }, [items])

  const focusCandidates = useMemo(() => {
    const fromLow = suggestions.lowMastery.map((item) => item.itemNumber)
    const fromStale = suggestions.stale.map((item) => item.itemNumber)
    const merged = Array.from(new Set([...fromLow, ...fromStale]))
    return merged.length > 0 ? merged : filteredAndSortedItems.map((item) => item.itemNumber)
  }, [suggestions, filteredAndSortedItems])

  const selectedItem = useMemo(() => {
    if (focusMode && focusCandidates.length > 0 && !focusCandidates.includes(selectedItemId)) {
      return items.find((item) => item.itemNumber === focusCandidates[0])
    }
    return items.find((item) => item.itemNumber === selectedItemId)
  }, [items, selectedItemId, focusMode, focusCandidates])

  const effectiveSelectedItem = selectedItem ?? items[0]

  const itemTableList = useMemo(() => {
    if (!focusMode) {
      return filteredAndSortedItems
    }
    return filteredAndSortedItems.filter((item) => item.itemNumber === effectiveSelectedItem?.itemNumber)
  }, [focusMode, filteredAndSortedItems, effectiveSelectedItem])

  const historyItem = useMemo(() => {
    if (historyItemId === null) {
      return null
    }
    return items.find((item) => item.itemNumber === historyItemId) ?? null
  }, [historyItemId, items])

  const quizItem = useMemo(() => {
    if (quizItemId === null) {
      return null
    }
    return items.find((item) => item.itemNumber === quizItemId) ?? null
  }, [quizItemId, items])

  const activeQuizCard = useMemo(() => {
    if (!quizItem) {
      return null
    }
    return (
      quizItem.tracking.quiz.cards.find((card) => card.id === quizItem.tracking.quiz.activeCardId) ??
      quizItem.tracking.quiz.cards[0] ??
      null
    )
  }, [quizItem])

  const quizQuestion = useMemo(() => {
    if (!quizItem) {
      return ''
    }
    const custom = activeQuizCard?.question.trim() ?? ''
    if (custom) {
      return custom
    }
    return getAutoQuizQuestion(quizItem)
  }, [quizItem, activeQuizCard])

  const quizAnswer = useMemo(() => {
    if (!quizItem) {
      return ''
    }
    const custom = activeQuizCard?.answer.trim() ?? ''
    if (custom) {
      return custom
    }
    return quizItem.shortDescription
  }, [quizItem, activeQuizCard])

  const globalStats = useMemo(() => {
    const completedCount = items.filter(
      (item) => item.tracking.assignedColleges.length > 0 && item.progress >= 0.999,
    ).length
    const remainingCount = rawItems.length - completedCount

    const byCollege = COLLEGES.map((college) => {
      let assigned = 0
      let completed = 0
      let reviews = 0
      for (const item of items) {
        if (!item.tracking.assignedColleges.includes(college)) {
          continue
        }
        assigned += 1
        const entry = item.tracking.byCollege[college]
        if (entry) {
          reviews += entry.reviews
          const isCompleted = entry.reviews > 0 && MASTERY_SCORE[entry.mastery] >= MASTERY_SCORE.Bon
          if (isCompleted) {
            completed += 1
          }
        }
      }
      return {
        college,
        assigned,
        completed,
        reviews,
        progress: assigned === 0 ? 0 : (completed / assigned) * 100,
      }
    })

    return {
      completedCount,
      remainingCount,
      overallProgress: (completedCount / rawItems.length) * 100,
      byCollege,
    }
  }, [items])

  const weeklyReviewSeries = useMemo(() => {
    const yearStart = new Date(HABIT_TRACKER_YEAR, 0, 1)
    yearStart.setHours(0, 0, 0, 0)
    const yearEnd = new Date(HABIT_TRACKER_YEAR, 11, 31)
    yearEnd.setHours(0, 0, 0, 0)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const firstGridDay = startOfWeek(yearStart)

    const aggregate = new Map<string, number>()
    const applyEvent = (event: ReviewEvent) => {
      const eventDate = new Date(event.date)
      eventDate.setHours(0, 0, 0, 0)
      if (eventDate < yearStart || eventDate > yearEnd) {
        return
      }
      const key = toDayKey(eventDate)
      const nextValue = (aggregate.get(key) ?? 0) + event.delta
      // Guard against legacy negative events so today's +/- immediately reflects in the heatmap.
      aggregate.set(key, Math.max(0, nextValue))
    }

    for (const item of items) {
      for (const college of item.tracking.assignedColleges) {
        const entry = item.tracking.byCollege[college]
        if (!entry) {
          continue
        }
        for (const event of entry.reviewHistory) {
          applyEvent(event)
        }
      }

      for (const sheet of item.tracking.lisaSheets) {
        for (const event of sheet.tracking.reviewHistory) {
          applyEvent(event)
        }
      }
      for (const sheet of item.tracking.platformSheets) {
        for (const event of sheet.tracking.reviewHistory) {
          applyEvent(event)
        }
      }
    }

    const weeks: Array<{
      weekKey: string
      weekLabel: string
      days: Array<{ dateKey: string; count: number; inRange: boolean; intensity: number }>
    }> = []

    const weekCursor = new Date(firstGridDay)
    while (weekCursor <= yearEnd) {
      const weekStart = new Date(weekCursor)
      const weekKey = toWeekKey(weekStart)
      weeks.push({
        weekKey,
        weekLabel: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(weekStart),
        days: Array.from({ length: 7 }).map((_, dayOffset) => {
          const day = new Date(weekStart)
          day.setDate(weekStart.getDate() + dayOffset)
          const dayKey = toDayKey(day)
          const inRange = day >= yearStart && day <= yearEnd
          const count = inRange ? (aggregate.get(dayKey) ?? 0) : 0
          return {
            dateKey: dayKey,
            count,
            inRange,
            intensity: getIntensity(count),
          }
        }),
      })
      weekCursor.setDate(weekCursor.getDate() + 7)
    }

    return weeks
  }, [items])

  function setSelectedItem(itemNumber: number) {
    setSelectedItemId(itemNumber)
  }

  function triggerQuizButtonPulse(itemNumber: number) {
    const token = Date.now()
    setQuizPulseByItem((current) => ({ ...current, [itemNumber]: token }))
    window.setTimeout(() => {
      setQuizPulseByItem((current) => {
        if (current[itemNumber] !== token) {
          return current
        }
        const { [itemNumber]: _removed, ...rest } = current
        return rest
      })
    }, 360)
  }

  function openQuiz(itemNumber: number) {
    const item = items.find((entry) => entry.itemNumber === itemNumber)
    if (!item || !item.tracking.quiz.enabled) {
      return
    }
    triggerQuizButtonPulse(itemNumber)
    setQuizItemId(itemNumber)
    setQuizSide('front')
    setQuizFeedback(null)
    setQuizEditMode(false)
  }

  function closeQuiz() {
    setQuizItemId(null)
    setQuizSide('front')
    setQuizFeedback(null)
    setQuizEditMode(false)
  }

  function navigateQuizCard(direction: 'prev' | 'next') {
    if (!quizItem) {
      return
    }
    const cards = quizItem.tracking.quiz.cards
    if (cards.length <= 1) {
      return
    }
    const currentIndex = cards.findIndex((card) => card.id === quizItem.tracking.quiz.activeCardId)
    const safeIndex = currentIndex === -1 ? 0 : currentIndex
    const nextIndex =
      direction === 'next' ? (safeIndex + 1) % cards.length : (safeIndex - 1 + cards.length) % cards.length
    updateItemQuizConfig(quizItem.itemNumber, { activeCardId: cards[nextIndex].id })
    setQuizSide('front')
    setQuizFeedback(null)
  }

  function handleQuizResult(result: QuizResult) {
    if (!quizItem) {
      return
    }

    const meta = QUIZ_RESULT_META[result]
    const reviewedAt = new Date().toISOString()
    setQuizFeedback(result)

    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[quizItem.itemNumber] ?? getDefaultItemTracking())
      const nextTracking = appendActionLogs(
        {
          ...itemTracking,
          itemMastery: meta.mastery,
          lastQuizResult: result,
          quizCount: itemTracking.quizCount + 1,
          lastReviewDate: reviewedAt,
        },
        [`Quiz ${meta.icon} ${meta.actionVerb} (${meta.label})`],
      )

      return {
        ...current,
        items: {
          ...current.items,
          [quizItem.itemNumber]: nextTracking,
        },
      }
    })

    window.setTimeout(() => {
      setQuizFeedback((current) => (current === result ? null : current))
    }, 1200)
  }

  function triggerReviewFx(key: string, delta: number) {
    const id = Date.now() + Math.random()
    setReviewFx((current) => ({ ...current, [key]: { delta, id } }))
    window.setTimeout(() => {
      setReviewFx((current) => {
        if (current[key]?.id !== id) {
          return current
        }
        const { [key]: _removed, ...rest } = current
        return rest
      })
    }, 850)
  }

  function triggerPulseFx(setter: (updater: (current: Record<string, number>) => Record<string, number>) => void, key: string) {
    const id = Date.now() + Math.random()
    setter((current) => ({ ...current, [key]: id }))
    window.setTimeout(() => {
      setter((current) => {
        if (current[key] !== id) {
          return current
        }
        const { [key]: _removed, ...rest } = current
        return rest
      })
    }, 380)
  }

  function getCollegeKey(itemNumber: number, college: string) {
    return `college:${itemNumber}:${college}`
  }

  function getSheetKey(itemNumber: number, kind: SheetKind, sheetId: string) {
    return `sheet:${itemNumber}:${kind}:${sheetId}`
  }

  function handleCollegeReviewDelta(itemNumber: number, college: string, delta: 1 | -1) {
    const fxKey = getCollegeKey(itemNumber, college)
    triggerReviewFx(fxKey, delta)
    updateCollegeTracking(itemNumber, college, (current) => {
      if (delta === -1 && current.reviews === 0) {
        return current
      }
      return {
        ...current,
        reviews: Math.max(0, current.reviews + delta),
        lastReviewedAt: delta > 0 ? new Date().toISOString() : current.lastReviewedAt,
        reviewHistory:
          delta < 0
            ? [...current.reviewHistory, { date: new Date().toISOString(), delta: -1 }]
            : [...current.reviewHistory, { date: new Date().toISOString(), delta: 1 }],
      }
    })
  }

  function handleSheetReviewDelta(itemNumber: number, kind: SheetKind, sheetId: string, delta: 1 | -1) {
    const fxKey = getSheetKey(itemNumber, kind, sheetId)
    triggerReviewFx(fxKey, delta)
    updateReferenceSheets(itemNumber, kind, (currentSheets) =>
      currentSheets.map((currentSheet) => {
        if (currentSheet.id !== sheetId) {
          return currentSheet
        }
        if (delta === -1 && currentSheet.tracking.reviews === 0) {
          return currentSheet
        }
        return {
          ...currentSheet,
          tracking: {
            ...currentSheet.tracking,
            reviews: Math.max(0, currentSheet.tracking.reviews + delta),
            lastReviewedAt: delta > 0 ? new Date().toISOString() : currentSheet.tracking.lastReviewedAt,
            reviewHistory:
              delta < 0
                ? [...currentSheet.tracking.reviewHistory, { date: new Date().toISOString(), delta: -1 }]
                : [...currentSheet.tracking.reviewHistory, { date: new Date().toISOString(), delta: 1 }],
          },
        }
      }),
    )
  }

  function getMasteryClass(mastery: Mastery, fxKey: string) {
    const toneClass = `mastery-${normalizeText(mastery).toLowerCase().replace(' ', '-')}`
    return `${toneClass}${masteryFx[fxKey] ? ' mastery-pulse' : ''}`
  }

  function updateCollegeAssignment(itemNumber: number, college: string, checked: boolean) {
    setTrackingState((current) => {
      const currentItemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const assignedSet = new Set(currentItemTracking.assignedColleges)
      if (checked) {
        assignedSet.add(college)
      } else {
        assignedSet.delete(college)
      }

      const byCollege = { ...currentItemTracking.byCollege }
      if (checked && !byCollege[college]) {
        byCollege[college] = getDefaultCollegeTracking()
      }

      const nextTracking = appendActionLogs(
        {
          assignedColleges: Array.from(assignedSet),
          byCollege,
          lisaSheets: currentItemTracking.lisaSheets,
          platformSheets: currentItemTracking.platformSheets,
          noLisaSheets: currentItemTracking.noLisaSheets,
          noPlatformSheets: currentItemTracking.noPlatformSheets,
          itemComment: currentItemTracking.itemComment,
          itemMastery: currentItemTracking.itemMastery,
          itemIcon: currentItemTracking.itemIcon,
          itemColor: currentItemTracking.itemColor,
          itemLabel: currentItemTracking.itemLabel,
          lastQuizResult: currentItemTracking.lastQuizResult,
          quizCount: currentItemTracking.quizCount,
          lastReviewDate: currentItemTracking.lastReviewDate,
          quiz: currentItemTracking.quiz,
          actionLogs: currentItemTracking.actionLogs,
        },
        [checked ? `College ajouté: ${college}` : `College retiré: ${college}`],
      )

      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: nextTracking,
        },
      }
    })
  }

  function updateCollegeTracking(
    itemNumber: number,
    college: string,
    updater: (currentTracking: CollegeTracking) => CollegeTracking,
  ) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const prevCollegeTracking = itemTracking.byCollege[college] ?? getDefaultCollegeTracking()
      const nextCollegeTracking = updater(prevCollegeTracking)
      const actions: string[] = []
      if (nextCollegeTracking.reviews !== prevCollegeTracking.reviews) {
        const diff = nextCollegeTracking.reviews - prevCollegeTracking.reviews
        const signed = diff > 0 ? `+${diff}` : String(diff)
        actions.push(`[${college}] Reviews ${signed} (${nextCollegeTracking.reviews})`)
      }
      if (nextCollegeTracking.mastery !== prevCollegeTracking.mastery) {
        actions.push(`[${college}] Mastery: ${nextCollegeTracking.mastery}`)
      }
      if (nextCollegeTracking.favorite !== prevCollegeTracking.favorite) {
        actions.push(`[${college}] Favori ${nextCollegeTracking.favorite ? 'activé' : 'désactivé'}`)
      }

      const nextTracking = appendActionLogs(
        {
          assignedColleges: itemTracking.assignedColleges,
          byCollege: {
            ...itemTracking.byCollege,
            [college]: nextCollegeTracking,
          },
          lisaSheets: itemTracking.lisaSheets,
          platformSheets: itemTracking.platformSheets,
          noLisaSheets: itemTracking.noLisaSheets,
          noPlatformSheets: itemTracking.noPlatformSheets,
          itemComment: itemTracking.itemComment,
          itemMastery: itemTracking.itemMastery,
          itemIcon: itemTracking.itemIcon,
          itemColor: itemTracking.itemColor,
          itemLabel: itemTracking.itemLabel,
          lastQuizResult: itemTracking.lastQuizResult,
          quizCount: itemTracking.quizCount,
          lastReviewDate: itemTracking.lastReviewDate,
          quiz: itemTracking.quiz,
          actionLogs: itemTracking.actionLogs,
        },
        actions,
      )

      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: nextTracking,
        },
      }
    })
  }

  function updateReferenceSheets(
    itemNumber: number,
    kind: SheetKind,
    updater: (currentSheets: ReferenceSheet[]) => ReferenceSheet[],
  ) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const currentSheets = kind === 'lisaSheets' ? itemTracking.lisaSheets : itemTracking.platformSheets
      const kindLabel = kind === 'lisaSheets' ? 'Fiche LISA' : 'Fiche plateforme'
      const nextSheets = updater(currentSheets)
      const nextLisaSheets = kind === 'lisaSheets' ? nextSheets : itemTracking.lisaSheets
      const nextPlatformSheets = kind === 'platformSheets' ? nextSheets : itemTracking.platformSheets
      const actions: string[] = []

      if (nextSheets.length > currentSheets.length) {
        actions.push(`${kindLabel} ajoutée`)
      } else if (nextSheets.length < currentSheets.length) {
        actions.push(`${kindLabel} supprimée`)
      }

      const previousById = new Map(currentSheets.map((sheet) => [sheet.id, sheet]))
      for (const sheet of nextSheets) {
        const previous = previousById.get(sheet.id)
        if (!previous) {
          continue
        }
        if (sheet.tracking.reviews !== previous.tracking.reviews) {
          const diff = sheet.tracking.reviews - previous.tracking.reviews
          const signed = diff > 0 ? `+${diff}` : String(diff)
          actions.push(`${kindLabel} "${sheet.name || 'sans nom'}": reviews ${signed} (${sheet.tracking.reviews})`)
        }
        if (sheet.tracking.mastery !== previous.tracking.mastery) {
          actions.push(`${kindLabel} "${sheet.name || 'sans nom'}": mastery ${sheet.tracking.mastery}`)
        }
        if (sheet.tracking.favorite !== previous.tracking.favorite) {
          actions.push(
            `${kindLabel} "${sheet.name || 'sans nom'}": favori ${sheet.tracking.favorite ? 'activé' : 'désactivé'}`,
          )
        }
      }

      const nextTracking = appendActionLogs(
        {
          assignedColleges: itemTracking.assignedColleges,
          byCollege: itemTracking.byCollege,
          lisaSheets: nextLisaSheets,
          platformSheets: nextPlatformSheets,
          noLisaSheets: nextLisaSheets.length > 0 ? false : itemTracking.noLisaSheets,
          noPlatformSheets: nextPlatformSheets.length > 0 ? false : itemTracking.noPlatformSheets,
          itemComment: itemTracking.itemComment,
          itemMastery: itemTracking.itemMastery,
          itemIcon: itemTracking.itemIcon,
          itemColor: itemTracking.itemColor,
          itemLabel: itemTracking.itemLabel,
          lastQuizResult: itemTracking.lastQuizResult,
          quizCount: itemTracking.quizCount,
          lastReviewDate: itemTracking.lastReviewDate,
          quiz: itemTracking.quiz,
          actionLogs: itemTracking.actionLogs,
        },
        actions,
      )
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: nextTracking,
        },
      }
    })
  }

  function updateSheetExclusion(itemNumber: number, key: 'noLisaSheets' | 'noPlatformSheets', value: boolean) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const nextTracking = appendActionLogs(
        {
          assignedColleges: itemTracking.assignedColleges,
          byCollege: itemTracking.byCollege,
          lisaSheets: itemTracking.lisaSheets,
          platformSheets: itemTracking.platformSheets,
          noLisaSheets: key === 'noLisaSheets' ? value : itemTracking.noLisaSheets,
          noPlatformSheets: key === 'noPlatformSheets' ? value : itemTracking.noPlatformSheets,
          itemComment: itemTracking.itemComment,
          itemMastery: itemTracking.itemMastery,
          itemIcon: itemTracking.itemIcon,
          itemColor: itemTracking.itemColor,
          itemLabel: itemTracking.itemLabel,
          lastQuizResult: itemTracking.lastQuizResult,
          quizCount: itemTracking.quizCount,
          lastReviewDate: itemTracking.lastReviewDate,
          quiz: itemTracking.quiz,
          actionLogs: itemTracking.actionLogs,
        },
        [
          `${key === 'noLisaSheets' ? 'Pas de fiche LISA' : 'Pas de fiche plateforme'} ${
            value ? 'activé' : 'désactivé'
          }`,
        ],
      )
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: nextTracking,
        },
      }
    })
  }

  function updateItemComment(itemNumber: number, value: string) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            assignedColleges: itemTracking.assignedColleges,
            byCollege: itemTracking.byCollege,
            lisaSheets: itemTracking.lisaSheets,
            platformSheets: itemTracking.platformSheets,
            noLisaSheets: itemTracking.noLisaSheets,
            noPlatformSheets: itemTracking.noPlatformSheets,
            itemComment: value,
            itemMastery: itemTracking.itemMastery,
            itemIcon: itemTracking.itemIcon,
            itemColor: itemTracking.itemColor,
            itemLabel: itemTracking.itemLabel,
            lastQuizResult: itemTracking.lastQuizResult,
            quizCount: itemTracking.quizCount,
            lastReviewDate: itemTracking.lastReviewDate,
            quiz: itemTracking.quiz,
            actionLogs: itemTracking.actionLogs,
          },
        },
      }
    })
  }

  function updateItemMastery(itemNumber: number, value: Mastery | 'Non évalué') {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            assignedColleges: itemTracking.assignedColleges,
            byCollege: itemTracking.byCollege,
            lisaSheets: itemTracking.lisaSheets,
            platformSheets: itemTracking.platformSheets,
            noLisaSheets: itemTracking.noLisaSheets,
            noPlatformSheets: itemTracking.noPlatformSheets,
            itemComment: itemTracking.itemComment,
            itemMastery: value,
            itemIcon: itemTracking.itemIcon,
            itemColor: itemTracking.itemColor,
            itemLabel: itemTracking.itemLabel,
            lastQuizResult: itemTracking.lastQuizResult,
            quizCount: itemTracking.quizCount,
            lastReviewDate: itemTracking.lastReviewDate,
            quiz: itemTracking.quiz,
            actionLogs: itemTracking.actionLogs,
          },
        },
      }
    })
  }

  function updateItemQuizConfig(itemNumber: number, patch: Partial<QuizConfig>) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            assignedColleges: itemTracking.assignedColleges,
            byCollege: itemTracking.byCollege,
            lisaSheets: itemTracking.lisaSheets,
            platformSheets: itemTracking.platformSheets,
            noLisaSheets: itemTracking.noLisaSheets,
            noPlatformSheets: itemTracking.noPlatformSheets,
            itemComment: itemTracking.itemComment,
            itemMastery: itemTracking.itemMastery,
            itemIcon: itemTracking.itemIcon,
            itemColor: itemTracking.itemColor,
            itemLabel: itemTracking.itemLabel,
            lastQuizResult: itemTracking.lastQuizResult,
            quizCount: itemTracking.quizCount,
            lastReviewDate: itemTracking.lastReviewDate,
            quiz: {
              ...itemTracking.quiz,
              ...patch,
            },
            actionLogs: itemTracking.actionLogs,
          },
        },
      }
    })
  }

  function addQuizCard(itemNumber: number) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const newCard = makeQuizCard()
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            ...itemTracking,
            quiz: {
              ...itemTracking.quiz,
              cards: [...itemTracking.quiz.cards, newCard],
              activeCardId: newCard.id,
            },
          },
        },
      }
    })
  }

  function updateQuizCard(itemNumber: number, cardId: string, patch: Partial<QuizCard>) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            ...itemTracking,
            quiz: {
              ...itemTracking.quiz,
              cards: itemTracking.quiz.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
            },
          },
        },
      }
    })
  }

  function removeQuizCard(itemNumber: number, cardId: string) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const remaining = itemTracking.quiz.cards.filter((card) => card.id !== cardId)
      const fallback = remaining.length > 0 ? remaining : [makeQuizCard()]
      const nextActive = fallback.some((card) => card.id === itemTracking.quiz.activeCardId)
        ? itemTracking.quiz.activeCardId
        : fallback[0].id

      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            ...itemTracking,
            quiz: {
              ...itemTracking.quiz,
              cards: fallback,
              activeCardId: nextActive,
            },
          },
        },
      }
    })
  }

  function removeActiveQuizCardWithConfirm() {
    if (!quizItem || !activeQuizCard) {
      return
    }
    const ok = window.confirm('Supprimer cette flashcard ? Cette action est irréversible.')
    if (!ok) {
      return
    }
    removeQuizCard(quizItem.itemNumber, activeQuizCard.id)
    setQuizEditMode(false)
  }

  function updateItemVisual(
    itemNumber: number,
    patch: Partial<Pick<ItemTracking, 'itemIcon' | 'itemColor' | 'itemLabel'>>,
    logAction?: string,
  ) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const nextTracking = appendActionLogs(
        {
          assignedColleges: itemTracking.assignedColleges,
          byCollege: itemTracking.byCollege,
          lisaSheets: itemTracking.lisaSheets,
          platformSheets: itemTracking.platformSheets,
          noLisaSheets: itemTracking.noLisaSheets,
          noPlatformSheets: itemTracking.noPlatformSheets,
          itemComment: itemTracking.itemComment,
          itemMastery: itemTracking.itemMastery,
          itemIcon: patch.itemIcon ?? itemTracking.itemIcon,
          itemColor: patch.itemColor ?? itemTracking.itemColor,
          itemLabel: patch.itemLabel ?? itemTracking.itemLabel,
          lastQuizResult: itemTracking.lastQuizResult,
          quizCount: itemTracking.quizCount,
          lastReviewDate: itemTracking.lastReviewDate,
          quiz: itemTracking.quiz,
          actionLogs: itemTracking.actionLogs,
        },
        logAction ? [logAction] : [],
      )
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: nextTracking,
        },
      }
    })
  }

  function nextFocusItem() {
    if (focusCandidates.length === 0) {
      return
    }
    const currentIndex = focusCandidates.indexOf(effectiveSelectedItem?.itemNumber ?? focusCandidates[0])
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % focusCandidates.length
    setSelectedItem(focusCandidates[nextIndex])
  }

  function exportBackup() {
    const payload: BackupPayload = {
      app: 'med-learning-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        trackingState,
        theme,
        focusMode,
        profile,
      },
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const datePart = new Date().toISOString().slice(0, 10)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `med-tracker-backup-${datePart}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  async function importBackup(file: File) {
    try {
      const content = await file.text()
      const parsed = JSON.parse(content) as BackupPayload
      if (
        parsed?.app !== 'med-learning-tracker' ||
        parsed?.version !== 1 ||
        !parsed?.data?.trackingState ||
        typeof parsed?.data?.trackingState !== 'object'
      ) {
        window.alert('Fichier de sauvegarde invalide.')
        return
      }

      setTrackingState(parsed.data.trackingState)
      setTheme(parsed.data.theme === 'dark' ? 'dark' : 'light')
      setFocusMode(Boolean(parsed.data.focusMode))
      if (parsed.data.profile) {
        setProfile({
          firstName: parsed.data.profile.firstName ?? '',
          lastName: parsed.data.profile.lastName ?? '',
          email: parsed.data.profile.email ?? '',
          photoUrl: parsed.data.profile.photoUrl ?? '',
          password: parsed.data.profile.password ?? '',
          avatarGradient: parsed.data.profile.avatarGradient ?? AVATAR_GRADIENTS[0],
        })
      }
      window.alert('Sauvegarde chargée avec succès.')
    } catch {
      window.alert('Impossible de lire ce fichier de sauvegarde.')
    }
  }

  if (authStatus !== 'authed') {
    return (
      <div className={`auth-shell ${authTransitionPhase === 'expanding' ? 'is-auth-expanding' : ''}`}>
        <div className="auth-layout">
          <aside className="auth-brand">
            <div className="auth-brand-inner">
              <p className="auth-brand-kicker">ItemsTracker</p>
              {authView === 'login' ? (
                <>
                  <h1>Bienvenue</h1>
                  <p>Accède à ton dashboard EDN et optimise tes révisions</p>
                </>
              ) : (
                <>
                  <h1>Crée ton espace de révision</h1>
                  <p>Commence à maîtriser les 367 items efficacement</p>
                </>
              )}
            </div>
          </aside>

          <div ref={authCardRef} className="auth-card">
            <h2 className="auth-title">Authentification</h2>
            <div className="auth-switch">
              <button
                className={`ghost-btn auth-switch-btn ${authView === 'login' ? 'active' : ''}`}
                onClick={() => setAuthView('login')}
              >
                Connexion
              </button>
              <button
                className={`ghost-btn auth-switch-btn ${authView === 'register' ? 'active' : ''}`}
                onClick={() => setAuthView('register')}
              >
                Inscription
              </button>
            </div>

            <div key={authView} className="auth-panel-content">
              {authView === 'login' ? (
                <>
                  <p className="auth-sub">Connecte-toi avec ton email et ton mot de passe.</p>
                  <p className="auth-sub">Mot de passe oublié: demande un code puis valide le nouveau mot de passe.</p>
                  <div className="auth-grid">
                    <label className="auth-input-wrap auth-input-full">
                      <span className="auth-input-icon" aria-hidden="true">
                        ✉
                      </span>
                      <input
                        type="email"
                        placeholder="Email"
                        value={emailInput}
                        onChange={(event) => setEmailInput(event.target.value)}
                      />
                    </label>
                    <label className="auth-input-wrap auth-input-full">
                      <span className="auth-input-icon" aria-hidden="true">
                        🔒
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mot de passe"
                        value={passwordInput}
                        onChange={(event) => setPasswordInput(event.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </label>
                  </div>
                  <div className="auth-actions">
                    <button className="ghost-btn auth-login-btn" disabled={loginPending} onClick={() => void handleLogin()}>
                      {loginPending ? (
                        <>
                          <span className="auth-inline-spinner" aria-hidden="true" />
                          Connexion...
                        </>
                      ) : (
                        'Se connecter'
                      )}
                    </button>
                    <button className="ghost-btn" onClick={() => setResetMode((value) => !value)}>
                      {resetMode ? 'Annuler reset' : 'Mot de passe oublié'}
                    </button>
                  </div>
                  {resetMode ? (
                    <>
                      <p className="auth-sub">Réinitialisation: saisis le code reçu par email et un nouveau mot de passe.</p>
                      <div className="auth-grid">
                        <input
                          placeholder="Code reset (8 chiffres)"
                          value={resetCodeInput}
                          onChange={(event) => setResetCodeInput(event.target.value)}
                          maxLength={8}
                        />
                        <label className="auth-input-wrap">
                          <span className="auth-input-icon" aria-hidden="true">
                            🔑
                          </span>
                          <input
                            type={showResetPassword ? 'text' : 'password'}
                            placeholder="Nouveau mot de passe"
                            value={resetPasswordInput}
                            onChange={(event) => setResetPasswordInput(event.target.value)}
                          />
                          <button
                            type="button"
                            className="auth-password-toggle"
                            onClick={() => setShowResetPassword((value) => !value)}
                            aria-label={showResetPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          >
                            {showResetPassword ? '🙈' : '👁️'}
                          </button>
                        </label>
                      </div>
                      <div className="auth-actions">
                        <button className="ghost-btn" onClick={() => void handleRequestPasswordReset()}>
                          Recevoir un code reset
                        </button>
                        <button className="ghost-btn" onClick={() => void handleConfirmPasswordReset()}>
                          Valider reset mot de passe
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="auth-sub">Inscription validée par code 8 chiffres envoyé à l’administrateur.</p>
                  <p className="auth-sub">Mot de passe requis: 12+ caractères, 1 chiffre, 1 caractère spécial.</p>
                  <div className="auth-grid">
                    <input
                      placeholder="Prénom"
                      value={firstNameInput}
                      onChange={(event) => setFirstNameInput(event.target.value)}
                    />
                    <input placeholder="Nom" value={lastNameInput} onChange={(event) => setLastNameInput(event.target.value)} />
                    <label className="auth-input-wrap auth-input-full">
                      <span className="auth-input-icon" aria-hidden="true">
                        ✉
                      </span>
                      <input
                        type="email"
                        placeholder="Email"
                        value={emailInput}
                        onChange={(event) => setEmailInput(event.target.value)}
                      />
                    </label>
                    <label className="auth-input-wrap auth-input-full">
                      <span className="auth-input-icon" aria-hidden="true">
                        🔒
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mot de passe"
                        value={passwordInput}
                        onChange={(event) => setPasswordInput(event.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </label>
                    <input
                      placeholder="Code admin (8 chiffres)"
                      value={codeInput}
                      onChange={(event) => setCodeInput(event.target.value)}
                      maxLength={8}
                    />
                  </div>

                  <div className={`auth-strength auth-strength-${passwordStrength.tone}`}>
                    <span className="auth-strength-label">Force mot de passe: {passwordStrength.label}</span>
                    <div className="auth-strength-track">
                      <span style={{ width: `${Math.max(12, passwordStrength.score * 20)}%` }} />
                    </div>
                  </div>

                  <div className="auth-actions">
                    <button className="ghost-btn" onClick={() => void handleRequestCode()}>
                      Demander code admin
                    </button>
                    <button className="ghost-btn" onClick={() => void handleVerifyCode()}>
                      Valider code et créer compte
                    </button>
                  </div>
                </>
              )}
            </div>

            {authMessage ? <p className="auth-success">{authMessage}</p> : null}
            {authError ? <p className="auth-error">{authError}</p> : null}
            {authStatus === 'loading' ? <p className="auth-sub">Chargement...</p> : null}
          </div>
        </div>
        {authTransitionPhase === 'expanding' ? (
          <div className="auth-expand-card" style={authExpandStyle}>
            <div className="auth-expand-content">
              <span className="auth-inline-spinner" aria-hidden="true" />
              <p>Connexion réussie</p>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Medical Learning Tracker</p>
          <h1>Dashboard EDN - 367 items</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="ghost-btn icon-btn"
            title={
              saveStatus === 'saving'
                ? 'Sauvegarde en cours'
                : saveStatus === 'saved'
                  ? 'Sauvegarde OK'
                  : saveStatus === 'error'
                    ? 'Echec sauvegarde'
                    : 'Sauvegarder maintenant'
            }
            aria-label="Sauvegarder maintenant"
            onClick={() => void persistUserState({ silent: false, force: true })}
          >
            💾
          </button>
          <div className="menu-wrap">
            <button
              className="ghost-btn icon-btn"
              title="Settings"
              aria-label="Settings"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              ⚙
            </button>
            {settingsOpen ? (
              <div className="menu-popover">
                <p className="menu-title">Settings</p>
                <label className="menu-row">
                  Theme
                  <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="menu-row">
                  Focus mode
                  <input
                    type="checkbox"
                    checked={focusMode}
                    onChange={(event) => setFocusMode(event.target.checked)}
                  />
                </label>
                <div className="menu-actions">
                  <button type="button" className="menu-action-btn" onClick={exportBackup}>
                    Exporter sauvegarde
                  </button>
                  <button
                    type="button"
                    className="menu-action-btn"
                    onClick={() => backupInputRef.current?.click()}
                  >
                    Charger sauvegarde
                  </button>
                  <input
                    ref={backupInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden-file-input"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void importBackup(file)
                      }
                      event.target.value = ''
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <div className="menu-wrap">
            <button
              className="ghost-btn icon-btn profile-trigger-btn"
              title="Profil"
              aria-label="Profil"
              onClick={() => setProfileMenuOpen((value) => !value)}
            >
              {profile.photoUrl ? (
                <img className="profile-trigger-avatar" src={profile.photoUrl} alt="Profil" />
              ) : (
                <span className="profile-trigger-avatar profile-avatar-fallback" style={{ background: profile.avatarGradient }}>
                  {getProfileInitials(profile)}
                </span>
              )}
            </button>
            {profileMenuOpen ? (
              <div className="menu-popover">
                <p className="menu-title">Profil</p>
                <div className="profile-head">
                  {profile.photoUrl ? (
                    <img className="profile-avatar" src={profile.photoUrl} alt="Photo profil" />
                  ) : (
                    <div className="profile-avatar profile-avatar-fallback" style={{ background: profile.avatarGradient }}>
                      {getProfileInitials(profile)}
                    </div>
                  )}
                </div>
                <label className="menu-row menu-row-input">
                  Prénom
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))}
                  />
                </label>
                <label className="menu-row menu-row-input">
                  Nom
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(event) => setProfile((current) => ({ ...current, lastName: event.target.value }))}
                  />
                </label>
                <label className="menu-row menu-row-input">
                  Email
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <div className="menu-row menu-row-input">
                  <span>Gradient avatar</span>
                  <div className="avatar-gradient-grid">
                    {AVATAR_GRADIENTS.map((gradient) => (
                      <button
                        key={gradient}
                        type="button"
                        className={`avatar-gradient-dot ${profile.avatarGradient === gradient ? 'active' : ''}`}
                        style={{ background: gradient }}
                        onClick={() => setProfile((current) => ({ ...current, avatarGradient: gradient }))}
                        aria-label="Choisir ce gradient avatar"
                        title="Choisir ce gradient avatar"
                      />
                    ))}
                  </div>
                </div>
                <button type="button" className="menu-action-btn" onClick={() => void handleLogout()}>
                  Déconnexion ({authUser?.email ?? 'session'})
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="ghost-btn icon-btn"
            title={theme === 'light' ? 'Night mode' : 'Light mode'}
            aria-label={theme === 'light' ? 'Night mode' : 'Light mode'}
            onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>
      {saveStatus !== 'idle' ? (
        <div className={`save-popup ${saveStatus}`}>
          {saveStatus === 'saving'
            ? 'Sauvegarde en cours...'
            : saveStatus === 'saved'
              ? `Sauvegarde OK${lastSavedAt ? ` (${lastSavedAt})` : ''}`
              : 'Erreur de sauvegarde'}
        </div>
      ) : null}

      <section className="global-grid">
        <article className="stat-card">
          <p className="stat-label">Items complétés</p>
          <p className="stat-value">{globalStats.completedCount}</p>
          <p className="stat-sub">{globalStats.remainingCount} restants</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">Progression globale</p>
          <p className="stat-value">{globalStats.overallProgress.toFixed(1)}%</p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${globalStats.overallProgress}%` }} />
          </div>
        </article>
        <article className="stat-card large-card">
          <p className="stat-label">Habit tracking {HABIT_TRACKER_YEAR} (lectures)</p>
          <div className="habit-tracker-wrap">
            {weeklyReviewSeries.map((week, weekIndex) => (
              <div className="habit-week" key={week.weekKey} title={`Semaine du ${week.weekLabel}`}>
                {week.days.map((day, dayIndex) => (
                  <span
                    key={day.dateKey}
                    className={`habit-dot ${day.inRange ? `intensity-${day.intensity}` : 'out-range'}`}
                    data-tip={`${day.dateKey} • ${day.count} lecture${day.count > 1 ? 's' : ''}`}
                    style={{ animationDelay: `${Math.min((weekIndex * 7 + dayIndex) * 8, 900)}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="habit-legend">
            <span>Faible</span>
            <div className="legend-scale">
              <span className="habit-dot intensity-0" />
              <span className="habit-dot intensity-1" />
              <span className="habit-dot intensity-2" />
              <span className="habit-dot intensity-3" />
              <span className="habit-dot intensity-4" />
            </div>
            <span>Intense</span>
          </div>
        </article>
      </section>

      <section className="main-grid">
        <article className="panel table-panel">
          <div className="panel-head">
            <h2>Items</h2>
            <p>{itemTableList.length} lignes</p>
          </div>

          <div className="filters-row">
            <input
              type="text"
              placeholder="Search item, tag, college"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={collegeFilter} onChange={(event) => setCollegeFilter(event.target.value)}>
              <option value="ALL">Tous colleges</option>
              {COLLEGES.map((college) => (
                <option value={college} key={college}>
                  {college}
                </option>
              ))}
            </select>
            <select value={masteryFilter} onChange={(event) => setMasteryFilter(event.target.value)}>
              <option value="ALL">Tous niveaux</option>
              {MASTERY_LEVELS.map((level) => (
                <option value={level} key={level}>
                  {level}
                </option>
              ))}
            </select>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="reviews">Sort: Reviews</option>
              <option value="progress">Sort: Progress</option>
            </select>
          </div>

              <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Colleges</th>
                  <th>Fiches LISA</th>
                  <th>Fiches Plateformes</th>
                  <th>Reviews</th>
                  <th>Progress</th>
                  <th>Quiz</th>
                </tr>
              </thead>
              <tbody>
                {itemTableList.map((item) => {
                  const hasVisualMarker = Boolean(item.tracking.itemIcon || item.tracking.itemColor || item.tracking.itemLabel)
                  const progressPercent = Math.round(item.progress * 100)
                  const progressTier =
                    progressPercent >= 100
                      ? 'tier-complete'
                      : progressPercent >= 75
                        ? 'tier-high'
                        : progressPercent >= 50
                          ? 'tier-mid-high'
                          : progressPercent >= 30
                            ? 'tier-mid'
                            : 'tier-low'
                  return (
                    <tr
                      key={item.itemNumber}
                      className={item.itemNumber === effectiveSelectedItem?.itemNumber ? 'selected' : ''}
                      onClick={() => setSelectedItem(item.itemNumber)}
                    >
                      <td>
                        <div className="item-cell">
                          {hasVisualMarker && (item.tracking.itemIcon || item.tracking.itemColor) ? (
                            <span className="item-marker" style={{ backgroundColor: item.tracking.itemColor || undefined }}>
                              {item.tracking.itemIcon || ''}
                            </span>
                          ) : null}
                          <div>
                            <span>#{item.itemNumber}</span>
                            {item.tracking.itemLabel ? (
                              <p className="item-label-chip" style={{ borderColor: item.tracking.itemColor || undefined }}>
                                {item.tracking.itemLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="description-cell">{item.shortDescription}</p>
                        <p className="tag-row">{item.tagCodes.join(' • ')}</p>
                      </td>
                      <td>{item.tracking.assignedColleges.length}</td>
                      <td>{item.tracking.lisaSheets.length}</td>
                      <td>{item.tracking.platformSheets.length}</td>
                      <td>{item.totalReviews}</td>
                      <td>
                        <span className={`pill progress-pill ${progressTier}`}>
                          {progressPercent}%
                          {progressPercent >= 100 ? <span className="progress-pill-check">✓</span> : null}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`quiz-trigger-btn ${quizPulseByItem[item.itemNumber] ? 'pulse' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            openQuiz(item.itemNumber)
                          }}
                          disabled={!item.tracking.quiz.enabled}
                          title={item.tracking.quiz.enabled ? "Lancer le quiz de l'item" : 'Quiz désactivé pour cet item'}
                        >
                          Quiz
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel detail-panel">
          {effectiveSelectedItem ? (
            <>
              <div className="panel-head">
                <div>
                  <h2>{effectiveSelectedItem.tracking.itemIcon ? `${effectiveSelectedItem.tracking.itemIcon} ` : ''}Item #{effectiveSelectedItem.itemNumber}</h2>
                  <p>{effectiveSelectedItem.shortDescription}</p>
                </div>
                <div className="detail-head-actions">
                  <button
                    type="button"
                    className={`quiz-trigger-btn ${quizPulseByItem[effectiveSelectedItem.itemNumber] ? 'pulse' : ''}`}
                    onClick={() => openQuiz(effectiveSelectedItem.itemNumber)}
                    disabled={!effectiveSelectedItem.tracking.quiz.enabled}
                    title={
                      effectiveSelectedItem.tracking.quiz.enabled
                        ? "Lancer le quiz de l'item"
                        : 'Quiz désactivé pour cet item'
                    }
                  >
                    Quiz
                  </button>
                  <button
                    type="button"
                    className="history-icon-btn"
                    title={`Historique item #${effectiveSelectedItem.itemNumber}`}
                    aria-label={`Afficher l'historique de l'item ${effectiveSelectedItem.itemNumber}`}
                    onClick={() => setHistoryItemId(effectiveSelectedItem.itemNumber)}
                  >
                    🕘
                  </button>
                  {focusMode ? (
                    <button className="ghost-btn" onClick={nextFocusItem}>
                      Item focus suivant
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="meta-grid">
                <div>
                  <p className="meta-label">Tags</p>
                  <p>{effectiveSelectedItem.tagLabels.join(', ') || 'Aucun'}</p>
                </div>
                <div>
                  <p className="meta-label">Relectures (total)</p>
                  <p>
                    {effectiveSelectedItem.totalReviews +
                      effectiveSelectedItem.tracking.lisaSheets.reduce(
                        (sum, sheet) => sum + sheet.tracking.reviews,
                        0,
                      ) +
                      effectiveSelectedItem.tracking.platformSheets.reduce(
                        (sum, sheet) => sum + sheet.tracking.reviews,
                        0,
                      )}
                  </p>
                </div>
                <div>
                  <p className="meta-label">Dernière review</p>
                  <p>{formatDate(effectiveSelectedItem.lastReviewDate)}</p>
                </div>
                <div>
                  <p className="meta-label">Ressenti item (manuel)</p>
                  <select
                    className={`manual-item-mastery-select ${
                      effectiveSelectedItem.tracking.itemMastery === 'Non évalué'
                        ? 'none'
                        : `mastery-${normalizeText(effectiveSelectedItem.tracking.itemMastery).toLowerCase().replace(' ', '-')}`
                    }`}
                    value={effectiveSelectedItem.tracking.itemMastery}
                    onChange={(event) =>
                      updateItemMastery(
                        effectiveSelectedItem.itemNumber,
                        (event.target.value as Mastery | 'Non évalué') ?? 'Non évalué',
                      )
                    }
                  >
                    <option value="Non évalué">Non évalué</option>
                    {MASTERY_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="block-label">
                Commentaire item
                <textarea
                  value={effectiveSelectedItem.tracking.itemComment}
                  placeholder="Commentaire global sur cet item..."
                  onChange={(event) => updateItemComment(effectiveSelectedItem.itemNumber, event.target.value)}
                />
              </label>

              <h3>Marqueur visuel item</h3>
              <div className="item-visual-editor">
                <label className="block-label">
                  Icône
                  <input
                    type="text"
                    maxLength={2}
                    value={effectiveSelectedItem.tracking.itemIcon}
                    onChange={(event) =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, { itemIcon: event.target.value })
                    }
                  />
                </label>
                <label className="block-label">
                  Couleur
                  <input
                    type="color"
                    value={effectiveSelectedItem.tracking.itemColor || '#2563eb'}
                    onChange={(event) =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, { itemColor: event.target.value })
                    }
                  />
                </label>
                <label className="block-label">
                  Libellé
                  <input
                    type="text"
                    placeholder="Tombe souvent, Difficile..."
                    value={effectiveSelectedItem.tracking.itemLabel}
                    onChange={(event) =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, { itemLabel: event.target.value })
                    }
                  />
                </label>
                <div className="item-visual-actions">
                  <button
                    type="button"
                    className="ghost-btn item-visual-emoji-btn"
                    title="Tombe souvent"
                    aria-label="Marquer comme tombe souvent"
                    onClick={() =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, {
                        itemIcon: '⭐️',
                        itemColor: '#facc15',
                        itemLabel: 'Tombe souvent',
                      }, 'Marqueur visuel: ⭐️ Tombe souvent')
                    }
                  >
                    ⭐️
                  </button>
                  <button
                    type="button"
                    className="ghost-btn item-visual-emoji-btn"
                    title="Difficile"
                    aria-label="Marquer comme difficile"
                    onClick={() =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, {
                        itemIcon: '⚠️',
                        itemColor: '#ef4444',
                        itemLabel: 'Difficile',
                      }, 'Marqueur visuel: ⚠️ Difficile')
                    }
                  >
                    ⚠️
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() =>
                      updateItemVisual(effectiveSelectedItem.itemNumber, {
                        itemIcon: '',
                        itemColor: '',
                        itemLabel: '',
                      }, 'Marqueur visuel effacé')
                    }
                  >
                    Effacer marqueur
                  </button>
                </div>
              </div>

              <h3>Quiz item</h3>
              <div className="quiz-config-grid">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedItem.tracking.quiz.enabled}
                    onChange={(event) =>
                      updateItemQuizConfig(effectiveSelectedItem.itemNumber, { enabled: event.target.checked })
                    }
                  />
                  Activer quiz pour cet item
                </label>
                <label className="block-label">
                  Cartes quiz
                  <div className="quiz-card-list">
                    {effectiveSelectedItem.tracking.quiz.cards.map((card, index) => (
                      <div key={card.id} className="quiz-card-row">
                        <button
                          type="button"
                          className={`quiz-card-select ${
                            effectiveSelectedItem.tracking.quiz.activeCardId === card.id ? 'active' : ''
                          }`}
                          onClick={() =>
                            updateItemQuizConfig(effectiveSelectedItem.itemNumber, {
                              activeCardId: card.id,
                            })
                          }
                        >
                          Carte {index + 1}
                        </button>
                        <button
                          type="button"
                          className="quiz-card-remove"
                          onClick={() => removeQuizCard(effectiveSelectedItem.itemNumber, card.id)}
                        >
                          Suppr
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="quiz-card-add"
                      onClick={() => addQuizCard(effectiveSelectedItem.itemNumber)}
                    >
                      + Ajouter carte
                    </button>
                  </div>
                </label>
                {effectiveSelectedItem.tracking.quiz.cards
                  .filter((card) => card.id === effectiveSelectedItem.tracking.quiz.activeCardId)
                  .map((activeCard) => (
                    <div key={activeCard.id} className="quiz-card-editor">
                      <label className="block-label">
                        Question carte active
                        <input
                          type="text"
                          placeholder="Laisser vide pour question auto..."
                          value={activeCard.question}
                          onChange={(event) =>
                            updateQuizCard(effectiveSelectedItem.itemNumber, activeCard.id, {
                              question: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block-label">
                        Réponse carte active
                        <textarea
                          placeholder="Laisser vide pour utiliser la description de l'item..."
                          value={activeCard.answer}
                          onChange={(event) =>
                            updateQuizCard(effectiveSelectedItem.itemNumber, activeCard.id, {
                              answer: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                <label className="block-label">
                  Animation
                  <select
                    value={effectiveSelectedItem.tracking.quiz.animationStyle}
                    onChange={(event) =>
                      updateItemQuizConfig(effectiveSelectedItem.itemNumber, {
                        animationStyle: event.target.value as QuizAnimationStyle,
                      })
                    }
                  >
                    <option value="flip">Flip</option>
                    <option value="fade">Fade</option>
                  </select>
                </label>
                <div className="quiz-last-result">
                  <span className="quiz-last-result-label">Dernier niveau</span>
                  {effectiveSelectedItem.tracking.lastQuizResult ? (
                    <span className={`quiz-last-result-pill ${effectiveSelectedItem.tracking.lastQuizResult}`}>
                      {QUIZ_RESULT_META[effectiveSelectedItem.tracking.lastQuizResult].icon}{' '}
                      {QUIZ_RESULT_META[effectiveSelectedItem.tracking.lastQuizResult].label}
                    </span>
                  ) : (
                    <span className="quiz-last-result-pill none">Non évalué</span>
                  )}
                  <span className="quiz-last-result-count">
                    Quiz faits: {effectiveSelectedItem.tracking.quizCount}
                  </span>
                </div>
                <div className="quiz-config-options">
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={effectiveSelectedItem.tracking.quiz.showTags}
                      onChange={(event) =>
                        updateItemQuizConfig(effectiveSelectedItem.itemNumber, { showTags: event.target.checked })
                      }
                    />
                    Afficher tags
                  </label>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={effectiveSelectedItem.tracking.quiz.showColleges}
                      onChange={(event) =>
                        updateItemQuizConfig(effectiveSelectedItem.itemNumber, { showColleges: event.target.checked })
                      }
                    />
                    Afficher colleges
                  </label>
                </div>
              </div>

              <h3>Assignation colleges</h3>
              <div className="college-picker">
                {COLLEGES.map((college) => (
                  <label key={college}>
                    <input
                      type="checkbox"
                      checked={effectiveSelectedItem.tracking.assignedColleges.includes(college)}
                      onChange={(event) =>
                        updateCollegeAssignment(effectiveSelectedItem.itemNumber, college, event.target.checked)
                      }
                    />
                    <span>{college}</span>
                  </label>
                ))}
              </div>

              <h3>Tracking par college</h3>
              <div className="tracking-grid">
                {effectiveSelectedItem.tracking.assignedColleges.length === 0 ? (
                  <p className="muted">Sélectionne au moins un college pour commencer le suivi.</p>
                ) : null}

                {effectiveSelectedItem.tracking.assignedColleges.map((college) => {
                  const data = effectiveSelectedItem.tracking.byCollege[college] ?? getDefaultCollegeTracking()
                  const collegeFxKey = getCollegeKey(effectiveSelectedItem.itemNumber, college)
                  const activeReviewFx = reviewFx[collegeFxKey]
                  return (
                    <section key={college} className={`college-card ${data.favorite ? 'is-favorite' : ''}`}>
                      <div className="college-card-head">
                        <p>{college}</p>
                        <button
                          className={`star-btn ${data.favorite ? 'active' : ''}${starFx[collegeFxKey] ? ' pop' : ''}`}
                          onClick={() => {
                            triggerPulseFx(setStarFx, collegeFxKey)
                            updateCollegeTracking(effectiveSelectedItem.itemNumber, college, (current) => ({
                              ...current,
                              favorite: !current.favorite,
                            }))
                          }}
                        >
                          ★
                        </button>
                      </div>

                      <div className="control-row">
                        <p>Reviews</p>
                        <div className="counter-wrap">
                          <button
                            onClick={() => {
                              if (data.reviews === 0) return
                              handleCollegeReviewDelta(effectiveSelectedItem.itemNumber, college, -1)
                            }}
                          >
                            -
                          </button>
                          <span className={`review-count${activeReviewFx ? ' bump' : ''}`}>{data.reviews}</span>
                          {activeReviewFx ? (
                            <span className={`review-float ${activeReviewFx.delta > 0 ? 'up' : 'down'}`}>
                              {activeReviewFx.delta > 0 ? `+${activeReviewFx.delta}` : String(activeReviewFx.delta)}
                            </span>
                          ) : null}
                          <button onClick={() => handleCollegeReviewDelta(effectiveSelectedItem.itemNumber, college, 1)}>
                            +
                          </button>
                        </div>
                      </div>

                      <label className="block-label">
                        Feeling / Mastery
                        <select
                          value={data.mastery}
                          className={getMasteryClass(data.mastery, collegeFxKey)}
                          onChange={(event) => {
                            triggerPulseFx(setMasteryFx, collegeFxKey)
                            updateCollegeTracking(effectiveSelectedItem.itemNumber, college, (current) => ({
                              ...current,
                              mastery: event.target.value as Mastery,
                            }))
                          }}
                        >
                          {MASTERY_LEVELS.map((level) => (
                            <option value={level} key={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block-label">
                        Commentaires
                        <textarea
                          value={data.comments}
                          placeholder="Notes ciblées, pièges, rappel d'exam..."
                          onChange={(event) =>
                            updateCollegeTracking(effectiveSelectedItem.itemNumber, college, (current) => ({
                              ...current,
                              comments: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </section>
                  )
                })}
              </div>

              <h3>Fiches LISA</h3>
              {effectiveSelectedItem.tracking.lisaSheets.length === 0 ? (
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedItem.tracking.noLisaSheets}
                    onChange={(event) =>
                      updateSheetExclusion(effectiveSelectedItem.itemNumber, 'noLisaSheets', event.target.checked)
                    }
                  />
                  PAS de fiche lisa
                </label>
              ) : null}
              <div className="reference-grid">
                {effectiveSelectedItem.tracking.lisaSheets.length === 0 ? (
                  <p className="muted">Aucune fiche LISA.</p>
                ) : null}
                {effectiveSelectedItem.tracking.lisaSheets.map((sheet) => (
                  <div key={sheet.id} className={`reference-card ${sheet.tracking.favorite ? 'is-favorite' : ''}`}>
                    <div className="reference-row">
                      <button
                        type="button"
                        className="sheet-emoji-btn"
                        title={`Couleur: ${SHEET_COLORS.find((sheetColor) => sheetColor.value === sheet.color)?.label ?? ''}`}
                        onClick={() =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? { ...currentSheet, color: getNextSheetColor(currentSheet.color) }
                                : currentSheet,
                            ),
                          )
                        }
                      >
                        {SHEET_COLORS.find((sheetColor) => sheetColor.value === sheet.color)?.emoji ?? '🟡'}
                      </button>
                      <input
                        type="text"
                        placeholder="Nom de la fiche"
                        value={sheet.name}
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id ? { ...currentSheet, name: event.target.value } : currentSheet,
                            ),
                          )
                        }
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={sheet.url}
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id ? { ...currentSheet, url: event.target.value } : currentSheet,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="remove-ref-btn"
                        onClick={() =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.filter((currentSheet) => currentSheet.id !== sheet.id),
                          )
                        }
                      >
                        -
                      </button>
                    </div>

                    <div className="control-row">
                      <p>Tracking fiche</p>
                      <div className="counter-wrap">
                        <button
                          onClick={() => {
                            if (sheet.tracking.reviews === 0) return
                            handleSheetReviewDelta(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id, -1)
                          }}
                        >
                          -
                        </button>
                        <span className={`review-count${reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)] ? ' bump' : ''}`}>
                          {sheet.tracking.reviews}
                        </span>
                        {reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)] ? (
                          <span
                            className={`review-float ${
                              reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)]!.delta > 0 ? 'up' : 'down'
                            }`}
                          >
                            {reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)]!.delta > 0
                              ? `+${reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)]!.delta}`
                              : String(reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)]!.delta)}
                          </span>
                        ) : null}
                        <button onClick={() => handleSheetReviewDelta(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id, 1)}>
                          +
                        </button>
                        <button
                          className={`star-btn ${sheet.tracking.favorite ? 'active' : ''}${starFx[getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id)] ? ' pop' : ''}`}
                          onClick={() => {
                            triggerPulseFx(setStarFx, getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id))
                            updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                              currentSheets.map((currentSheet) =>
                                currentSheet.id === sheet.id
                                  ? {
                                      ...currentSheet,
                                      tracking: {
                                        ...currentSheet.tracking,
                                        favorite: !currentSheet.tracking.favorite,
                                      },
                                    }
                                  : currentSheet,
                              ),
                            )
                          }}
                        >
                          ★
                        </button>
                      </div>
                    </div>

                    <label className="block-label">
                      Feeling / Mastery
                      <select
                        value={sheet.tracking.mastery}
                        className={getMasteryClass(
                          sheet.tracking.mastery,
                          getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id),
                        )}
                        onChange={(event) => {
                          triggerPulseFx(setMasteryFx, getSheetKey(effectiveSelectedItem.itemNumber, 'lisaSheets', sheet.id))
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? {
                                    ...currentSheet,
                                    tracking: {
                                      ...currentSheet.tracking,
                                      mastery: event.target.value as Mastery,
                                    },
                                  }
                                : currentSheet,
                            ),
                          )
                        }}
                      >
                        {MASTERY_LEVELS.map((level) => (
                          <option value={level} key={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block-label">
                      Commentaires
                      <textarea
                        value={sheet.tracking.comments}
                        placeholder="Notes de la fiche..."
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? {
                                    ...currentSheet,
                                    tracking: {
                                      ...currentSheet.tracking,
                                      comments: event.target.value,
                                    },
                                  }
                                : currentSheet,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="add-ref-btn"
                  onClick={() =>
                    updateReferenceSheets(effectiveSelectedItem.itemNumber, 'lisaSheets', (currentSheets) => [
                      ...currentSheets,
                      makeReferenceSheet(),
                    ])
                  }
                >
                  + Ajouter fiche LISA
                </button>
              </div>

              <h3>Fiches Plateformes</h3>
              {effectiveSelectedItem.tracking.platformSheets.length === 0 ? (
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedItem.tracking.noPlatformSheets}
                    onChange={(event) =>
                      updateSheetExclusion(effectiveSelectedItem.itemNumber, 'noPlatformSheets', event.target.checked)
                    }
                  />
                  PAS de fiche plateformes
                </label>
              ) : null}
              <div className="reference-grid">
                {effectiveSelectedItem.tracking.platformSheets.length === 0 ? (
                  <p className="muted">Aucune fiche plateforme.</p>
                ) : null}
                {effectiveSelectedItem.tracking.platformSheets.map((sheet) => (
                  <div key={sheet.id} className={`reference-card ${sheet.tracking.favorite ? 'is-favorite' : ''}`}>
                    <div className="reference-row">
                      <button
                        type="button"
                        className="sheet-emoji-btn"
                        title={`Couleur: ${SHEET_COLORS.find((sheetColor) => sheetColor.value === sheet.color)?.label ?? ''}`}
                        onClick={() =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? { ...currentSheet, color: getNextSheetColor(currentSheet.color) }
                                : currentSheet,
                            ),
                          )
                        }
                      >
                        {SHEET_COLORS.find((sheetColor) => sheetColor.value === sheet.color)?.emoji ?? '🟡'}
                      </button>
                      <input
                        type="text"
                        placeholder="Nom de la fiche"
                        value={sheet.name}
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id ? { ...currentSheet, name: event.target.value } : currentSheet,
                            ),
                          )
                        }
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={sheet.url}
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id ? { ...currentSheet, url: event.target.value } : currentSheet,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="remove-ref-btn"
                        onClick={() =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.filter((currentSheet) => currentSheet.id !== sheet.id),
                          )
                        }
                      >
                        -
                      </button>
                    </div>

                    <div className="control-row">
                      <p>Tracking fiche</p>
                      <div className="counter-wrap">
                        <button
                          onClick={() => {
                            if (sheet.tracking.reviews === 0) return
                            handleSheetReviewDelta(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id, -1)
                          }}
                        >
                          -
                        </button>
                        <span className={`review-count${reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)] ? ' bump' : ''}`}>
                          {sheet.tracking.reviews}
                        </span>
                        {reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)] ? (
                          <span
                            className={`review-float ${
                              reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)]!.delta > 0
                                ? 'up'
                                : 'down'
                            }`}
                          >
                            {reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)]!.delta > 0
                              ? `+${reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)]!.delta}`
                              : String(reviewFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)]!.delta)}
                          </span>
                        ) : null}
                        <button onClick={() => handleSheetReviewDelta(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id, 1)}>
                          +
                        </button>
                        <button
                          className={`star-btn ${sheet.tracking.favorite ? 'active' : ''}${
                            starFx[getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id)] ? ' pop' : ''
                          }`}
                          onClick={() => {
                            triggerPulseFx(setStarFx, getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id))
                            updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                              currentSheets.map((currentSheet) =>
                                currentSheet.id === sheet.id
                                  ? {
                                      ...currentSheet,
                                      tracking: {
                                        ...currentSheet.tracking,
                                        favorite: !currentSheet.tracking.favorite,
                                      },
                                    }
                                  : currentSheet,
                              ),
                            )
                          }}
                        >
                          ★
                        </button>
                      </div>
                    </div>

                    <label className="block-label">
                      Feeling / Mastery
                      <select
                        value={sheet.tracking.mastery}
                        className={getMasteryClass(
                          sheet.tracking.mastery,
                          getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id),
                        )}
                        onChange={(event) => {
                          triggerPulseFx(
                            setMasteryFx,
                            getSheetKey(effectiveSelectedItem.itemNumber, 'platformSheets', sheet.id),
                          )
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? {
                                    ...currentSheet,
                                    tracking: {
                                      ...currentSheet.tracking,
                                      mastery: event.target.value as Mastery,
                                    },
                                  }
                                : currentSheet,
                            ),
                          )
                        }}
                      >
                        {MASTERY_LEVELS.map((level) => (
                          <option value={level} key={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block-label">
                      Commentaires
                      <textarea
                        value={sheet.tracking.comments}
                        placeholder="Notes de la fiche..."
                        onChange={(event) =>
                          updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) =>
                            currentSheets.map((currentSheet) =>
                              currentSheet.id === sheet.id
                                ? {
                                    ...currentSheet,
                                    tracking: {
                                      ...currentSheet.tracking,
                                      comments: event.target.value,
                                    },
                                  }
                                : currentSheet,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="add-ref-btn"
                  onClick={() =>
                    updateReferenceSheets(effectiveSelectedItem.itemNumber, 'platformSheets', (currentSheets) => [
                      ...currentSheets,
                      makeReferenceSheet(),
                    ])
                  }
                >
                  + Ajouter fiche plateforme
                </button>
              </div>
            </>
          ) : (
            <p>Aucun item trouvé.</p>
          )}
        </article>
      </section>

      {historyItem ? (
        <div className="history-modal-backdrop" onClick={() => setHistoryItemId(null)}>
          <div className="history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="history-modal-head">
              <h3>Historique Item #{historyItem.itemNumber}</h3>
              <button type="button" className="ghost-btn" onClick={() => setHistoryItemId(null)}>
                Fermer
              </button>
            </div>
            <div className="history-modal-body">
              {historyItem.tracking.actionLogs.length === 0 ? (
                <p className="muted">Aucune action enregistrée pour cet item.</p>
              ) : (
                historyItem.tracking.actionLogs
                  .slice()
                  .reverse()
                  .map((log, idx) => (
                    <div key={`${log.at}-${idx}`} className="history-log-row">
                      <p className="history-log-date">{formatDateTime(log.at)}</p>
                      <p className="history-log-action">{log.action}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {quizItem ? (
        <div className="quiz-modal-backdrop" onClick={closeQuiz}>
          <div className="quiz-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quiz-modal-head">
              <h3>Quiz item #{quizItem.itemNumber}</h3>
              <div className="quiz-head-actions">
                <span className="quiz-card-counter">
                  {Math.max(
                    1,
                    quizItem.tracking.quiz.cards.findIndex((card) => card.id === quizItem.tracking.quiz.activeCardId) + 1,
                  )}
                  /{Math.max(1, quizItem.tracking.quiz.cards.length)}
                </span>
                <button
                  type="button"
                  className="ghost-btn quiz-manage-btn"
                  onClick={() => {
                    addQuizCard(quizItem.itemNumber)
                    setQuizSide('front')
                    setQuizEditMode(true)
                  }}
                  title="Créer une flashcard"
                >
                  ➕
                </button>
                <button
                  type="button"
                  className={`ghost-btn quiz-manage-btn ${quizEditMode ? 'active' : ''}`}
                  onClick={() => setQuizEditMode((current) => !current)}
                  title="Modifier la flashcard"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="ghost-btn quiz-manage-btn danger"
                  onClick={removeActiveQuizCardWithConfirm}
                  title="Supprimer la flashcard"
                >
                  🗑️
                </button>
                <button type="button" className="ghost-btn" onClick={() => navigateQuizCard('prev')}>
                  ←
                </button>
                <button type="button" className="ghost-btn" onClick={() => navigateQuizCard('next')}>
                  →
                </button>
                <button type="button" className="ghost-btn" onClick={closeQuiz}>
                  Close
                </button>
              </div>
            </div>

            <div
              className={`quiz-flashcard ${quizItem.tracking.quiz.animationStyle} ${
                quizSide === 'back' ? 'is-back' : 'is-front'
              }`}
              onClick={() => setQuizSide((current) => (current === 'front' ? 'back' : 'front'))}
            >
              <div className="quiz-face quiz-front">
                <p className="quiz-face-label">Question</p>
                <p className="quiz-face-content">{quizQuestion}</p>
              </div>
              <div className="quiz-face quiz-back">
                <p className="quiz-face-label">Réponse</p>
                <p className="quiz-face-content">{quizAnswer}</p>
                {quizItem.tracking.quiz.showTags ? (
                  <p className="quiz-face-meta">
                    <strong>Tags:</strong> {quizItem.tagLabels.join(', ') || 'Aucun'}
                  </p>
                ) : null}
                {quizItem.tracking.quiz.showColleges ? (
                  <p className="quiz-face-meta">
                    <strong>Colleges:</strong> {quizItem.tracking.assignedColleges.join(', ') || 'Aucun'}
                  </p>
                ) : null}
              </div>
            </div>

            {quizEditMode && activeQuizCard ? (
              <div className="quiz-modal-editor">
                <label className="block-label">
                  Question
                  <input
                    type="text"
                    placeholder="Question de la flashcard..."
                    value={activeQuizCard.question}
                    onChange={(event) =>
                      updateQuizCard(quizItem.itemNumber, activeQuizCard.id, { question: event.target.value })
                    }
                  />
                </label>
                <label className="block-label">
                  Réponse
                  <textarea
                    placeholder="Réponse de la flashcard..."
                    value={activeQuizCard.answer}
                    onChange={(event) =>
                      updateQuizCard(quizItem.itemNumber, activeQuizCard.id, { answer: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}

            <div className="quiz-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setQuizSide((current) => (current === 'front' ? 'back' : 'front'))}
              >
                Flip
              </button>
              <button type="button" className="ghost-btn quiz-rate-btn again" onClick={() => handleQuizResult('again')}>
                ❌ Revoir
              </button>
              <button type="button" className="ghost-btn quiz-rate-btn hard" onClick={() => handleQuizResult('hard')}>
                ⚠️ Difficile
              </button>
              <button type="button" className="ghost-btn quiz-rate-btn good" onClick={() => handleQuizResult('good')}>
                ✅ Bon
              </button>
              <button type="button" className="ghost-btn quiz-rate-btn easy" onClick={() => handleQuizResult('easy')}>
                ⚡ Parfait
              </button>
            </div>

            {quizFeedback ? (
              <div className={`quiz-feedback ${quizFeedback} reward-${quizItem.tracking.quiz.rewardIntensity}`}>
                <span className="quiz-feedback-main">
                  {QUIZ_RESULT_META[quizFeedback].icon} {QUIZ_RESULT_META[quizFeedback].label}
                </span>
                {quizFeedback === 'good' || quizFeedback === 'easy' ? (
                  <span className="quiz-feedback-plus-one" aria-hidden="true">
                    +1
                  </span>
                ) : null}
                {quizFeedback === 'good' ? (
                  <span className="quiz-feedback-check" aria-hidden="true">
                    ✔️
                  </span>
                ) : null}
                {quizFeedback === 'easy' && quizItem.tracking.quiz.rewardIntensity !== 'low' ? (
                  <span className="quiz-feedback-sparkles" aria-hidden="true">
                    ✨⚡
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="bottom-grid">
        <article className="panel compact-panel">
          <div className="panel-head">
            <h2>Progression par college</h2>
          </div>
          <div className="college-metrics">
            {globalStats.byCollege.map((row) => (
              <div key={row.college} className="metric-row">
                <p>{row.college}</p>
                <p>
                  {row.completed}/{row.assigned} ({row.progress.toFixed(0)}%) - {row.reviews} reviews
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}

export default App
