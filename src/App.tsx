import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
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
type NavView = 'dashboard' | 'items' | 'flashcards' | 'colleges' | 'stats'
type FlashGeneratorScope = 'items' | 'colleges'
type FlashFeelingFilter = 'none' | QuizResult

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
  lastResult: QuizResult | null
  quizCount: number
  lastReviewedAt: string | null
}

type QuizConfig = {
  enabled: boolean
  cards: QuizCard[]
  activeCardId: string | null
  animationStyle: QuizAnimationStyle
  rewardIntensity: RewardIntensity
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

type GlobalFlashcard = {
  itemNumber: number
  cardId: string
  question: string
  answer: string
  lastResult: QuizResult | null
  colleges: string[]
  quizCount: number
  lastReviewedAt: string | null
}

type CollegeViewRow = {
  college: string
  items: Array<{ itemNumber: number; shortDescription: string; reviews: number; mastery: Mastery }>
  completion: number
  totalReviews: number
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
  return {
    enabled: false,
    cards: [],
    activeCardId: null,
    animationStyle: 'flip',
    rewardIntensity: 'medium',
  }
}

function makeQuizCard(partial?: Partial<QuizCard>): QuizCard {
  const rawCount = typeof partial?.quizCount === 'number' ? partial.quizCount : 0
  return {
    id: partial?.id ?? `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: partial?.question ?? '',
    answer: partial?.answer ?? '',
    lastResult: isQuizResult(partial?.lastResult) ? partial.lastResult : null,
    quizCount: Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0,
    lastReviewedAt: typeof partial?.lastReviewedAt === 'string' ? partial.lastReviewedAt : null,
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
  const normalizedCards =
    Array.isArray(rawQuiz?.cards)
      ? rawQuiz.cards
          .filter((card) => Boolean(card && typeof card === 'object'))
          .map((card) => makeQuizCard(card))
      : []
  const normalizedActiveCardId =
    typeof rawQuiz?.activeCardId === 'string' && normalizedCards.some((card) => card.id === rawQuiz.activeCardId)
      ? rawQuiz.activeCardId
      : null

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
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [collegeFilter, setCollegeFilter] = useState<string>('ALL')
  const [masteryFilter, setMasteryFilter] = useState<string>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('reviews')
  const [activeView, setActiveView] = useState<NavView>('dashboard')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [flashGeneratorScope, setFlashGeneratorScope] = useState<FlashGeneratorScope>('items')
  const [flashCollegeFilter, setFlashCollegeFilter] = useState<string>('ALL')
  const [flashItemFilter, setFlashItemFilter] = useState<string>('ALL')
  const [flashResultFilter, setFlashResultFilter] = useState<'ALL' | QuizResult>('ALL')
  const [flashSelectedItems, setFlashSelectedItems] = useState<number[]>(() => rawItems.map((item) => item.itemNumber))
  const [flashSelectedColleges, setFlashSelectedColleges] = useState<string[]>(() => [...COLLEGES])
  const [flashSelectedFeelings, setFlashSelectedFeelings] = useState<FlashFeelingFilter[]>([
    'none',
    'again',
    'hard',
    'good',
    'easy',
  ])
  const [flashPrioritizeWeak, setFlashPrioritizeWeak] = useState(false)
  const [flashQuestionCount, setFlashQuestionCount] = useState(20)
  const [flashGeneratedCardKeys, setFlashGeneratedCardKeys] = useState<string[]>([])
  const [flashGeneratorModalOpen, setFlashGeneratorModalOpen] = useState(false)
  const [flashGeneratorStep, setFlashGeneratorStep] = useState(1)
  const [flashGeneratedIndex, setFlashGeneratedIndex] = useState(0)
  const [flashGeneratedSide, setFlashGeneratedSide] = useState<'front' | 'back'>('front')
  const [flashGeneratedFeedback, setFlashGeneratedFeedback] = useState<QuizResult | null>(null)
  const [flashGeneratedSessionResults, setFlashGeneratedSessionResults] = useState<Record<string, QuizResult>>({})
  const [flashIndex, setFlashIndex] = useState(0)
  const [flashSide, setFlashSide] = useState<'front' | 'back'>('front')
  const [flashFeedback, setFlashFeedback] = useState<QuizResult | null>(null)
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
  const [quizConfigExpanded, setQuizConfigExpanded] = useState(false)
  const [quizPulseByItem, setQuizPulseByItem] = useState<Record<number, number>>({})
  const [reviewFx, setReviewFx] = useState<Record<string, { delta: number; id: number }>>({})
  const [starFx, setStarFx] = useState<Record<string, number>>({})
  const [masteryFx, setMasteryFx] = useState<Record<string, number>>({})
  const [authTransitionPhase, setAuthTransitionPhase] = useState<'idle' | 'expanding'>('idle')
  const [dashboardIntroPhase, setDashboardIntroPhase] = useState<'idle' | 'entering'>('idle')
  const [authExpandStyle, setAuthExpandStyle] = useState<CSSProperties>({})
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const authCardRef = useRef<HTMLDivElement | null>(null)
  const sidebarLogoRef = useRef<HTMLSpanElement | null>(null)
  const sidebarLogoOffsetRef = useRef({ x: 0, y: 0 })
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
    if (!flashGeneratorModalOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFlashGeneratorModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flashGeneratorModalOpen])

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
    if (authStatus !== 'authed' || dashboardIntroPhase !== 'entering') {
      return
    }
    const timer = window.setTimeout(() => setDashboardIntroPhase('idle'), 720)
    return () => window.clearTimeout(timer)
  }, [authStatus, dashboardIntroPhase])

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
      setDashboardIntroPhase('entering')
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
      setDashboardIntroPhase('entering')
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
    if (selectedItemId === null) {
      return null
    }
    if (focusMode && focusCandidates.length > 0 && !focusCandidates.includes(selectedItemId)) {
      return items.find((item) => item.itemNumber === focusCandidates[0])
    }
    return items.find((item) => item.itemNumber === selectedItemId)
  }, [items, selectedItemId, focusMode, focusCandidates])

  const effectiveSelectedItem = selectedItem ?? null

  const itemTableList = useMemo(() => {
    if (!focusMode) {
      return filteredAndSortedItems
    }
    if (effectiveSelectedItem) {
      return filteredAndSortedItems.filter((item) => item.itemNumber === effectiveSelectedItem.itemNumber)
    }
    if (focusCandidates.length === 0) {
      return filteredAndSortedItems
    }
    return filteredAndSortedItems.filter((item) => item.itemNumber === focusCandidates[0])
  }, [focusMode, filteredAndSortedItems, effectiveSelectedItem, focusCandidates])

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

  const quizCurrentCardFeeling = useMemo(() => {
    if (!activeQuizCard?.lastResult) {
      return null
    }
    return {
      label: QUIZ_RESULT_META[activeQuizCard.lastResult].label,
      toneClass: activeQuizCard.lastResult,
    }
  }, [activeQuizCard])

  const allFlashcards = useMemo<GlobalFlashcard[]>(() => {
    return items.flatMap((item) =>
      item.tracking.quiz.cards.map((card) => ({
        itemNumber: item.itemNumber,
        cardId: card.id,
        question: card.question.trim() || getAutoQuizQuestion(item),
        answer: card.answer.trim() || item.shortDescription,
        lastResult: card.lastResult,
        colleges: item.tracking.assignedColleges,
        quizCount: card.quizCount,
        lastReviewedAt: card.lastReviewedAt,
      })),
    )
  }, [items])

  const flashcardsByKey = useMemo(() => {
    return new Map(allFlashcards.map((card) => [`${card.itemNumber}:${card.cardId}`, card]))
  }, [allFlashcards])

  const filteredFlashcards = useMemo<GlobalFlashcard[]>(() => {
    return allFlashcards.filter((entry) => {
      if (flashCollegeFilter !== 'ALL' && !entry.colleges.includes(flashCollegeFilter)) {
        return false
      }
      if (flashItemFilter !== 'ALL' && entry.itemNumber !== Number(flashItemFilter)) {
        return false
      }
      if (flashResultFilter !== 'ALL' && entry.lastResult !== flashResultFilter) {
        return false
      }
      return true
    })
  }, [allFlashcards, flashCollegeFilter, flashItemFilter, flashResultFilter])

  const generatedFlashcards = useMemo<GlobalFlashcard[]>(() => {
    return flashGeneratedCardKeys
      .map((key) => flashcardsByKey.get(key) ?? null)
      .filter((card): card is GlobalFlashcard => card !== null)
  }, [flashcardsByKey, flashGeneratedCardKeys])

  const activeGlobalFlashcard = filteredFlashcards[flashIndex] ?? null
  const activeGeneratedFlashcard = generatedFlashcards[flashGeneratedIndex] ?? null
  const activeGeneratedKey = activeGeneratedFlashcard
    ? `${activeGeneratedFlashcard.itemNumber}:${activeGeneratedFlashcard.cardId}`
    : null

  const generatedRecap = useMemo(() => {
    const success: GlobalFlashcard[] = []
    const toReview: GlobalFlashcard[] = []
    for (const card of generatedFlashcards) {
      const key = `${card.itemNumber}:${card.cardId}`
      const result = flashGeneratedSessionResults[key]
      if (result === 'good' || result === 'easy') {
        success.push(card)
      } else if (result === 'again' || result === 'hard') {
        toReview.push(card)
      }
    }
    const score = generatedFlashcards.length === 0 ? 0 : Math.round((success.length / generatedFlashcards.length) * 100)
    return {
      success,
      toReview,
      answered: success.length + toReview.length,
      total: generatedFlashcards.length,
      score,
      completed: generatedFlashcards.length > 0 && success.length + toReview.length >= generatedFlashcards.length,
    }
  }, [generatedFlashcards, flashGeneratedSessionResults])

  const flashSessionStats = useMemo(() => {
    const reviewed = filteredFlashcards.filter((card) => card.quizCount > 0).length
    const difficult = filteredFlashcards.filter((card) => card.lastResult === 'again' || card.lastResult === 'hard').length
    const good = filteredFlashcards.filter((card) => card.lastResult === 'good' || card.lastResult === 'easy').length
    const completion = filteredFlashcards.length === 0 ? 0 : Math.round((reviewed / filteredFlashcards.length) * 100)
    return { reviewed, difficult, good, completion }
  }, [filteredFlashcards])

  useEffect(() => {
    if (filteredFlashcards.length === 0) {
      setFlashIndex(0)
      return
    }
    if (flashIndex >= filteredFlashcards.length) {
      setFlashIndex(filteredFlashcards.length - 1)
    }
  }, [filteredFlashcards.length, flashIndex])

  useEffect(() => {
    setFlashSide('front')
    setFlashFeedback(null)
  }, [flashIndex, flashCollegeFilter, flashItemFilter, flashResultFilter])

  useEffect(() => {
    if (generatedFlashcards.length === 0) {
      setFlashGeneratedIndex(0)
      setFlashGeneratedSide('front')
      setFlashGeneratedFeedback(null)
      return
    }
    if (flashGeneratedIndex >= generatedFlashcards.length) {
      setFlashGeneratedIndex(generatedFlashcards.length - 1)
    }
  }, [generatedFlashcards.length, flashGeneratedIndex])

  useEffect(() => {
    if (!flashGeneratorModalOpen || flashGeneratorStep !== 3) {
      return
    }
    if (generatedRecap.completed) {
      setFlashGeneratorStep(4)
    }
  }, [flashGeneratorModalOpen, flashGeneratorStep, generatedRecap.completed])

  useEffect(() => {
    if (activeView !== 'flashcards' || flashGeneratorModalOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeGlobalFlashcard) {
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        setFlashSide((current) => (current === 'front' ? 'back' : 'front'))
      } else if (event.key === '1') {
        handleGlobalFlashResult('again')
      } else if (event.key === '2') {
        handleGlobalFlashResult('hard')
      } else if (event.key === '3') {
        handleGlobalFlashResult('good')
      } else if (event.key === '4') {
        handleGlobalFlashResult('easy')
      } else if (event.key === 'ArrowLeft') {
        setFlashIndex((current) => (current - 1 + filteredFlashcards.length) % filteredFlashcards.length)
      } else if (event.key === 'ArrowRight') {
        setFlashIndex((current) => (current + 1) % filteredFlashcards.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView, activeGlobalFlashcard, filteredFlashcards.length, flashGeneratorModalOpen])

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

  const collegesViewRows = useMemo<CollegeViewRow[]>(() => {
    return COLLEGES.map((college) => {
      const collegeItems = items
        .filter((item) => item.tracking.assignedColleges.includes(college))
        .map((item) => {
          const entry = item.tracking.byCollege[college] ?? getDefaultCollegeTracking()
          return {
            itemNumber: item.itemNumber,
            shortDescription: item.shortDescription,
            reviews: entry.reviews,
            mastery: entry.mastery,
          }
        })

      const completed = collegeItems.filter(
        (entry) => entry.reviews > 0 && MASTERY_SCORE[entry.mastery] >= MASTERY_SCORE.Bon,
      ).length
      const completion = collegeItems.length === 0 ? 0 : Math.round((completed / collegeItems.length) * 100)
      const totalReviews = collegeItems.reduce((sum, entry) => sum + entry.reviews, 0)

      return {
        college,
        items: collegeItems,
        completion,
        totalReviews,
      }
    })
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
    setSelectedItemId((current) => (current === itemNumber ? null : itemNumber))
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

  function openQuiz(itemNumber: number, cardId?: string) {
    const item = items.find((entry) => entry.itemNumber === itemNumber)
    if (!item || !item.tracking.quiz.enabled) {
      return
    }
    if (cardId && item.tracking.quiz.activeCardId !== cardId) {
      updateItemQuizConfig(itemNumber, { activeCardId: cardId })
    }
    triggerQuizButtonPulse(itemNumber)
    setQuizItemId(itemNumber)
    setQuizSide('front')
    setQuizFeedback(null)
    setQuizEditMode(false)
  }

  function getQuizCardButtonLabel(card: QuizCard, index: number) {
    const question = card.question.trim()
    if (!question) {
      return `Carte ${index + 1}`
    }
    return question.length > 35 ? `${question.slice(0, 35)}...` : question
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

    setQuizFeedback(result)

    applyQuizResultToCard(quizItem.itemNumber, quizItem.tracking.quiz.activeCardId, result)

    window.setTimeout(() => {
      setQuizFeedback((current) => (current === result ? null : current))
    }, 1200)
  }

  function applyQuizResultToCard(itemNumber: number, targetCardId: string | null, result: QuizResult) {
    const meta = QUIZ_RESULT_META[result]
    const reviewedAt = new Date().toISOString()

    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const nextCards = itemTracking.quiz.cards.map((card, index) => {
        const isActive = targetCardId ? card.id === targetCardId : index === 0
        if (!isActive) {
          return card
        }
        return {
          ...card,
          lastResult: result,
          quizCount: card.quizCount + 1,
          lastReviewedAt: reviewedAt,
        }
      })
      const totalCardQuizCount = nextCards.reduce((sum, card) => sum + card.quizCount, 0)
      const nextTracking = appendActionLogs(
        {
          ...itemTracking,
          lastQuizResult: result,
          quizCount: totalCardQuizCount,
          lastReviewDate: reviewedAt,
          quiz: {
            ...itemTracking.quiz,
            cards: nextCards,
          },
        },
        [`Quiz carte ${meta.icon} ${meta.actionVerb} (${meta.label})`],
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

  function handleGlobalFlashResult(result: QuizResult) {
    if (!activeGlobalFlashcard) {
      return
    }
    applyQuizResultToCard(activeGlobalFlashcard.itemNumber, activeGlobalFlashcard.cardId, result)
    setFlashFeedback(result)
    window.setTimeout(() => {
      setFlashFeedback((current) => (current === result ? null : current))
      setFlashIndex((current) => {
        if (filteredFlashcards.length <= 1) {
          return 0
        }
        return (current + 1) % filteredFlashcards.length
      })
      setFlashSide('front')
    }, 450)
  }

  function handleGeneratedFlashResult(result: QuizResult) {
    if (!activeGeneratedFlashcard || !activeGeneratedKey) {
      return
    }
    applyQuizResultToCard(activeGeneratedFlashcard.itemNumber, activeGeneratedFlashcard.cardId, result)
    setFlashGeneratedSessionResults((current) => ({ ...current, [activeGeneratedKey]: result }))
    setFlashGeneratedFeedback(result)
    window.setTimeout(() => {
      setFlashGeneratedFeedback((current) => (current === result ? null : current))
      setFlashGeneratedIndex((current) => {
        if (generatedFlashcards.length <= 1) {
          return 0
        }
        return (current + 1) % generatedFlashcards.length
      })
      setFlashGeneratedSide('front')
    }, 420)
  }

  function jumpToQuizGeneratorSetup() {
    setFlashGeneratorModalOpen(true)
    setFlashGeneratorStep(1)
    setFlashSide('front')
  }

  function toggleFlashFeeling(feeling: FlashFeelingFilter) {
    setFlashSelectedFeelings((current) =>
      current.includes(feeling) ? current.filter((entry) => entry !== feeling) : [...current, feeling],
    )
    setFlashPrioritizeWeak(false)
  }

  function applyWeakPriorityPreset() {
    setFlashSelectedFeelings(['none', 'again', 'hard'])
    setFlashPrioritizeWeak(true)
  }

  const isFlashStepOneValid =
    flashGeneratorScope === 'items' ? flashSelectedItems.length > 0 : flashSelectedColleges.length > 0
  const isFlashStepTwoValid = flashSelectedFeelings.length > 0

  function applyQuizGenerator() {
    const selectedItemsSet = new Set(flashSelectedItems)
    const selectedCollegesSet = new Set(flashSelectedColleges)
    const selectedFeelingsSet = new Set(flashSelectedFeelings)
    const scopeFiltered = allFlashcards.filter((card) => {
      if (flashGeneratorScope === 'items') {
        return selectedItemsSet.has(card.itemNumber)
      }
      return card.colleges.some((college) => selectedCollegesSet.has(college))
    })

    const feelingFiltered = scopeFiltered.filter((card) => {
      const feeling = card.lastResult ?? 'none'
      return selectedFeelingsSet.has(feeling)
    })

    const weakRank: Record<FlashFeelingFilter, number> = {
      none: 0,
      again: 1,
      hard: 2,
      good: 3,
      easy: 4,
    }

    const ranked = [...feelingFiltered].sort((a, b) => {
      const aFeeling = a.lastResult ?? 'none'
      const bFeeling = b.lastResult ?? 'none'
      const aScore = flashPrioritizeWeak ? weakRank[aFeeling] * 100 + a.quizCount * 4 : a.quizCount
      const bScore = flashPrioritizeWeak ? weakRank[bFeeling] * 100 + b.quizCount * 4 : b.quizCount
      if (aScore !== bScore) {
        return aScore - bScore
      }
      return a.itemNumber - b.itemNumber
    })

    const safeCount = Math.max(1, Math.min(200, Number.isFinite(flashQuestionCount) ? Math.round(flashQuestionCount) : 20))
    const selected = ranked.slice(0, safeCount)
    const keys = selected.map((card) => `${card.itemNumber}:${card.cardId}`)

    setFlashGeneratedCardKeys(keys)
    setFlashGeneratedIndex(0)
    setFlashGeneratedSide('front')
    setFlashGeneratedFeedback(null)
    setFlashGeneratedSessionResults({})
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

  function setSidebarLogoBarOffset(x: number, y: number) {
    const logo = sidebarLogoRef.current
    if (!logo) {
      return
    }
    sidebarLogoOffsetRef.current = { x, y }
    logo.style.setProperty('--logo-bar-offset-x', `${x.toFixed(2)}px`)
    logo.style.setProperty('--logo-bar-offset-y', `${y.toFixed(2)}px`)
  }

  function handleSidebarLogoPointerMove(event: PointerEvent<HTMLSpanElement>) {
    const logo = sidebarLogoRef.current
    if (!logo) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const rect = logo.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const baseCenterX = rect.width / 2
    const baseCenterY = 12
    const distance = Math.hypot(pointerX - baseCenterX, pointerY - baseCenterY)
    const isNearBar = distance <= 18
    const targetY = isNearBar ? 20 : 0

    if (sidebarLogoOffsetRef.current.y === targetY) {
      return
    }

    if (isNearBar) {
      logo.classList.add('is-fleeing')
    } else {
      logo.classList.remove('is-fleeing')
    }
    setSidebarLogoBarOffset(0, targetY)
  }

  function handleSidebarLogoPointerLeave() {
    const logo = sidebarLogoRef.current
    if (!logo) {
      return
    }
    logo.classList.remove('is-fleeing')
    setSidebarLogoBarOffset(0, 0)
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
      const nextActive = remaining.some((card) => card.id === itemTracking.quiz.activeCardId)
        ? itemTracking.quiz.activeCardId
        : null

      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            ...itemTracking,
            quiz: {
              ...itemTracking.quiz,
              cards: remaining,
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
    setSelectedItemId(focusCandidates[nextIndex])
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
    <div
      className={`dashboard-layout ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${
        dashboardIntroPhase === 'entering' ? 'is-shell-entering' : ''
      }`}
    >
      <aside className="dashboard-sidebar">
        <div className="sidebar-head">
          <div className="sidebar-head-top">
            <span
              ref={sidebarLogoRef}
              className="sidebar-logo"
              aria-hidden="true"
              onPointerMove={handleSidebarLogoPointerMove}
              onPointerLeave={handleSidebarLogoPointerLeave}
            >
              <span className="sidebar-logo-bar" />
            </span>
            <div className="sidebar-head-titles">
              <p className="sidebar-grade">IVeme annee</p>
              <p className="sidebar-title">Items Tracker</p>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              ⌂
            </span>
            <span className="sidebar-nav-label">Dashboard</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'items' ? 'active' : ''}`}
            onClick={() => setActiveView('items')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              ☑
            </span>
            <span className="sidebar-nav-label">Items</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'flashcards' ? 'active' : ''}`}
            onClick={() => setActiveView('flashcards')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              ▤
            </span>
            <span className="sidebar-nav-label">FlashCards</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-item ${activeView === 'colleges' ? 'active' : ''}`}
            onClick={() => setActiveView('colleges')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              ◫
            </span>
            <span className="sidebar-nav-label">Colleges</span>
          </button>
          <button
            type="button"
            className="sidebar-nav-item is-disabled"
            disabled
            title="Insights bientôt disponible"
            aria-label="Insights bientôt disponible"
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              ◔
            </span>
            <span className="sidebar-nav-label">Insights</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="menu-wrap">
            <button
              className="ghost-btn sidebar-settings-btn"
              title="Settings"
              aria-label="Settings"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <span className="sidebar-settings-icon" aria-hidden="true">
                ⚙
              </span>
              <span className="sidebar-settings-label">Reglages</span>
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
                  <input type="checkbox" checked={focusMode} onChange={(event) => setFocusMode(event.target.checked)} />
                </label>
                <div className="menu-actions">
                  <button type="button" className="menu-action-btn" onClick={exportBackup}>
                    Exporter sauvegarde
                  </button>
                  <button type="button" className="menu-action-btn" onClick={() => backupInputRef.current?.click()}>
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
          <div className="menu-wrap sidebar-profile-wrap">
            <button
              className="sidebar-profile-trigger"
              title="Profil"
              aria-label="Profil"
              onClick={() => setProfileMenuOpen((value) => !value)}
            >
              {profile.photoUrl ? (
                <img className="sidebar-profile-avatar" src={profile.photoUrl} alt="Profil" />
              ) : (
                <span className="sidebar-profile-avatar profile-avatar-fallback" style={{ background: profile.avatarGradient }}>
                  {getProfileInitials(profile)}
                </span>
              )}
              <span className="sidebar-profile-meta">
                <strong>{profile.firstName || authUser?.displayName || 'Setup Hub'}</strong>
                <small>{profile.email || authUser?.email || 'hello@setup-hub.com'}</small>
              </span>
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
        </div>
      </aside>

      <div className={`dashboard-shell ${activeView === 'items' ? 'items-view-shell' : ''}`}>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? 'Etendre le menu' : 'Replier le menu'}
          title={sidebarCollapsed ? 'Etendre le menu' : 'Replier le menu'}
        >
          {sidebarCollapsed ? '→' : '←'}
        </button>
        <header className="topbar">
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

        {activeView === 'dashboard' ? (
        <div className="dashboard-greeting">
          <p className="dashboard-greeting-text">
            Bonjour, {profile.firstName?.trim() || authUser?.displayName || 'Setup'}.
          </p>
        </div>
        ) : null}

        {activeView === 'dashboard' ? (
        <section id="dashboard-overview" className="global-grid">
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
        ) : null}

        {activeView === 'dashboard' || activeView === 'items' ? (
        <section
          id="items-section"
          className={`main-grid ${effectiveSelectedItem ? 'has-detail' : 'full-table'} ${
            activeView === 'items' ? 'items-only-view' : ''
          }`}
        >
        <article className={`panel table-panel ${effectiveSelectedItem ? '' : 'full-width'}`}>
          <div className="panel-head">
            <h2>Items</h2>
            <p>{itemTableList.length} lignes</p>
          </div>

          <div className="filters-row">
            <input
              type="text"
              placeholder="Search item, tags, college"
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

        <article className={`panel detail-panel ${effectiveSelectedItem ? 'is-open' : 'is-closed'}`}>
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
                    className="ghost-btn"
                    title="Masquer le panneau item"
                    aria-label="Masquer le panneau item"
                    onClick={() => setSelectedItemId(null)}
                  >
                    ✕
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

              <div id="flashcards-section" className="quiz-config-head">
                <div className="quiz-config-title-row">
                  <h3>Quiz item</h3>
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
                </div>
                <button
                  type="button"
                  className={`ghost-btn quiz-config-toggle ${quizConfigExpanded ? 'open' : ''}`}
                  onClick={() => setQuizConfigExpanded((current) => !current)}
                  aria-expanded={quizConfigExpanded}
                  aria-label={quizConfigExpanded ? 'Masquer les détails du quiz' : 'Afficher les détails du quiz'}
                  title={quizConfigExpanded ? 'Masquer les détails' : 'Afficher les détails'}
                >
                  ▾
                </button>
              </div>
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
                          title={card.question.trim() || `Carte ${index + 1}`}
                          onClick={() => {
                            setQuizSide('front')
                            setQuizEditMode(true)
                            updateItemQuizConfig(effectiveSelectedItem.itemNumber, {
                              activeCardId: card.id,
                            })
                            if (effectiveSelectedItem.tracking.quiz.enabled) {
                              openQuiz(effectiveSelectedItem.itemNumber, card.id)
                            }
                          }}
                        >
                          {getQuizCardButtonLabel(card, index)}
                        </button>
                        <span
                          className={`quiz-card-level-pill ${card.lastResult ?? 'none'}`}
                          title={
                            card.lastResult
                              ? `${QUIZ_RESULT_META[card.lastResult].label} · ${card.quizCount} quiz`
                              : 'Non évalué'
                          }
                        >
                          {card.lastResult ? QUIZ_RESULT_META[card.lastResult].icon : '•'}{' '}
                          {card.lastResult ? QUIZ_RESULT_META[card.lastResult].label : 'Non évalué'}
                        </span>
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
                {quizConfigExpanded ? (
                  <>
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
                      <span className="quiz-last-result-label">Niveau carte active</span>
                      {effectiveSelectedItem.tracking.quiz.cards
                        .filter((card) => card.id === effectiveSelectedItem.tracking.quiz.activeCardId)
                        .map((card) =>
                          card.lastResult ? (
                            <span key={card.id} className={`quiz-last-result-pill ${card.lastResult}`}>
                              {QUIZ_RESULT_META[card.lastResult].icon} {QUIZ_RESULT_META[card.lastResult].label}
                            </span>
                          ) : (
                            <span key={card.id} className="quiz-last-result-pill none">
                              Non évalué
                            </span>
                          ),
                        )}
                      {!effectiveSelectedItem.tracking.quiz.cards.some(
                        (card) => card.id === effectiveSelectedItem.tracking.quiz.activeCardId,
                      ) ? (
                        <span className="quiz-last-result-pill none">Non évalué</span>
                      ) : null}
                      <span className="quiz-last-result-count">
                        Quiz faits (carte active):{' '}
                        {effectiveSelectedItem.tracking.quiz.cards.find(
                          (card) => card.id === effectiveSelectedItem.tracking.quiz.activeCardId,
                        )?.quizCount ?? 0}
                      </span>
                    </div>
                  </>
                ) : null}
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
          ) : null}
        </article>
      </section>
      ) : null}

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
                <p className="quiz-face-label">
                  <span>Question</span>
                  {quizCurrentCardFeeling ? (
                    <span className={`quiz-face-feeling ${quizCurrentCardFeeling.toneClass}`}>
                      Feeling: {quizCurrentCardFeeling.label}
                    </span>
                  ) : null}
                </p>
                <p className="quiz-face-content">{quizQuestion}</p>
              </div>
              <div className="quiz-face quiz-back">
                <p className="quiz-face-label">Réponse</p>
                <p className="quiz-face-content">{quizAnswer}</p>
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

      {activeView === 'flashcards' ? (
        <section id="flashcards-section" className="panel flashcards-page">
          <div className="panel-head">
            <h2>FlashCards</h2>
            <p>{filteredFlashcards.length} cartes</p>
          </div>
          <div className="flashcards-generator-callout">
            <div className="flashcards-generator-copy">
              <p className="flashcards-generator-kicker">Nouveau</p>
              <h3>Quiz Generator</h3>
              <p>Construis une session flashcards guidée: sélection items/collèges, ressenti cible, puis nombre de questions.</p>
              <div className="flashcards-generator-tags" aria-hidden="true">
                <span>Items ou collèges</span>
                <span>Ressenti ciblé</span>
                <span>Sans chrono</span>
              </div>
            </div>
            <button type="button" className="ghost-btn flashcards-generator-btn" onClick={jumpToQuizGeneratorSetup}>
              Ouvrir Quiz Generator
            </button>
          </div>
          <div className="flashcards-generator-summary">
            <span>Scope: {flashGeneratorScope === 'items' ? `${flashSelectedItems.length} items` : `${flashSelectedColleges.length} colleges`}</span>
            <span>Ressentis: {flashSelectedFeelings.length}</span>
            <span>Questions: {flashQuestionCount}</span>
          </div>
          <div className="filters-row flashcards-filters">
            <select value={flashCollegeFilter} onChange={(event) => setFlashCollegeFilter(event.target.value)}>
              <option value="ALL">Tous colleges</option>
              {COLLEGES.map((college) => (
                <option key={college} value={college}>
                  {college}
                </option>
              ))}
            </select>
            <select value={flashItemFilter} onChange={(event) => setFlashItemFilter(event.target.value)}>
              <option value="ALL">Tous items</option>
              {items.map((item) => (
                <option key={item.itemNumber} value={String(item.itemNumber)}>
                  Item #{item.itemNumber}
                </option>
              ))}
            </select>
            <select value={flashResultFilter} onChange={(event) => setFlashResultFilter(event.target.value as 'ALL' | QuizResult)}>
              <option value="ALL">Tous ressentis</option>
              <option value="again">Revoir</option>
              <option value="hard">Difficile</option>
              <option value="good">Bon</option>
              <option value="easy">Parfait</option>
            </select>
          </div>
          {flashGeneratorModalOpen ? (
            <div className="flash-generator-modal-overlay" role="presentation" onClick={() => setFlashGeneratorModalOpen(false)}>
              <div className="flash-generator-modal" role="dialog" aria-modal="true" aria-label="Quiz Generator" onClick={(event) => event.stopPropagation()}>
                <div className="flash-generator-modal-head">
                  <h3>Quiz Generator</h3>
                  <p>Étape {flashGeneratorStep}/4</p>
                  <button type="button" className="ghost-btn" onClick={() => setFlashGeneratorModalOpen(false)}>
                    Fermer
                  </button>
                </div>

                {flashGeneratorStep === 1 ? (
                  <div className="flash-generator-step">
                    <p className="flash-generator-step-title">1) Trier par items ou colleges</p>
                    <div className="flashcards-mode-row">
                      <button type="button" className={`ghost-btn ${flashGeneratorScope === 'items' ? 'active' : ''}`} onClick={() => setFlashGeneratorScope('items')}>
                        Par items
                      </button>
                      <button type="button" className={`ghost-btn ${flashGeneratorScope === 'colleges' ? 'active' : ''}`} onClick={() => setFlashGeneratorScope('colleges')}>
                        Par colleges
                      </button>
                    </div>
                    <div className="flash-generator-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() =>
                          flashGeneratorScope === 'items'
                            ? setFlashSelectedItems(items.map((item) => item.itemNumber))
                            : setFlashSelectedColleges([...COLLEGES])
                        }
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() =>
                          flashGeneratorScope === 'items' ? setFlashSelectedItems([]) : setFlashSelectedColleges([])
                        }
                      >
                        Deselect all
                      </button>
                    </div>
                    <div className="flash-generator-chip-grid">
                      {flashGeneratorScope === 'items'
                        ? items.map((item) => {
                            const active = flashSelectedItems.includes(item.itemNumber)
                            return (
                              <button
                                key={`item-pick-${item.itemNumber}`}
                                type="button"
                                className={`flash-generator-chip ${active ? 'active' : ''}`}
                                onClick={() =>
                                  setFlashSelectedItems((current) =>
                                    current.includes(item.itemNumber)
                                      ? current.filter((id) => id !== item.itemNumber)
                                      : [...current, item.itemNumber],
                                  )
                                }
                              >
                                Item #{item.itemNumber}
                              </button>
                            )
                          })
                        : COLLEGES.map((college) => {
                            const active = flashSelectedColleges.includes(college)
                            return (
                              <button
                                key={`college-pick-${college}`}
                                type="button"
                                className={`flash-generator-chip ${active ? 'active' : ''}`}
                                onClick={() =>
                                  setFlashSelectedColleges((current) =>
                                    current.includes(college)
                                      ? current.filter((entry) => entry !== college)
                                      : [...current, college],
                                  )
                                }
                              >
                                {college}
                              </button>
                            )
                          })}
                    </div>
                  </div>
                ) : null}

                {flashGeneratorStep === 2 ? (
                  <div className="flash-generator-step">
                    <p className="flash-generator-step-title">2) Ressenti cible</p>
                    <div className="flash-generator-actions">
                      <button type="button" className="ghost-btn" onClick={applyWeakPriorityPreset}>
                        Prioriser les faibles
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setFlashSelectedFeelings(['none', 'again', 'hard', 'good', 'easy'])
                          setFlashPrioritizeWeak(false)
                        }}
                      >
                        Tous ressentis
                      </button>
                    </div>
                    <div className="flashcards-mode-row">
                      <button type="button" className={`ghost-btn ${flashSelectedFeelings.includes('none') ? 'active' : ''}`} onClick={() => toggleFlashFeeling('none')}>
                        Non evalue
                      </button>
                      <button type="button" className={`ghost-btn ${flashSelectedFeelings.includes('again') ? 'active' : ''}`} onClick={() => toggleFlashFeeling('again')}>
                        Revoir
                      </button>
                      <button type="button" className={`ghost-btn ${flashSelectedFeelings.includes('hard') ? 'active' : ''}`} onClick={() => toggleFlashFeeling('hard')}>
                        Difficile
                      </button>
                      <button type="button" className={`ghost-btn ${flashSelectedFeelings.includes('good') ? 'active' : ''}`} onClick={() => toggleFlashFeeling('good')}>
                        Bon
                      </button>
                      <button type="button" className={`ghost-btn ${flashSelectedFeelings.includes('easy') ? 'active' : ''}`} onClick={() => toggleFlashFeeling('easy')}>
                        Parfait
                      </button>
                    </div>
                    {flashPrioritizeWeak ? <p className="muted">Preset actif: priorisation des faibles.</p> : null}
                  </div>
                ) : null}

                {flashGeneratorStep === 3 ? (
                  <div className="flash-generator-step">
                    <p className="flash-generator-step-title">3) Nombre de questions</p>
                    <div className="flash-generator-count-row">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={flashQuestionCount}
                        onChange={(event) => setFlashQuestionCount(Number(event.target.value) || 1)}
                      />
                      <button type="button" className="ghost-btn flashcards-generator-btn" onClick={applyQuizGenerator}>
                        Generer quiz
                      </button>
                    </div>
                    {generatedFlashcards.length > 0 && activeGeneratedFlashcard ? (
                      <>
                        <div className="flashcards-session-head">
                          <p>
                            Item #{activeGeneratedFlashcard.itemNumber} • {flashGeneratedIndex + 1}/{generatedFlashcards.length}
                          </p>
                          <p className="muted">
                            Ressenti actuel:{' '}
                            {activeGeneratedFlashcard.lastResult ? QUIZ_RESULT_META[activeGeneratedFlashcard.lastResult].label : 'Non evalue'}
                          </p>
                          <div className="flashcards-session-nav">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() =>
                                setFlashGeneratedIndex(
                                  (current) => (current - 1 + generatedFlashcards.length) % generatedFlashcards.length,
                                )
                              }
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => setFlashGeneratedIndex((current) => (current + 1) % generatedFlashcards.length)}
                            >
                              →
                            </button>
                          </div>
                        </div>
                        <div
                          className={`quiz-flashcard flip ${flashGeneratedSide === 'back' ? 'is-back' : 'is-front'}`}
                          onClick={() => setFlashGeneratedSide((current) => (current === 'front' ? 'back' : 'front'))}
                        >
                          <div className="quiz-face quiz-front">
                            <p className="quiz-face-label">Question</p>
                            <p className="quiz-face-content">{activeGeneratedFlashcard.question}</p>
                          </div>
                          <div className="quiz-face quiz-back">
                            <p className="quiz-face-label">Réponse</p>
                            <p className="quiz-face-content">{activeGeneratedFlashcard.answer}</p>
                          </div>
                        </div>
                        <div className="quiz-actions">
                          <button type="button" className="ghost-btn" onClick={() => setFlashGeneratedSide((current) => (current === 'front' ? 'back' : 'front'))}>
                            Flip
                          </button>
                          <button type="button" className="ghost-btn quiz-rate-btn again" onClick={() => handleGeneratedFlashResult('again')}>
                            ❌ Revoir
                          </button>
                          <button type="button" className="ghost-btn quiz-rate-btn hard" onClick={() => handleGeneratedFlashResult('hard')}>
                            ⚠️ Difficile
                          </button>
                          <button type="button" className="ghost-btn quiz-rate-btn good" onClick={() => handleGeneratedFlashResult('good')}>
                            ✅ Bon
                          </button>
                          <button type="button" className="ghost-btn quiz-rate-btn easy" onClick={() => handleGeneratedFlashResult('easy')}>
                            ⚡ Parfait
                          </button>
                        </div>
                        {flashGeneratedFeedback ? (
                          <div className={`quiz-feedback ${flashGeneratedFeedback} reward-medium`}>
                            <span className="quiz-feedback-main">
                              {QUIZ_RESULT_META[flashGeneratedFeedback].icon} {QUIZ_RESULT_META[flashGeneratedFeedback].label}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {flashGeneratorStep === 4 ? (
                  <div className="flash-generator-step flash-generator-recap">
                    <p className="flash-generator-step-title">Récapitulatif de session</p>
                    <div className="flash-generator-recap-score">
                      <strong>{generatedRecap.score}%</strong>
                      <span>
                        {generatedRecap.success.length}/{generatedRecap.total} réussites
                      </span>
                    </div>
                    <div className="flash-generator-recap-grid">
                      <div className="flash-generator-recap-list">
                        <h4>Questions réussies</h4>
                        {generatedRecap.success.length === 0 ? (
                          <p className="muted">Aucune pour le moment.</p>
                        ) : (
                          <ul>
                            {generatedRecap.success.map((card, index) => (
                              <li key={`recap-success-${card.itemNumber}-${card.cardId}`} style={{ animationDelay: `${index * 35}ms` }}>
                                Item #{card.itemNumber} - {card.question}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flash-generator-recap-list">
                        <h4>Questions à revoir</h4>
                        {generatedRecap.toReview.length === 0 ? (
                          <p className="muted">Excellent, rien à revoir.</p>
                        ) : (
                          <ul>
                            {generatedRecap.toReview.map((card, index) => (
                              <li key={`recap-review-${card.itemNumber}-${card.cardId}`} style={{ animationDelay: `${index * 35}ms` }}>
                                Item #{card.itemNumber} - {card.question}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flash-generator-modal-nav">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setFlashGeneratorStep((current) => Math.max(1, current - 1))}
                    disabled={flashGeneratorStep === 1}
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setFlashGeneratorStep((current) => Math.min(4, current + 1))}
                    disabled={
                      (flashGeneratorStep === 1 && !isFlashStepOneValid) ||
                      (flashGeneratorStep === 2 && !isFlashStepTwoValid) ||
                      (flashGeneratorStep === 3 && !generatedRecap.completed) ||
                      flashGeneratorStep === 4
                    }
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flashcards-stats-row">
            <span>Progression session: {flashSessionStats.completion}%</span>
            <span>Revuees: {flashSessionStats.reviewed}</span>
            <span>Difficiles: {flashSessionStats.difficult}</span>
            <span>Bonnes: {flashSessionStats.good}</span>
            <span className="muted">Raccourcis: Espace / 1-4 / ← →</span>
          </div>
          {activeGlobalFlashcard ? (
            <>
              <div className="flashcards-session-head">
                <p>
                  Item #{activeGlobalFlashcard.itemNumber} • {flashIndex + 1}/{filteredFlashcards.length}
                </p>
                <p className="muted">
                  Ressenti actuel:{' '}
                  {activeGlobalFlashcard.lastResult ? QUIZ_RESULT_META[activeGlobalFlashcard.lastResult].label : 'Non evalue'}
                </p>
                <div className="flashcards-session-nav">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setFlashIndex((current) => (current - 1 + filteredFlashcards.length) % filteredFlashcards.length)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setFlashIndex((current) => (current + 1) % filteredFlashcards.length)}
                  >
                    →
                  </button>
                </div>
              </div>
              <div
                className={`quiz-flashcard flip ${flashSide === 'back' ? 'is-back' : 'is-front'}`}
                onClick={() => setFlashSide((current) => (current === 'front' ? 'back' : 'front'))}
              >
                <div className="quiz-face quiz-front">
                  <p className="quiz-face-label">Question</p>
                  <p className="quiz-face-content">{activeGlobalFlashcard.question}</p>
                </div>
                <div className="quiz-face quiz-back">
                  <p className="quiz-face-label">Réponse</p>
                  <p className="quiz-face-content">{activeGlobalFlashcard.answer}</p>
                </div>
              </div>
              <div className="quiz-actions">
                <button type="button" className="ghost-btn" onClick={() => setFlashSide((current) => (current === 'front' ? 'back' : 'front'))}>
                  Flip
                </button>
                <button type="button" className="ghost-btn quiz-rate-btn again" onClick={() => handleGlobalFlashResult('again')}>
                  ❌ Revoir
                </button>
                <button type="button" className="ghost-btn quiz-rate-btn hard" onClick={() => handleGlobalFlashResult('hard')}>
                  ⚠️ Difficile
                </button>
                <button type="button" className="ghost-btn quiz-rate-btn good" onClick={() => handleGlobalFlashResult('good')}>
                  ✅ Bon
                </button>
                <button type="button" className="ghost-btn quiz-rate-btn easy" onClick={() => handleGlobalFlashResult('easy')}>
                  ⚡ Parfait
                </button>
              </div>
              {flashFeedback ? (
                <div className={`quiz-feedback ${flashFeedback} reward-medium`}>
                  <span className="quiz-feedback-main">
                    {QUIZ_RESULT_META[flashFeedback].icon} {QUIZ_RESULT_META[flashFeedback].label}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">Aucune flashcard pour cette configuration de quiz.</p>
          )}
        </section>
      ) : null}

      {activeView === 'colleges' ? (
        <section className="panel colleges-page">
          <div className="panel-head">
            <h2>Colleges</h2>
            <p>{collegesViewRows.filter((row) => row.items.length > 0).length} colleges actifs</p>
          </div>
          <div className="colleges-page-grid">
            <article className="colleges-list">
              {collegesViewRows.map((row) => (
                <details key={row.college} className="college-accordion" open={row.items.length > 0}>
                  <summary>
                    <span>{row.college}</span>
                    <span>
                      {row.items.length} items • {row.totalReviews} reviews • {row.completion}%
                    </span>
                  </summary>
                  {row.items.length === 0 ? (
                    <p className="muted">Aucun item assigné.</p>
                  ) : (
                    <div className="college-accordion-items">
                      {row.items.map((entry) => (
                        <button
                          key={`${row.college}-${entry.itemNumber}`}
                          type="button"
                          className="college-item-chip"
                          onClick={() => {
                            setActiveView('items')
                            setSelectedItemId(entry.itemNumber)
                          }}
                          title={`Item #${entry.itemNumber}`}
                        >
                          #{entry.itemNumber} • {entry.shortDescription}
                        </button>
                      ))}
                    </div>
                  )}
                </details>
              ))}
            </article>

            <article className="colleges-heatmap">
              <h3>Heatmap progression colleges</h3>
              <div className="colleges-heatmap-grid">
                {collegesViewRows.map((row) => {
                  const tone =
                    row.completion >= 75
                      ? 'high'
                      : row.completion >= 50
                        ? 'mid-high'
                        : row.completion >= 25
                          ? 'mid'
                          : row.completion > 0
                            ? 'low'
                            : 'zero'
                  return (
                    <div
                      key={`heat-${row.college}`}
                      className={`colleges-heat-cell ${tone}`}
                      title={`${row.college} • ${row.completion}%`}
                    >
                      <span>{row.college}</span>
                      <strong>{row.completion}%</strong>
                    </div>
                  )
                })}
              </div>
              <div className="colleges-heat-legend">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%+</span>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeView === 'dashboard' ? (
      <section id="stats-section" className="bottom-grid">
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
      ) : null}

      {activeView === 'stats' ? (
        <section className="panel stats-placeholder">
          <h2>Insights</h2>
          <p>Bientôt disponible.</p>
        </section>
      ) : null}
      </div>
    </div>
  )
}

export default App
