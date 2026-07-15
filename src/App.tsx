import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react'
import itemsData from './data/items.json'
import navCollegesIcon from './assets/nav/colleges.svg'
import navDashboardIcon from './assets/nav/dashboard.svg'
import navFlashcardsIcon from './assets/nav/flashcards.svg'
import navInsightsIcon from './assets/nav/insights.svg'
import navItemsIcon from './assets/nav/items.svg'
import logoutIcon from './assets/nav/logout.svg'
import anatomyIcon from 'healthicons/public/icons/svg/outline/devices/microscope.svg?raw'
import anesthesiaIcon from 'healthicons/public/icons/svg/outline/ppe/ppe_face_mask.svg?raw'
import cancerIcon from 'healthicons/public/icons/svg/outline/conditions/ribbon.svg?raw'
import digestiveSurgeryIcon from 'healthicons/public/icons/svg/outline/body/stomach.svg?raw'
import maxillofacialSurgeryIcon from 'healthicons/public/icons/svg/outline/body/head.svg?raw'
import dermatologyIcon from 'healthicons/public/icons/svg/outline/body/body.svg?raw'
import palliativeCareIcon from 'healthicons/public/icons/svg/outline/symbols/palliative-care.svg?raw'
import endocrinologyIcon from 'healthicons/public/icons/svg/outline/body/thyroid.svg?raw'
import geneticsIcon from 'healthicons/public/icons/svg/outline/body/dna.svg?raw'
import geriatricsIcon from 'healthicons/public/icons/svg/outline/people/elderly.svg?raw'
import gynecologyIcon from 'healthicons/public/icons/svg/outline/body/female_reproductive_system.svg?raw'
import obstetricsIcon from 'healthicons/public/icons/svg/outline/people/pregnant.svg?raw'
import hematologyIcon from 'healthicons/public/icons/svg/outline/body/blood_drop.svg?raw'
import hepatologyIcon from 'healthicons/public/icons/svg/outline/body/liver.svg?raw'
import radiologyIcon from 'healthicons/public/icons/svg/outline/devices/xray.svg?raw'
import immunopathologyIcon from 'healthicons/public/icons/svg/outline/symbols/virus-shield.svg?raw'
import infectiologyIcon from 'healthicons/public/icons/svg/outline/symbols/virus.svg?raw'
import cardiovascularIcon from 'healthicons/public/icons/svg/outline/body/heart_organ.svg?raw'
import generalMedicineIcon from 'healthicons/public/icons/svg/outline/devices/stethoscope.svg?raw'
import intensiveCareIcon from 'healthicons/public/icons/svg/outline/devices/defibrillator.svg?raw'
import internalMedicineIcon from 'healthicons/public/icons/svg/outline/body/body.svg?raw'
import occupationalMedicineIcon from 'healthicons/public/icons/svg/outline/specialties/medical_records.svg?raw'
import molecularMedicineIcon from 'healthicons/public/icons/svg/outline/body/enzyme.svg?raw'
import rehabilitationIcon from 'healthicons/public/icons/svg/outline/specialties/physical_therapy.svg?raw'
import vascularMedicineIcon from 'healthicons/public/icons/svg/outline/body/blood_vessel.svg?raw'
import nephrologyIcon from 'healthicons/public/icons/svg/outline/body/kidneys.svg?raw'
import neurosurgeryIcon from 'healthicons/public/icons/svg/outline/people/neuro_surgery.svg?raw'
import neurologyIcon from 'healthicons/public/icons/svg/outline/body/neurology.svg?raw'
import nutritionIcon from 'healthicons/public/icons/svg/outline/nutrition/nutrition.svg?raw'
import ophthalmologyIcon from 'healthicons/public/icons/svg/outline/body/eye.svg?raw'
import entIcon from 'healthicons/public/icons/svg/outline/body/ear.svg?raw'
import orthopedicsIcon from 'healthicons/public/icons/svg/outline/body/skeleton.svg?raw'
import parasitologyIcon from 'healthicons/public/icons/svg/outline/zoonoses/mosquito.svg?raw'
import pediatricsIcon from 'healthicons/public/icons/svg/outline/people/child_care.svg?raw'
import pulmonologyIcon from 'healthicons/public/icons/svg/outline/body/lungs.svg?raw'
import psychiatryIcon from 'healthicons/public/icons/svg/outline/specialties/psychology.svg?raw'
import rheumatologyIcon from 'healthicons/public/icons/svg/outline/body/joints.svg?raw'
import publicHealthIcon from 'healthicons/public/icons/svg/outline/people/people.svg?raw'
import therapeuticIcon from 'healthicons/public/icons/svg/outline/medications/pills_3.svg?raw'
import urologyIcon from 'healthicons/public/icons/svg/outline/body/bladder.svg?raw'
import './App.css'

type Mastery = 'Mauvais' | 'Moyen' | 'Bon' | 'Très bon' | 'Parfait'
type Theme = 'light' | 'dark'
type YouTubeDisplayMode = 'embed' | 'external'
type SortKey = 'itemAsc' | 'itemDesc' | 'reviews' | 'progress' | 'lastReviewAsc' | 'lastReviewDesc'
type SheetColor = 'jaune' | 'rouge' | 'vert' | 'vertfonce'
type SheetKind = 'lisaSheets' | 'platformSheets'
type QuizAnimationStyle = 'flip' | 'fade'
type RewardIntensity = 'low' | 'medium' | 'high'
type QuizResult = 'again' | 'hard' | 'good' | 'easy'
type QuizImageSlot = 'front' | 'back'
type NavView = 'dashboard' | 'items' | 'flashcards' | 'colleges' | 'stats'
type FlashGeneratorScope = 'items' | 'colleges'
type FlashFeelingFilter = 'none' | QuizResult
type FlashCollegeLevelFilter = 'ALL' | FlashFeelingFilter
type FlashCollegeSort = 'progress' | 'name' | 'items'
type SidebarNavBubbleKey = Exclude<NavView, 'stats'>

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
  frontImageDataUrl: string
  hasFrontImageDataUrl: boolean
  backImageDataUrl: string
  hasBackImageDataUrl: boolean
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
  youtubeUrl: string
  usefulLinkUrl: string
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
    youtubeDisplayMode?: YouTubeDisplayMode
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
  frontImageDataUrl: string
  hasFrontImageDataUrl: boolean
  backImageDataUrl: string
  hasBackImageDataUrl: boolean
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
type SaveLockReason = 'session-expired' | 'client-stale'
type IdleLogoutPending = {
  userId: number
  requestedAtMs: number
}
type LocalShadowNotice = {
  savedAtLabel: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const APP_BASE_URL = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')
const CLIENT_APP_VERSION = (import.meta.env.VITE_APP_VERSION ?? '').trim()
const AUTH_TOKEN_STORAGE_KEY = 'med_auth_token'
const LOCAL_CLOUD_SHADOW_PREFIX = 'med_cloud_shadow_v1'
const IDLE_LOGOUT_PENDING_STORAGE_KEY = 'med_idle_logout_pending_v1'
const LAST_ACTIVITY_AT_STORAGE_KEY = 'med_last_activity_at_v1'
const ALLOW_SAME_ORIGIN_API_FALLBACK = String(import.meta.env.VITE_ALLOW_SAME_ORIGIN_API_FALLBACK ?? '')
  .trim()
  .toLowerCase() === 'true'
const AUTO_SAVE_INTERVAL_MS = 20_000
const AUTO_SAVE_DEBOUNCE_MS = 2_000
const IDLE_AUTO_LOGOUT_MS = 15 * 60_000
const IDLE_CHECK_INTERVAL_MS = 5_000
const IDLE_LOGOUT_RETRY_INTERVAL_MS = 15_000
const SESSION_HEARTBEAT_MS = 60_000
const VERSION_CHECK_INTERVAL_MS = 5 * 60_000
const QUIZ_CARD_IMAGE_MAX_BYTES = 1024 * 1024
const HABIT_TRACKER_YEAR = 2026
const REMOTE_STATE_MAX_BYTES = 24_000_000
const REMOTE_MAX_PROFILE_PHOTO_URL_LENGTH = 1_000_000
const REMOTE_QUIZ_IMAGE_PLACEHOLDER = '__remote_quiz_image__'
const QUIZ_IMAGE_SLOTS: QuizImageSlot[] = ['front', 'back']
const REMOTE_PAYLOAD_FALLBACKS = [
  { maxActionLogsPerItem: 220, allowProfilePhoto: true },
  { maxActionLogsPerItem: 140, allowProfilePhoto: true },
  { maxActionLogsPerItem: 80, allowProfilePhoto: true },
  { maxActionLogsPerItem: 40, allowProfilePhoto: true },
  { maxActionLogsPerItem: 20, allowProfilePhoto: false },
  { maxActionLogsPerItem: 0, allowProfilePhoto: false },
] as const
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

function getStoredAuthToken() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
}

function storeAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return
  }
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  }
}

function getLocalCloudShadowKey(userId: number) {
  return `${LOCAL_CLOUD_SHADOW_PREFIX}:${userId}`
}

function readLocalCloudShadow(userId: number): { body: string; savedAtMs: number } | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(getLocalCloudShadowKey(userId))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as { body?: unknown; savedAtMs?: unknown }
    const body = typeof parsed.body === 'string' ? parsed.body : ''
    const savedAtMs = Number(parsed.savedAtMs)
    if (!body || !Number.isFinite(savedAtMs) || savedAtMs <= 0) {
      return null
    }
    return { body, savedAtMs }
  } catch {
    return null
  }
}

function writeLocalCloudShadow(userId: number, body: string) {
  if (typeof window === 'undefined' || !body) {
    return
  }
  try {
    window.localStorage.setItem(
      getLocalCloudShadowKey(userId),
      JSON.stringify({
        body,
        savedAtMs: Date.now(),
      }),
    )
  } catch {
    // Ignore local quota/privacy errors, cloud save still continues.
  }
}

function clearLocalCloudShadow(userId: number) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(getLocalCloudShadowKey(userId))
  } catch {
    // Ignore local storage errors.
  }
}

function readIdleLogoutPending(): IdleLogoutPending | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(IDLE_LOGOUT_PENDING_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as { userId?: unknown; requestedAtMs?: unknown }
    const userId = Number(parsed.userId)
    const requestedAtMs = Number(parsed.requestedAtMs)
    if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(requestedAtMs) || requestedAtMs <= 0) {
      return null
    }
    return { userId, requestedAtMs }
  } catch {
    return null
  }
}

function writeIdleLogoutPending(pending: IdleLogoutPending) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(IDLE_LOGOUT_PENDING_STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // Ignore local storage errors.
  }
}

function clearIdleLogoutPending() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(IDLE_LOGOUT_PENDING_STORAGE_KEY)
  } catch {
    // Ignore local storage errors.
  }
}

function readLastUserActivityAt() {
  if (typeof window === 'undefined') {
    return 0
  }
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_AT_STORAGE_KEY)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return parsed
  } catch {
    return 0
  }
}

function writeLastUserActivityAt(timestampMs: number) {
  if (typeof window === 'undefined' || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return
  }
  try {
    window.localStorage.setItem(LAST_ACTIVITY_AT_STORAGE_KEY, String(timestampMs))
  } catch {
    // Ignore local storage errors.
  }
}

function getQuizTextSizeClass(text: string): string {
  const length = text.trim().length
  if (length > 900) {
    return 'quiz-face-content is-xsmall'
  }
  if (length > 520) {
    return 'quiz-face-content is-small'
  }
  if (length > 300) {
    return 'quiz-face-content is-medium'
  }
  return 'quiz-face-content'
}

const QUIZ_TEXT_COLOR_OPTIONS = [
  { label: 'Rouge', value: '#d24747' },
  { label: 'Orange', value: '#d98d11' },
  { label: 'Vert', value: '#00895a' },
  { label: 'Bleu', value: '#2453a3' },
  { label: 'Violet', value: '#6d3fc7' },
  { label: 'Brun', value: '#7a4b2f' },
] as const
const QUIZ_TEXT_HIGHLIGHT_COLOR = '#fff59d'

function normalizeQuizRichTextColor(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return ''
  }
  if (typeof document === 'undefined') {
    return normalized
  }
  const sample = document.createElement('span')
  sample.style.color = ''
  sample.style.color = normalized
  return sample.style.color.trim().toLowerCase()
}

function isAllowedQuizTextColor(value: string) {
  const normalized = normalizeQuizRichTextColor(value)
  return QUIZ_TEXT_COLOR_OPTIONS.some((option) => normalizeQuizRichTextColor(option.value) === normalized)
}

function isAllowedQuizHighlightColor(value: string) {
  return normalizeQuizRichTextColor(value) === normalizeQuizRichTextColor(QUIZ_TEXT_HIGHLIGHT_COLOR)
}

function hasQuizThemeTextColor(element: HTMLElement) {
  return element.classList.contains('quiz-rich-theme-text')
}

function hasQuizBoldText(element: HTMLElement) {
  return element.classList.contains('quiz-rich-bold-text')
}

function hasQuizNormalText(element: HTMLElement) {
  return element.classList.contains('quiz-rich-normal-text')
}

function hasQuizHighlightedText(element: HTMLElement) {
  return element.classList.contains('quiz-rich-highlight-text')
}

function hasQuizPlainHighlightText(element: HTMLElement) {
  return element.classList.contains('quiz-rich-plain-highlight-text')
}

function sanitizeQuizRichTextHtml(input: string) {
  const html = typeof input === 'string' ? input : ''
  if (!html) {
    return ''
  }
  if (typeof document === 'undefined') {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim()
  }

  const source = document.implementation.createHTMLDocument('')
  const target = document.implementation.createHTMLDocument('')
  const sourceRoot = source.createElement('div')
  const targetRoot = target.createElement('div')
  sourceRoot.innerHTML = html

  const appendSanitizedNode = (parent: HTMLElement, node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(target.createTextNode(node.textContent ?? ''))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as HTMLElement
    const tagName = element.tagName.toUpperCase()

    if (tagName === 'BR') {
      parent.appendChild(target.createElement('br'))
      return
    }

    if (tagName === 'B' || tagName === 'STRONG') {
      const strong = target.createElement('strong')
      Array.from(element.childNodes).forEach((child) => appendSanitizedNode(strong, child))
      parent.appendChild(strong)
      return
    }

    if (tagName === 'I' || tagName === 'EM') {
      const em = target.createElement('em')
      Array.from(element.childNodes).forEach((child) => appendSanitizedNode(em, child))
      parent.appendChild(em)
      return
    }

    if (tagName === 'DIV' || tagName === 'P') {
      const block = target.createElement('div')
      Array.from(element.childNodes).forEach((child) => appendSanitizedNode(block, child))
      parent.appendChild(block)
      return
    }

    const hasBoldStyle =
      hasQuizBoldText(element) || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600
    const hasNormalWeightStyle =
      hasQuizNormalText(element) || element.style.fontWeight === 'normal' || element.style.fontWeight === '400'
    const hasItalicStyle = element.style.fontStyle === 'italic'
    const hasNormalFontStyle = element.style.fontStyle === 'normal'
    const hasThemeTextColor = hasQuizThemeTextColor(element)
    const hasHighlightedText = hasQuizHighlightedText(element)
    const hasPlainHighlightText = hasQuizPlainHighlightText(element)
    const color = isAllowedQuizTextColor(element.style.color) ? normalizeQuizRichTextColor(element.style.color) : ''
    const backgroundColor = hasHighlightedText
      ? QUIZ_TEXT_HIGHLIGHT_COLOR
      : isAllowedQuizHighlightColor(element.style.backgroundColor)
      ? normalizeQuizRichTextColor(element.style.backgroundColor)
      : ''

    if (!hasBoldStyle && !hasNormalWeightStyle && !hasItalicStyle && !hasNormalFontStyle && !hasThemeTextColor && !hasPlainHighlightText && !color && !backgroundColor && tagName === 'SPAN') {
      Array.from(element.childNodes).forEach((child) => appendSanitizedNode(parent, child))
      return
    }

    if (!hasBoldStyle && !hasNormalWeightStyle && !hasItalicStyle && !hasNormalFontStyle && !hasThemeTextColor && !hasPlainHighlightText && !color && !backgroundColor && tagName !== 'SPAN') {
      Array.from(element.childNodes).forEach((child) => appendSanitizedNode(parent, child))
      return
    }

    const inlineWrapper = target.createElement('span')

    if (inlineWrapper) {
      if (color) {
        inlineWrapper.style.color = color
      }
      if (hasThemeTextColor) {
        inlineWrapper.className = 'quiz-rich-theme-text'
      }
      if (backgroundColor) {
        inlineWrapper.classList.add('quiz-rich-highlight-text')
      }
      if (hasPlainHighlightText) {
        inlineWrapper.classList.add('quiz-rich-plain-highlight-text')
      }
      if (hasNormalWeightStyle) {
        inlineWrapper.classList.add('quiz-rich-normal-text')
      }
      if (hasNormalFontStyle) {
        inlineWrapper.style.fontStyle = 'normal'
      }
    }

    let currentParent: HTMLElement = inlineWrapper ?? parent
    if (hasBoldStyle) {
      const strong = target.createElement('strong')
      currentParent.appendChild(strong)
      currentParent = strong
    }
    if (hasItalicStyle) {
      if (tagName === 'SPAN') {
        inlineWrapper.style.fontStyle = 'italic'
      } else {
        const em = target.createElement('em')
        currentParent.appendChild(em)
        currentParent = em
      }
    }

    Array.from(element.childNodes).forEach((child) => appendSanitizedNode(currentParent, child))

    parent.appendChild(inlineWrapper)
  }

  Array.from(sourceRoot.childNodes).forEach((child) => appendSanitizedNode(targetRoot, child))
  return targetRoot.innerHTML.trim()
}

function getQuizRichTextPlainText(value: string) {
  const sanitized = sanitizeQuizRichTextHtml(value)
  if (!sanitized) {
    return ''
  }
  if (typeof document === 'undefined') {
    return sanitized.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const doc = document.implementation.createHTMLDocument('')
  const root = doc.createElement('div')
  root.innerHTML = sanitized
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function hasQuizRichTextContent(value: string) {
  return getQuizRichTextPlainText(value).length > 0
}

function applyQuizRichTextCommand(
  editor: HTMLDivElement,
  command:
    | { type: 'bold' | 'italic' | 'highlight' | 'themeColor' }
    | { type: 'color'; value: string },
) {
  editor.focus({ preventScroll: true })
  const range = getEditorRange(editor)
  if (!range || range.collapsed) {
    return
  }

  const selectedText = range.toString()
  if (!selectedText) {
    return
  }
  const isSelectionBold = selectionHasBoldFormatting(editor, range)
  const isSelectionItalic = selectionHasItalicFormatting(editor, range)
  const isSelectionHighlighted = selectionHasHighlightFormatting(editor, range)

  const wrapper = document.createElement('span')
  wrapper.textContent = selectedText

  if (command.type === 'bold') {
    wrapper.classList.add(isSelectionBold ? 'quiz-rich-normal-text' : 'quiz-rich-bold-text')
  }
  if (command.type === 'italic') {
    if (isSelectionItalic) {
      wrapper.style.fontStyle = 'normal'
    } else {
      wrapper.style.fontStyle = 'italic'
    }
  }
  if (command.type === 'highlight') {
    wrapper.classList.add(isSelectionHighlighted ? 'quiz-rich-plain-highlight-text' : 'quiz-rich-highlight-text')
  }
  if (command.type === 'color') {
    wrapper.style.color = command.value
  }
  if (command.type === 'themeColor') {
    wrapper.classList.add('quiz-rich-theme-text')
  }

  range.deleteContents()
  range.insertNode(wrapper)
  placeCaretAfterNode(wrapper)
}

function getEditorSelection(editor: HTMLDivElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) {
    return null
  }
  if (!editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
    return null
  }
  return selection
}

function getEditorRange(editor: HTMLDivElement) {
  const selection = getEditorSelection(editor)
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  return selection.getRangeAt(0)
}

function getClosestElementMatching(
  node: Node | null,
  editor: HTMLDivElement,
  predicate: (element: HTMLElement) => boolean,
) {
  let current: Node | null = node
  while (current && current !== editor) {
    if (current.nodeType === Node.ELEMENT_NODE && predicate(current as HTMLElement)) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

function elementHasBoldFormatting(element: HTMLElement) {
  return (
    hasQuizBoldText(element) ||
    element.tagName === 'STRONG' ||
    element.tagName === 'B' ||
    element.style.fontWeight === 'bold' ||
    Number(element.style.fontWeight) >= 600
  )
}

function elementHasItalicFormatting(element: HTMLElement) {
  return element.tagName === 'EM' || element.tagName === 'I' || element.style.fontStyle === 'italic'
}

function elementHasHighlightFormatting(element: HTMLElement) {
  return hasQuizHighlightedText(element) || isAllowedQuizHighlightColor(element.style.backgroundColor)
}

function selectionHasFormatting(
  editor: HTMLDivElement,
  range: Range,
  predicate: (element: HTMLElement) => boolean,
) {
  const fragment = range.cloneContents()
  const fragmentRoot = document.createElement('div')
  fragmentRoot.appendChild(fragment)
  if (Array.from(fragmentRoot.querySelectorAll('*')).some((element) => predicate(element as HTMLElement))) {
    return true
  }
  return Boolean(
    getClosestElementMatching(range.startContainer, editor, predicate) ||
      getClosestElementMatching(range.endContainer, editor, predicate),
  )
}

function selectionHasBoldFormatting(editor: HTMLDivElement, range: Range) {
  return selectionHasFormatting(editor, range, elementHasBoldFormatting)
}

function selectionHasItalicFormatting(editor: HTMLDivElement, range: Range) {
  return selectionHasFormatting(editor, range, elementHasItalicFormatting)
}

function selectionHasHighlightFormatting(editor: HTMLDivElement, range: Range) {
  return selectionHasFormatting(editor, range, elementHasHighlightFormatting)
}

function hasSelectedEditorText(editor: HTMLDivElement) {
  const selection = getEditorSelection(editor)
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0)
}

function placeCaretAfterNode(node: Node) {
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function insertPlainTextAtEditorSelection(editor: HTMLDivElement, text: string) {
  const range = getEditorRange(editor)
  if (!range) {
    editor.appendChild(document.createTextNode(text))
    return
  }
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  placeCaretAfterNode(textNode)
}

type QuizRichTextEditorProps = {
  value: string
  placeholder: string
  onChange: (value: string) => void
}

function QuizRichTextEditor({ value, placeholder, onChange }: QuizRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)
  const lastSelectionRangeRef = useRef<Range | null>(null)
  const lastEmittedValueRef = useRef('')
  const lastAppliedValueRef = useRef('')
  const normalizedValue = sanitizeQuizRichTextHtml(value)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    if (isFocusedRef.current) {
      return
    }
    if (lastAppliedValueRef.current === normalizedValue && sanitizeQuizRichTextHtml(editor.innerHTML) === normalizedValue) {
      return
    }
    editor.innerHTML = normalizedValue
    lastAppliedValueRef.current = normalizedValue
    lastEmittedValueRef.current = normalizedValue
  }, [normalizedValue])

  const syncValue = (options: { commitDom?: boolean } = {}) => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    const nextValue = sanitizeQuizRichTextHtml(editor.innerHTML)
    if (options.commitDom) {
      const nextDomValue = nextValue || ''
      if (editor.innerHTML !== nextDomValue) {
        editor.innerHTML = nextDomValue
      }
      lastAppliedValueRef.current = nextValue
    }
    if (lastEmittedValueRef.current !== nextValue) {
      lastEmittedValueRef.current = nextValue
      onChange(nextValue)
    }
  }

  const saveSelectionRange = () => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    const range = getEditorRange(editor)
    if (!range || range.collapsed) {
      return
    }
    lastSelectionRangeRef.current = range.cloneRange()
  }

  const restoreSelectionRange = () => {
    const editor = editorRef.current
    const range = lastSelectionRangeRef.current
    const selection = window.getSelection()
    if (!editor || !range || !selection) {
      return
    }
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      lastSelectionRangeRef.current = null
      return
    }
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const runCommand = (
    command:
      | { type: 'bold' | 'italic' | 'highlight' | 'themeColor' }
      | { type: 'color'; value: string },
  ) => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    restoreSelectionRange()
    if (!hasSelectedEditorText(editor)) {
      editor.focus({ preventScroll: true })
      return
    }
    applyQuizRichTextCommand(editor, command)
    syncValue()
    lastSelectionRangeRef.current = null
    window.getSelection()?.removeAllRanges()
  }

  const runToolbarCommand = (
    event: ReactMouseEvent<HTMLButtonElement>,
    command:
      | { type: 'bold' | 'italic' | 'highlight' | 'themeColor' }
      | { type: 'color'; value: string },
  ) => {
    event.preventDefault()
    runCommand(command)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    if (!pastedText) {
      return
    }
    const editor = editorRef.current
    if (!editor) {
      return
    }
    insertPlainTextAtEditorSelection(editor, pastedText)
    syncValue()
  }

  const handleBeforeInput = (event: FormEvent<HTMLDivElement>) => {
    const inputType = (event.nativeEvent as InputEvent).inputType ?? ''
    if (inputType.startsWith('format')) {
      event.preventDefault()
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) {
      return
    }
    const key = event.key.toLowerCase()
    if (key !== 'b' && key !== 'i' && key !== 'u') {
      return
    }
    event.preventDefault()
    if (key === 'b') {
      runCommand({ type: 'bold' })
    }
    if (key === 'i') {
      runCommand({ type: 'italic' })
    }
  }

  return (
    <div className="quiz-rich-editor">
      <div className="quiz-rich-toolbar">
        <button type="button" className="ghost-btn" onMouseDown={(event) => runToolbarCommand(event, { type: 'bold' })}>
          Gras
        </button>
        <button type="button" className="ghost-btn" onMouseDown={(event) => runToolbarCommand(event, { type: 'italic' })}>
          Italique
        </button>
        <button type="button" className="ghost-btn" onMouseDown={(event) => runToolbarCommand(event, { type: 'highlight' })}>
          Surligner
        </button>
        <button
          type="button"
          className="ghost-btn quiz-rich-color-btn"
          title="Couleur normale"
          aria-label="Couleur normale"
          onMouseDown={(event) => runToolbarCommand(event, { type: 'themeColor' })}
        >
          <span className="quiz-rich-color-swatch quiz-rich-theme-color-swatch" aria-hidden="true" />
        </button>
        {QUIZ_TEXT_COLOR_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="ghost-btn quiz-rich-color-btn"
            title={option.label}
            aria-label={option.label}
            onMouseDown={(event) => runToolbarCommand(event, { type: 'color', value: option.value })}
          >
            <span className="quiz-rich-color-swatch" style={{ backgroundColor: option.value }} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="quiz-rich-editable"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-placeholder={placeholder}
        onInput={() => {
          syncValue()
          saveSelectionRange()
        }}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onBlur={() => {
          isFocusedRef.current = false
          syncValue({ commitDom: true })
        }}
        onPaste={handlePaste}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        onKeyUp={saveSelectionRange}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
        }}
        onMouseUp={saveSelectionRange}
        onDoubleClick={(event) => {
          event.stopPropagation()
          window.requestAnimationFrame(saveSelectionRange)
        }}
      />
    </div>
  )
}

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

type CollegeName = (typeof COLLEGES)[number]

const COLLEGE_ICON_META: Record<CollegeName, { svg: string; label: string }> = {
  'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES': { svg: anatomyIcon, label: 'Microscope' },
  'ANESTHÉSIE - RÉANIMATION': { svg: anesthesiaIcon, label: "Masque d'anesthésie" },
  CANCÉROLOGIE: { svg: cancerIcon, label: 'Ruban de sensibilisation' },
  'CHIRURGIE DIGESTIVE': { svg: digestiveSurgeryIcon, label: 'Estomac' },
  'CHIRURGIE MAXILLO-FACIALE': { svg: maxillofacialSurgeryIcon, label: 'Tête' },
  DERMATOLOGIE: { svg: dermatologyIcon, label: 'Peau' },
  'DOULEUR - SOINS PALLIATIFS': { svg: palliativeCareIcon, label: 'Soins palliatifs' },
  ENDOCRINOLOGIE: { svg: endocrinologyIcon, label: 'Thyroïde' },
  GÉNÉTIQUE: { svg: geneticsIcon, label: 'ADN' },
  GÉRIATRIE: { svg: geriatricsIcon, label: 'Personne âgée' },
  'GYNÉCOLOGIE MÉDICALE': { svg: gynecologyIcon, label: 'Appareil reproducteur féminin' },
  'GYNÉCOLOGIE OBSTÉTRIQUE': { svg: obstetricsIcon, label: 'Grossesse' },
  HÉMATOLOGIE: { svg: hematologyIcon, label: 'Goutte de sang' },
  'HÉPATO-GASTRO-ENTÉROLOGIE': { svg: hepatologyIcon, label: 'Foie' },
  'IMAGERIE MÉDICALE': { svg: radiologyIcon, label: 'Radiographie' },
  IMMUNOPATHOLOGIE: { svg: immunopathologyIcon, label: 'Protection immunitaire' },
  INFECTIOLOGIE: { svg: infectiologyIcon, label: 'Virus' },
  'MÉDECINE CARDIOVASCULAIRE': { svg: cardiovascularIcon, label: 'Cœur' },
  'MÉDECINE GÉNÉRALE': { svg: generalMedicineIcon, label: 'Stéthoscope' },
  'MÉDECINE INTENSIVE - RÉANIMATION - URGENCES': { svg: intensiveCareIcon, label: 'Défibrillateur' },
  'MÉDECINE INTERNE': { svg: internalMedicineIcon, label: 'Corps humain' },
  'MÉDECINE LÉGALE - MÉDECINE DU TRAVAIL': { svg: occupationalMedicineIcon, label: 'Dossier médical' },
  'MÉDECINE MOLÉCULAIRE': { svg: molecularMedicineIcon, label: 'Enzyme' },
  'MÉDECINE PHYSIQUE ET RÉADAPTATION': { svg: rehabilitationIcon, label: 'Rééducation' },
  'MÉDECINE VASCULAIRE': { svg: vascularMedicineIcon, label: 'Vaisseau sanguin' },
  NÉPHROLOGIE: { svg: nephrologyIcon, label: 'Reins' },
  NEUROCHIRURGIE: { svg: neurosurgeryIcon, label: 'Neurochirurgie' },
  NEUROLOGIE: { svg: neurologyIcon, label: 'Neurologie' },
  NUTRITION: { svg: nutritionIcon, label: 'Nutrition' },
  OPHTALMOLOGIE: { svg: ophthalmologyIcon, label: 'Œil' },
  ORL: { svg: entIcon, label: 'Oreille' },
  'ORTHOPÉDIE - TRAUMATOLOGIE': { svg: orthopedicsIcon, label: 'Squelette' },
  PARASITOLOGIE: { svg: parasitologyIcon, label: 'Moustique' },
  PÉDIATRIE: { svg: pediatricsIcon, label: 'Enfant' },
  PNEUMOLOGIE: { svg: pulmonologyIcon, label: 'Poumons' },
  'PSYCHIATRIE - ADDICTOLOGIE': { svg: psychiatryIcon, label: 'Psychologie' },
  RHUMATOLOGIE: { svg: rheumatologyIcon, label: 'Articulation' },
  'SANTÉ PUBLIQUE': { svg: publicHealthIcon, label: 'Groupe de personnes' },
  THÉRAPEUTIQUE: { svg: therapeuticIcon, label: 'Médicaments' },
  UROLOGIE: { svg: urologyIcon, label: 'Vessie' },
}

function CollegeHealthIcon({ college, className = '' }: { college: string; className?: string }) {
  const iconMeta = COLLEGE_ICON_META[college as CollegeName]

  if (!iconMeta) {
    return null
  }

  return (
    <span className={`college-health-icon ${className}`} title={iconMeta.label}>
      <span
        className="college-health-icon-glyph"
        role="img"
        aria-label={iconMeta.label}
        dangerouslySetInnerHTML={{ __html: iconMeta.svg }}
      />
    </span>
  )
}

const FLASH_COLLEGE_DISPLAY_NAMES: Partial<Record<CollegeName, string>> = {
  'ANATOMIE ET CYTOLOGIE PATHOLOGIQUES': 'Anatomie et Cytologie Pathologiques',
  'ANESTHÉSIE - RÉANIMATION': 'Anesthésie - Réanimation',
  'GYNÉCOLOGIE OBSTÉTRIQUE': 'Gynécologie Obstétrique',
  'HÉPATO-GASTRO-ENTÉROLOGIE': 'Hépato-Gastro-Entérologie',
  'MÉDECINE CARDIOVASCULAIRE': 'Cardiologie',
  'ORTHOPÉDIE - TRAUMATOLOGIE': 'Orthopédie - Traumatologie',
}

const FLASH_COLLEGE_ACCENTS = [
  '#df3d6a',
  '#2563eb',
  '#1f9d62',
  '#8b5cf6',
  '#f97316',
  '#f59e0b',
  '#e11d48',
  '#4f46e5',
  '#0e9aa7',
  '#7c3aed',
  '#2f7fd8',
  '#16a34a',
]

function toReadableCollegeName(college: string) {
  return college
    .toLocaleLowerCase('fr-FR')
    .split(/(\s+-\s+|\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part.includes('-')) {
        return part
      }
      return part ? part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1) : part
    })
    .join('')
}

function getFlashCollegeDisplayName(college: string) {
  return FLASH_COLLEGE_DISPLAY_NAMES[college as CollegeName] ?? toReadableCollegeName(college)
}

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

function extractYouTubeVideoId(rawValue: string): string | null {
  const raw = rawValue.trim()
  if (!raw) {
    return null
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return raw
  }

  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase()

    if (host === 'youtu.be') {
      const candidate = url.pathname.slice(1).split('/')[0] ?? ''
      return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        const candidate = url.searchParams.get('v') ?? ''
        return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null
      }

      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)
      if (match?.[1]) {
        return match[1]
      }
    }
  } catch {
    return null
  }

  return null
}

function makeYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function normalizeGenericUrl(rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) {
    return null
  }
  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) ? value : `https://${value}`
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function resolveApiCandidates(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return [path]
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const candidates = new Set<string>()
  let apiBaseOrigin = ''
  if (API_BASE_URL) {
    try {
      apiBaseOrigin = new URL(API_BASE_URL).origin
    } catch {
      apiBaseOrigin = ''
    }
  }

  if (API_BASE_URL) {
    candidates.add(`${API_BASE_URL}${normalizedPath}`)
  }

  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin
    const isExplicitExternalApi = Boolean(apiBaseOrigin && apiBaseOrigin !== currentOrigin)
    const canTrySameOrigin = !isExplicitExternalApi || ALLOW_SAME_ORIGIN_API_FALLBACK
    if (canTrySameOrigin) {
      candidates.add(`${currentOrigin}${normalizedPath}`)
      if (APP_BASE_URL && APP_BASE_URL !== '/') {
        candidates.add(`${currentOrigin}${APP_BASE_URL}${normalizedPath}`)
      }
    }
  } else if (!API_BASE_URL) {
    candidates.add(normalizedPath)
  }

  return Array.from(candidates)
}

function shouldSkipAuthTokenForRequest(url: string) {
  const normalized = url.toLowerCase()
  return (
    normalized.includes('/api/auth/login') ||
    normalized.includes('/api/auth/register/request') ||
    normalized.includes('/api/auth/register/verify') ||
    normalized.includes('/api/auth/password/request') ||
    normalized.includes('/api/auth/password/confirm')
  )
}

function isRetryableApiCandidateStatus(status: number) {
  return status === 404 || status === 405 || status === 500 || status === 502 || status === 503 || status === 504
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
  const legacyBackImageDataUrl = typeof (partial as { imageDataUrl?: unknown })?.imageDataUrl === 'string'
    ? String((partial as { imageDataUrl?: string }).imageDataUrl)
    : ''
  const frontImageDataUrl = typeof partial?.frontImageDataUrl === 'string' ? partial.frontImageDataUrl : ''
  const backImageDataUrl = typeof partial?.backImageDataUrl === 'string' ? partial.backImageDataUrl : legacyBackImageDataUrl
  const legacyHasBackImageDataUrl = Boolean((partial as { hasImageDataUrl?: unknown })?.hasImageDataUrl)
  return {
    id: partial?.id ?? `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: partial?.question ?? '',
    answer: partial?.answer ?? '',
    frontImageDataUrl,
    hasFrontImageDataUrl: Boolean(partial?.hasFrontImageDataUrl) || Boolean(frontImageDataUrl),
    backImageDataUrl,
    hasBackImageDataUrl: Boolean(partial?.hasBackImageDataUrl) || legacyHasBackImageDataUrl || Boolean(backImageDataUrl),
    lastResult: isQuizResult(partial?.lastResult) ? partial.lastResult : null,
    quizCount: Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0,
    lastReviewedAt: typeof partial?.lastReviewedAt === 'string' ? partial.lastReviewedAt : null,
  }
}

function getQuizCardImageDataUrl(
  card: Pick<QuizCard, 'frontImageDataUrl' | 'backImageDataUrl'>,
  slot: QuizImageSlot,
) {
  return slot === 'front' ? card.frontImageDataUrl : card.backImageDataUrl
}

function getQuizCardHasImageDataUrl(
  card: Pick<QuizCard, 'hasFrontImageDataUrl' | 'hasBackImageDataUrl'>,
  slot: QuizImageSlot,
) {
  return slot === 'front' ? card.hasFrontImageDataUrl : card.hasBackImageDataUrl
}

function getQuizCardImagePatch(slot: QuizImageSlot, imageDataUrl: string, hasImageDataUrl: boolean): Partial<QuizCard> {
  return slot === 'front'
    ? { frontImageDataUrl: imageDataUrl, hasFrontImageDataUrl: hasImageDataUrl }
    : { backImageDataUrl: imageDataUrl, hasBackImageDataUrl: hasImageDataUrl }
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
    youtubeUrl: '',
    usefulLinkUrl: '',
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
    youtubeUrl: typeof tracking?.youtubeUrl === 'string' ? tracking.youtubeUrl : '',
    usefulLinkUrl: typeof tracking?.usefulLinkUrl === 'string' ? tracking.usefulLinkUrl : '',
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

function getLatestIsoDate(...values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) {
      return latest
    }
    if (!latest || new Date(value) > new Date(latest)) {
      return value
    }
    return latest
  }, null)
}

function getLatestSheetReviewDate(sheets: ReferenceSheet[]) {
  return sheets.reduce<string | null>((latest, sheet) => getLatestIsoDate(latest, sheet.tracking.lastReviewedAt), null)
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
      youtubeUrl: '',
      usefulLinkUrl: '',
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
    photoUrl:
      typeof profile.photoUrl === 'string' && profile.photoUrl.length <= REMOTE_MAX_PROFILE_PHOTO_URL_LENGTH
        ? profile.photoUrl
        : '',
    password: '',
    avatarGradient:
      typeof profile.avatarGradient === 'string' && profile.avatarGradient ? profile.avatarGradient : base.avatarGradient,
  }
}

type PersistStatePayload = {
  trackingState: TrackerState
  theme: Theme
  focusMode: boolean
  youtubeDisplayMode: YouTubeDisplayMode
  profile: ProfileState
}

function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function formatByteSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB']
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function logOutgoingSavePayload(
  kind: 'patch' | 'full' | 'images',
  requestBytes: number,
  details?: Record<string, unknown>,
) {
  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  console.info(
    `[cloud-save] ${kind} -> ${formatByteSize(requestBytes)} (${requestBytes.toLocaleString('fr-FR')} bytes)${suffix}`,
  )
}

function trimTrackingStateForRemote(
  trackingState: TrackerState,
  options: {
    maxActionLogsPerItem: number
  },
): TrackerState {
  const { maxActionLogsPerItem } = options
  const nextItems: Record<number, ItemTracking> = {}

  for (const [itemNumberRaw, trackingRaw] of Object.entries(trackingState.items)) {
    const itemNumber = Number(itemNumberRaw)
    const tracking = normalizeItemTracking(trackingRaw)
    const trimmedCards = tracking.quiz.cards.map((card) => {
      if (!card.frontImageDataUrl && !card.backImageDataUrl) {
        return card
      }
      return {
        ...card,
        frontImageDataUrl: '',
        hasFrontImageDataUrl: card.hasFrontImageDataUrl || Boolean(card.frontImageDataUrl),
        backImageDataUrl: '',
        hasBackImageDataUrl: card.hasBackImageDataUrl || Boolean(card.backImageDataUrl),
      }
    })

    nextItems[itemNumber] = {
      ...tracking,
      actionLogs: maxActionLogsPerItem > 0 ? tracking.actionLogs.slice(-maxActionLogsPerItem) : [],
      quiz: {
        ...tracking.quiz,
        cards: trimmedCards,
      },
    }
  }

  return { items: nextItems }
}

function sanitizeProfileForRemote(profile: ProfileState, allowPhoto: boolean): ProfileState {
  const keepPhoto =
    allowPhoto &&
    typeof profile.photoUrl === 'string' &&
    profile.photoUrl.length > 0 &&
    profile.photoUrl.length <= REMOTE_MAX_PROFILE_PHOTO_URL_LENGTH

  return {
    ...profile,
    photoUrl: keepPhoto ? profile.photoUrl : '',
    password: '',
  }
}

function buildRemotePersistPayload(payload: PersistStatePayload): { body: string; bytes: number } | null {
  for (const strategy of REMOTE_PAYLOAD_FALLBACKS) {
    const candidatePayload: PersistStatePayload = {
      trackingState: trimTrackingStateForRemote(payload.trackingState, {
        maxActionLogsPerItem: strategy.maxActionLogsPerItem,
      }),
      theme: payload.theme,
      focusMode: payload.focusMode,
      youtubeDisplayMode: payload.youtubeDisplayMode,
      profile: sanitizeProfileForRemote(payload.profile, strategy.allowProfilePhoto),
    }

    const body = JSON.stringify(candidatePayload)
    const bytes = getUtf8ByteLength(body)
    if (bytes <= REMOTE_STATE_MAX_BYTES) {
      return { body, bytes }
    }
  }

  return null
}

function parsePersistStatePayloadBody(body: string, authUser: AuthUser | null): PersistStatePayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<PersistStatePayload>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    if (!parsed.trackingState || typeof parsed.trackingState !== 'object') {
      return null
    }
    return {
      trackingState: parsed.trackingState as TrackerState,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      focusMode: Boolean(parsed.focusMode),
      youtubeDisplayMode: parsed.youtubeDisplayMode === 'external' ? 'external' : 'embed',
      profile: normalizeProfileInput(parsed.profile, authUser),
    }
  } catch {
    return null
  }
}

function areValuesDeepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (typeof left !== typeof right) {
    return false
  }
  if (left === null || right === null) {
    return left === right
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!areValuesDeepEqual(left[index], right[index])) {
        return false
      }
    }
    return true
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
      return false
    }
    if (!areValuesDeepEqual(leftRecord[key], rightRecord[key])) {
      return false
    }
  }
  return true
}

function buildMergePatch(previousValue: unknown, nextValue: unknown): unknown {
  if (areValuesDeepEqual(previousValue, nextValue)) {
    return undefined
  }
  if (
    !previousValue ||
    !nextValue ||
    typeof previousValue !== 'object' ||
    typeof nextValue !== 'object' ||
    Array.isArray(previousValue) ||
    Array.isArray(nextValue)
  ) {
    return nextValue
  }

  const previousRecord = previousValue as Record<string, unknown>
  const nextRecord = nextValue as Record<string, unknown>
  const keys = new Set([...Object.keys(previousRecord), ...Object.keys(nextRecord)])
  const patch: Record<string, unknown> = {}

  for (const key of keys) {
    const hasPrev = Object.prototype.hasOwnProperty.call(previousRecord, key)
    const hasNext = Object.prototype.hasOwnProperty.call(nextRecord, key)
    if (!hasNext) {
      patch[key] = null
      continue
    }
    if (!hasPrev) {
      patch[key] = nextRecord[key]
      continue
    }
    const childPatch = buildMergePatch(previousRecord[key], nextRecord[key])
    if (childPatch !== undefined) {
      patch[key] = childPatch
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

function generateRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function collectQuizImageMap(trackingState: TrackerState): Record<string, string> {
  const images: Record<string, string> = {}
  for (const [itemNumberRaw, trackingRaw] of Object.entries(trackingState.items)) {
    const itemNumber = Number(itemNumberRaw)
    if (!Number.isFinite(itemNumber)) {
      continue
    }
    const tracking = normalizeItemTracking(trackingRaw)
    for (const card of tracking.quiz.cards) {
      for (const slot of QUIZ_IMAGE_SLOTS) {
        const imageDataUrl = getQuizCardImageDataUrl(card, slot).trim()
        if (!imageDataUrl) {
          continue
        }
        images[`${itemNumber}:${card.id}:${slot}`] = imageDataUrl
      }
    }
  }
  return images
}

function collectQuizImagePresenceMap(trackingState: TrackerState): Record<string, string> {
  const images: Record<string, string> = {}
  for (const [itemNumberRaw, trackingRaw] of Object.entries(trackingState.items)) {
    const itemNumber = Number(itemNumberRaw)
    if (!Number.isFinite(itemNumber)) {
      continue
    }
    const tracking = normalizeItemTracking(trackingRaw)
    for (const card of tracking.quiz.cards) {
      for (const slot of QUIZ_IMAGE_SLOTS) {
        const imageDataUrl = getQuizCardImageDataUrl(card, slot).trim()
        if (!getQuizCardHasImageDataUrl(card, slot) && !imageDataUrl) {
          continue
        }
        images[`${itemNumber}:${card.id}:${slot}`] = imageDataUrl || REMOTE_QUIZ_IMAGE_PLACEHOLDER
      }
    }
  }
  return images
}

function hasUnsyncedQuizImageChanges(previousImages: Record<string, string>, trackingState: TrackerState) {
  const currentImages = collectQuizImageMap(trackingState)
  const currentPresence = collectQuizImagePresenceMap(trackingState)
  for (const [key, value] of Object.entries(currentImages)) {
    if (previousImages[key] !== value) {
      return true
    }
  }
  for (const key of Object.keys(previousImages)) {
    if (!currentPresence[key]) {
      return true
    }
  }
  return false
}

function toSaveWarningMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : 'Erreur inconnue'
  const message = rawMessage.trim() || 'Erreur inconnue'
  const lower = message.toLowerCase()
  const isNetworkOrBackendIssue =
    lower.includes('api indisponible') ||
    lower.includes('cloud indisponible') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econn') ||
    /erreur api \(5\d{2}\)/i.test(message)

  if (isNetworkOrBackendIssue) {
    return 'Sauvegarde en attente: réseau/cloud indisponible. Reprise automatique dès reconnexion.'
  }
  if (lower.includes('etat modifi') && lower.includes('ailleurs')) {
    return 'Sauvegarde en attente: état modifié dans une autre session. Recharge la page pour synchroniser.'
  }

  return `Sauvegarde en attente: ${message}`
}

class ApiRequestError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = typeof code === 'string' ? code : ''
  }
}

function getSaveLockReason(error: unknown): SaveLockReason | null {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return 'session-expired'
    }
    if (error.status === 409 || error.status === 412 || error.status === 426) {
      return 'client-stale'
    }

    const lowerCode = error.code.toLowerCase()
    if (lowerCode.includes('auth') || lowerCode.includes('session') || lowerCode.includes('token')) {
      return 'session-expired'
    }
    if (lowerCode.includes('version') || lowerCode.includes('stale') || lowerCode.includes('upgrade')) {
      return 'client-stale'
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  if (
    lower.includes('session') ||
    lower.includes('expired') ||
    lower.includes('token') ||
    lower.includes('authentification') ||
    lower.includes('erreur api (401)') ||
    lower.includes('erreur api (403)')
  ) {
    return 'session-expired'
  }
  if (
    lower.includes('version') ||
    lower.includes('obsolete') ||
    lower.includes('obsol') ||
    lower.includes('client') ||
    lower.includes('upgrade') ||
    lower.includes('erreur api (409)') ||
    lower.includes('erreur api (412)') ||
    lower.includes('erreur api (426)')
  ) {
    return 'client-stale'
  }

  return null
}

function getSaveLockMessage(reason: SaveLockReason) {
  if (reason === 'client-stale') {
    return 'Sauvegarde bloquée: cette page est obsolète après une mise à jour. Recharge la page.'
  }
  return 'Sauvegarde bloquée: session expirée. Reconnecte-toi puis reprends.'
}

function App() {
  const [trackingState, setTrackingState] = useState<TrackerState>(getInitialTrackingState())
  const [theme, setTheme] = useState<Theme>('light')
  const [youtubeDisplayMode, setYoutubeDisplayMode] = useState<YouTubeDisplayMode>('embed')
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
  const [flashCollegeSearch, setFlashCollegeSearch] = useState('')
  const [flashCollegeLevelFilter, setFlashCollegeLevelFilter] = useState<FlashCollegeLevelFilter>('ALL')
  const [flashCollegeSort, setFlashCollegeSort] = useState<FlashCollegeSort>('progress')
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
  const backupInputRef = useRef<HTMLInputElement | null>(null)
  const [hasLoadedRemoteState, setHasLoadedRemoteState] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authView, setAuthView] = useState<AuthView>('login')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [saveErrorMessage, setSaveErrorMessage] = useState('')
  const [localShadowNotice, setLocalShadowNotice] = useState<LocalShadowNotice | null>(null)
  const [saveLockReason, setSaveLockReason] = useState<SaveLockReason | null>(null)
  const [idleLogoutPending, setIdleLogoutPending] = useState<IdleLogoutPending | null>(null)
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
  const [quizImageErrors, setQuizImageErrors] = useState<Record<QuizImageSlot, string>>({ front: '', back: '' })
  const [quizImageFileNames, setQuizImageFileNames] = useState<Record<QuizImageSlot, string>>({ front: '', back: '' })
  const [imageLightboxSrc, setImageLightboxSrc] = useState<string | null>(null)
  const [imageLightboxAlt, setImageLightboxAlt] = useState('Image')
  const [quizPulseByItem, setQuizPulseByItem] = useState<Record<number, number>>({})
  const [reviewFx, setReviewFx] = useState<Record<string, { delta: number; id: number }>>({})
  const [starFx, setStarFx] = useState<Record<string, number>>({})
  const [masteryFx, setMasteryFx] = useState<Record<string, number>>({})
  const [authTransitionPhase, setAuthTransitionPhase] = useState<'idle' | 'expanding'>('idle')
  const [dashboardIntroPhase, setDashboardIntroPhase] = useState<'idle' | 'entering'>('idle')
  const [authExpandStyle, setAuthExpandStyle] = useState<CSSProperties>({})
  const [youtubeInput, setYoutubeInput] = useState('')
  const [youtubeInputError, setYoutubeInputError] = useState('')
  const [usefulLinkInput, setUsefulLinkInput] = useState('')
  const [usefulLinkInputError, setUsefulLinkInputError] = useState('')
  const [youtubeSectionOpen, setYoutubeSectionOpen] = useState(true)
  const [usefulLinkSectionOpen, setUsefulLinkSectionOpen] = useState(true)
  const [itemVisualSectionOpen, setItemVisualSectionOpen] = useState(true)
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const imageSyncInFlightRef = useRef<Promise<{ updatedAt: string | null } | false> | null>(null)
  const trackingStateRef = useRef(trackingState)
  const lazyImageLoadInFlightRef = useRef(new Set<string>())
  const lastPayloadTooLargeWarningRef = useRef(0)
  const shouldForceFirstSyncRef = useRef(false)
  const hasPendingChangesRef = useRef(false)
  const hasPendingImageChangesRef = useRef(false)
  const hasInitializedSnapshotRef = useRef(false)
  const latestStatePayloadRef = useRef('')
  const lastSavedStatePayloadRef = useRef('')
  const lastSavedStateVersionRef = useRef(0)
  const lastSyncedQuizImagesRef = useRef<Record<string, string>>({})
  const idleLogoutTimerRef = useRef<number | null>(null)
  const idleLogoutInFlightRef = useRef(false)
  const lastUserActivityAtRef = useRef(Date.now())
  const authCardRef = useRef<HTMLDivElement | null>(null)
  const sidebarNavRef = useRef<HTMLElement | null>(null)
  const sidebarNavButtonRefs = useRef<Partial<Record<SidebarNavBubbleKey, HTMLButtonElement | null>>>({})
  const sidebarLogoRef = useRef<HTMLSpanElement | null>(null)
  const sidebarLogoOffsetRef = useRef({ x: 0, y: 0 })
  const isSaveLocked = saveLockReason !== null
  const isImageLightboxOpen = imageLightboxSrc !== null

  function activateSaveProtection(reason: SaveLockReason) {
    setSaveLockReason(reason)
    setSaveErrorMessage(getSaveLockMessage(reason))
    setSaveStatus('error')
  }

  function clearSaveProtection() {
    setSaveLockReason(null)
    setSaveErrorMessage('')
    setSaveStatus('idle')
  }

  function setIdleLogoutPendingState(nextPending: IdleLogoutPending | null) {
    setIdleLogoutPending(nextPending)
    if (nextPending) {
      writeIdleLogoutPending(nextPending)
    } else {
      clearIdleLogoutPending()
    }
  }

  function markUserActivity() {
    if (idleLogoutInFlightRef.current || idleLogoutPending) {
      return
    }
    const now = Date.now()
    lastUserActivityAtRef.current = now
    writeLastUserActivityAt(now)
  }
  const [sidebarNavBubble, setSidebarNavBubble] = useState({ top: 0, height: 0, ready: false })
  const passwordStrength = getPasswordStrengthMeta(passwordInput)
  const remotePayload = useMemo(
    () =>
      buildRemotePersistPayload({
        trackingState,
        theme,
        focusMode,
        youtubeDisplayMode,
        profile,
      }),
    [trackingState, theme, focusMode, youtubeDisplayMode, profile],
  )
  const remotePayloadRef = useRef(remotePayload)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    trackingStateRef.current = trackingState
  }, [trackingState])

  useEffect(() => {
    remotePayloadRef.current = remotePayload
  }, [remotePayload])

  useLayoutEffect(() => {
    const activeKey = (activeView === 'stats' ? 'dashboard' : activeView) as SidebarNavBubbleKey
    const navElement = sidebarNavRef.current
    const activeButton = sidebarNavButtonRefs.current[activeKey]
    if (!navElement || !activeButton) {
      setSidebarNavBubble((current) => ({ ...current, ready: false }))
      return
    }
    const navRect = navElement.getBoundingClientRect()
    const btnRect = activeButton.getBoundingClientRect()
    setSidebarNavBubble({
      top: btnRect.top - navRect.top,
      height: btnRect.height,
      ready: true,
    })
  }, [activeView, sidebarCollapsed])

  useEffect(() => {
    void refreshAuth()
  }, [])

  useEffect(() => {
    setIdleLogoutPending(readIdleLogoutPending())
    const storedActivityAt = readLastUserActivityAt()
    if (storedActivityAt > 0) {
      lastUserActivityAtRef.current = storedActivityAt
    }
  }, [])

  useEffect(() => {
    setAuthError('')
    setAuthMessage('')
    setResetMode(false)
    setLoginPending(false)
  }, [authView])

  useEffect(() => {
    if (historyItemId === null && quizItemId === null && !isImageLightboxOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isImageLightboxOpen) {
          setImageLightboxSrc(null)
          setImageLightboxAlt('Image')
          return
        }
        setHistoryItemId(null)
        setQuizItemId(null)
        setQuizFeedback(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [historyItemId, quizItemId, isImageLightboxOpen])

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
      if (idleLogoutTimerRef.current !== null) {
        window.clearTimeout(idleLogoutTimerRef.current)
        idleLogoutTimerRef.current = null
      }
      const now = Date.now()
      lastUserActivityAtRef.current = now
      writeLastUserActivityAt(now)
      setHasLoadedRemoteState(false)
      setLastSavedAt(null)
      setSaveErrorMessage('')
      setLocalShadowNotice(null)
      hasPendingChangesRef.current = false
      hasInitializedSnapshotRef.current = false
      shouldForceFirstSyncRef.current = false
      latestStatePayloadRef.current = ''
      lastSavedStatePayloadRef.current = ''
      lastSavedStateVersionRef.current = 0
      lastSyncedQuizImagesRef.current = {}
      lazyImageLoadInFlightRef.current.clear()
      hasPendingImageChangesRef.current = false
      return
    }

    let cancelled = false
    let retryTimer: number | null = null

    const loadRemoteState = async () => {
      try {
        const payload = await apiRequest('/api/state?imageMode=metadata', undefined, { requireServerAppHeader: true })
        if (cancelled) {
          return
        }

        const remoteState = payload.state as
          | {
              trackingState?: unknown
              theme?: unknown
              focusMode?: unknown
              youtubeDisplayMode?: unknown
              profile?: unknown
              updatedAt?: unknown
            }
          | null
          | undefined

        let nextTrackingState = getInitialTrackingState()
        let nextTheme: Theme = 'light'
        let nextFocusMode = false
        let nextYoutubeDisplayMode: YouTubeDisplayMode = 'embed'
        let nextProfile = getProfileFromAuthUser(authUser)
        let remoteUpdatedAtMs = 0
        let nextLastSavedAt: string | null = null

        if (remoteState && typeof remoteState === 'object') {
          if (remoteState.trackingState && typeof remoteState.trackingState === 'object') {
            nextTrackingState = remoteState.trackingState as TrackerState
          }
          nextTheme = remoteState.theme === 'dark' ? 'dark' : 'light'
          nextFocusMode = Boolean(remoteState.focusMode)
          nextYoutubeDisplayMode = remoteState.youtubeDisplayMode === 'external' ? 'external' : 'embed'
          nextProfile = normalizeProfileInput(remoteState.profile, authUser)
          const updatedAtRaw = typeof remoteState.updatedAt === 'string' ? remoteState.updatedAt : null
          if (updatedAtRaw) {
            const savedAt = new Date(updatedAtRaw)
            if (!Number.isNaN(savedAt.getTime())) {
              remoteUpdatedAtMs = savedAt.getTime()
              nextLastSavedAt = new Intl.DateTimeFormat('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(savedAt)
            }
          }
        }

        const shadow = readLocalCloudShadow(authUser.id)
        let nextLocalShadowNotice: LocalShadowNotice | null = null
        if (shadow) {
          const parsedShadow = parsePersistStatePayloadBody(shadow.body, authUser)
          const isShadowNewerThanRemote = shadow.savedAtMs > remoteUpdatedAtMs + 1_000
          if (parsedShadow && isShadowNewerThanRemote) {
            nextLocalShadowNotice = {
              savedAtLabel: new Intl.DateTimeFormat('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(new Date(shadow.savedAtMs)),
            }
          } else {
            clearLocalCloudShadow(authUser.id)
          }
        }

        setTrackingState(nextTrackingState)
        setTheme(nextTheme)
        setFocusMode(nextFocusMode)
        setYoutubeDisplayMode(nextYoutubeDisplayMode)
        setProfile(nextProfile)
        setLastSavedAt(nextLastSavedAt)
        setSaveErrorMessage('')
        setLocalShadowNotice(nextLocalShadowNotice)
        setSaveStatus('idle')
        const remoteVersion = Number((payload as Record<string, unknown>).version)
        lastSavedStateVersionRef.current = Number.isFinite(remoteVersion) ? remoteVersion : 0
        lastSyncedQuizImagesRef.current = collectQuizImagePresenceMap(nextTrackingState)
        hasPendingImageChangesRef.current = false
        setHasLoadedRemoteState(true)
      } catch (error) {
        const lockReason = getSaveLockReason(error)
        if (!cancelled && lockReason === 'session-expired') {
          resetSessionToGuest('Session expirée pendant le chargement cloud. Reconnecte-toi.')
          return
        }
        if (!cancelled && lockReason === 'client-stale') {
          void forceLogoutForStaleClient()
          return
        }
        if (!cancelled) {
          setHasLoadedRemoteState(false)
          setSaveErrorMessage('Cloud indisponible. Vérifie Render puis réessaie.')
          retryTimer = window.setTimeout(() => {
            void loadRemoteState()
          }, 15_000)
        }
      }
    }

    void loadRemoteState()
    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [authStatus, authUser?.id])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }

    const snapshot = remotePayload?.body ?? ''
    latestStatePayloadRef.current = snapshot
    if (snapshot) {
      writeLocalCloudShadow(authUser.id, snapshot)
    }

    if (!hasInitializedSnapshotRef.current) {
      hasInitializedSnapshotRef.current = true
      if (shouldForceFirstSyncRef.current) {
        shouldForceFirstSyncRef.current = false
        lastSavedStatePayloadRef.current = ''
        hasPendingChangesRef.current = true
      } else {
        lastSavedStatePayloadRef.current = snapshot
        hasPendingChangesRef.current = false
      }
      return
    }

    if (!remotePayload) {
      hasPendingChangesRef.current = true
      return
    }

    hasPendingChangesRef.current = snapshot !== lastSavedStatePayloadRef.current
  }, [authStatus, authUser?.id, hasLoadedRemoteState, remotePayload])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }
    hasPendingImageChangesRef.current = hasUnsyncedQuizImageChanges(lastSyncedQuizImagesRef.current, trackingState)
  }, [authStatus, authUser?.id, hasLoadedRemoteState, trackingState])

  useEffect(() => {
    if (
      authStatus !== 'authed' ||
      !authUser ||
      !hasLoadedRemoteState ||
      (!hasPendingChangesRef.current && !hasPendingImageChangesRef.current)
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      if (hasPendingChangesRef.current || hasPendingImageChangesRef.current) {
        void persistUserState({ silent: true })
      }
    }, AUTO_SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [authStatus, authUser?.id, hasLoadedRemoteState, trackingState, theme, focusMode, youtubeDisplayMode, profile])

  useEffect(() => {
    if (authStatus !== 'authed' || dashboardIntroPhase !== 'entering') {
      return
    }
    const timer = window.setTimeout(() => setDashboardIntroPhase('idle'), 720)
    return () => window.clearTimeout(timer)
  }, [authStatus, dashboardIntroPhase])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }

    const interval = window.setInterval(() => {
      if (hasPendingChangesRef.current || hasPendingImageChangesRef.current) {
        void persistUserState({ silent: true })
      }
    }, AUTO_SAVE_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [authStatus, authUser?.id, hasLoadedRemoteState])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }
    if (idleLogoutPending && idleLogoutPending.userId === authUser.id) {
      return
    }

    const checkIdleLogout = () => {
      const elapsed = Date.now() - lastUserActivityAtRef.current
      if (elapsed >= IDLE_AUTO_LOGOUT_MS) {
        console.info('[idle-logout] threshold reached', {
          elapsedMs: elapsed,
          lastActivityAt: new Date(lastUserActivityAtRef.current).toISOString(),
        })
        void finalizeIdleLogout('timeout')
        return true
      }
      return false
    }

    const scheduleIdleLogout = () => {
      if (idleLogoutTimerRef.current !== null) {
        window.clearTimeout(idleLogoutTimerRef.current)
      }
      const elapsed = Date.now() - lastUserActivityAtRef.current
      const remaining = Math.max(0, IDLE_AUTO_LOGOUT_MS - elapsed)
      idleLogoutTimerRef.current = window.setTimeout(() => {
        idleLogoutTimerRef.current = null
        void finalizeIdleLogout('timeout')
      }, remaining)
    }

    const onActivity = () => {
      if (document.visibilityState === 'hidden') {
        return
      }
      if (checkIdleLogout()) {
        return
      }
      markUserActivity()
      scheduleIdleLogout()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (checkIdleLogout()) {
          return
        }
        onActivity()
      }
    }

    const storedActivityAt = readLastUserActivityAt()
    const now = Date.now()
    lastUserActivityAtRef.current =
      storedActivityAt > 0 && now - storedActivityAt < IDLE_AUTO_LOGOUT_MS * 4 ? storedActivityAt : now
    writeLastUserActivityAt(lastUserActivityAtRef.current)
    if (checkIdleLogout()) {
      return
    }
    scheduleIdleLogout()
    const idleInterval = window.setInterval(() => {
      checkIdleLogout()
    }, IDLE_CHECK_INTERVAL_MS)

    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('pointermove', onActivity)
    window.addEventListener('wheel', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    window.addEventListener('scroll', onActivity, true)
    window.addEventListener('focus', onActivity)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (idleLogoutTimerRef.current !== null) {
        window.clearTimeout(idleLogoutTimerRef.current)
        idleLogoutTimerRef.current = null
      }
      window.clearInterval(idleInterval)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('pointermove', onActivity)
      window.removeEventListener('wheel', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('scroll', onActivity, true)
      window.removeEventListener('focus', onActivity)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [authStatus, authUser?.id, hasLoadedRemoteState, idleLogoutPending])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState || !idleLogoutPending) {
      return
    }
    if (idleLogoutPending.userId !== authUser.id) {
      setIdleLogoutPendingState(null)
      return
    }

    const retryPendingIdleLogout = () => {
      if (navigator.onLine === false) {
        return
      }
      void finalizeIdleLogout('resume')
    }

    retryPendingIdleLogout()
    const retryInterval = window.setInterval(() => {
      retryPendingIdleLogout()
    }, IDLE_LOGOUT_RETRY_INTERVAL_MS)
    window.addEventListener('online', retryPendingIdleLogout)
    window.addEventListener('focus', retryPendingIdleLogout)
    document.addEventListener('visibilitychange', retryPendingIdleLogout)

    return () => {
      window.clearInterval(retryInterval)
      window.removeEventListener('online', retryPendingIdleLogout)
      window.removeEventListener('focus', retryPendingIdleLogout)
      document.removeEventListener('visibilitychange', retryPendingIdleLogout)
    }
  }, [authStatus, authUser?.id, hasLoadedRemoteState, idleLogoutPending])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }

    const flushWithKeepalive = () => {
      if (!hasPendingChangesRef.current) {
        return
      }
      const payload = latestStatePayloadRef.current
      if (!payload) {
        return
      }
      const candidates = resolveApiCandidates('/api/state')
      const target = candidates[0]
      if (!target) {
        return
      }
      void fetch(target, {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(CLIENT_APP_VERSION ? { 'x-client-version': CLIENT_APP_VERSION } : {}),
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
  }, [authStatus, authUser?.id, hasLoadedRemoteState])

  async function apiRequest(url: string, init?: RequestInit, options?: { requireServerAppHeader?: boolean }) {
    let response: Response | null = null
    let lastFetchError: unknown = null
    const candidates = resolveApiCandidates(url)
    const authToken = getStoredAuthToken()
    const shouldAttachAuthToken = Boolean(authToken) && !shouldSkipAuthTokenForRequest(url)

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      try {
        const candidateResponse = await fetch(candidate, {
          ...init,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(CLIENT_APP_VERSION ? { 'x-client-version': CLIENT_APP_VERSION } : {}),
            ...(shouldAttachAuthToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...(init?.headers ?? {}),
          },
        })
        const hasMoreCandidates = index < candidates.length - 1
        const candidateContentType = (candidateResponse.headers.get('content-type') ?? '').toLowerCase()
        const candidateLooksJson = candidateContentType.includes('application/json')
        const candidateServerVersion = (candidateResponse.headers.get('x-app-version') ?? '').trim()
        const requireServerAppHeader = Boolean(options?.requireServerAppHeader)
        if (!candidateResponse.ok && hasMoreCandidates && isRetryableApiCandidateStatus(candidateResponse.status)) {
          continue
        }
        if (candidateResponse.ok && hasMoreCandidates && requireServerAppHeader && !candidateServerVersion) {
          continue
        }
        if (candidateResponse.ok && hasMoreCandidates && !candidateLooksJson) {
          continue
        }
        response = candidateResponse
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

    const serverAppVersion = (response.headers.get('x-app-version') ?? '').trim()
    if (CLIENT_APP_VERSION && serverAppVersion && serverAppVersion !== CLIENT_APP_VERSION) {
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
      throw new ApiRequestError(
        'Client obsolète. Recharge la page pour appliquer la dernière mise à jour.',
        426,
        'CLIENT_STALE',
      )
    }

    let payload: Record<string, unknown> = {}
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const looksJson = contentType.includes('application/json')
    if (looksJson) {
      payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    } else {
      const text = await response.text().catch(() => '')
      payload = { error: text.slice(0, 180) }
    }

    if (response.ok && !looksJson) {
      throw new Error('Réponse API invalide: format non JSON.')
    }

    const nextToken = typeof payload.token === 'string' ? payload.token.trim() : ''
    if (nextToken) {
      storeAuthToken(nextToken)
    }

    if (!response.ok) {
      const apiError = String(payload.error ?? '').trim()
      const apiCode = typeof payload.code === 'string' ? payload.code : ''
      throw new ApiRequestError(apiError || `Erreur API (${response.status})`, response.status, apiCode)
    }
    return payload
  }

  async function persistQuizImages(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent)
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return false
    }
    if (!hasPendingImageChangesRef.current) {
      return { updatedAt: null as string | null }
    }
    if (imageSyncInFlightRef.current) {
      const inFlightResult = await imageSyncInFlightRef.current
      if (inFlightResult && hasPendingImageChangesRef.current) {
        return persistQuizImages(options)
      }
      return inFlightResult
    }

    const syncPromise = (async () => {
      const previousMap = lastSyncedQuizImagesRef.current
      const currentMap = collectQuizImageMap(trackingStateRef.current)
      const currentPresenceMap = collectQuizImagePresenceMap(trackingStateRef.current)
      const upsert: Array<{ itemNumber: number; cardId: string; imageSlot: QuizImageSlot; imageDataUrl: string }> = []
      const removed: Array<{ itemNumber: number; cardId: string; imageSlot: QuizImageSlot }> = []

      for (const [key, value] of Object.entries(currentMap)) {
        if (previousMap[key] === value) {
          continue
        }
        const [itemRaw, cardId, imageSlotRaw] = key.split(':')
        const itemNumber = Number(itemRaw)
        const imageSlot = imageSlotRaw === 'front' ? 'front' : imageSlotRaw === 'back' ? 'back' : null
        if (!Number.isFinite(itemNumber) || !cardId || !imageSlot) {
          continue
        }
        upsert.push({ itemNumber, cardId, imageSlot, imageDataUrl: value })
      }

      for (const key of Object.keys(previousMap)) {
        if (currentPresenceMap[key]) {
          continue
        }
        const [itemRaw, cardId, imageSlotRaw] = key.split(':')
        const itemNumber = Number(itemRaw)
        const imageSlot = imageSlotRaw === 'front' ? 'front' : imageSlotRaw === 'back' ? 'back' : null
        if (!Number.isFinite(itemNumber) || !cardId || !imageSlot) {
          continue
        }
        removed.push({ itemNumber, cardId, imageSlot })
      }

      if (upsert.length === 0 && removed.length === 0) {
        hasPendingImageChangesRef.current = false
        return { updatedAt: null as string | null }
      }

      try {
        const requestId = generateRequestId('imgsync')
        const imageRequestBody = JSON.stringify({
          upsert,
          removed,
          requestId,
        })
        const imageRequestBytes = getUtf8ByteLength(imageRequestBody)
        logOutgoingSavePayload('images', imageRequestBytes, {
          upsertCount: upsert.length,
          removedCount: removed.length,
        })
        const payload = await apiRequest('/api/state/images', {
          method: 'POST',
          body: imageRequestBody,
        })
        lastSyncedQuizImagesRef.current = {
          ...currentPresenceMap,
          ...currentMap,
        }
        hasPendingImageChangesRef.current = hasUnsyncedQuizImageChanges(
          lastSyncedQuizImagesRef.current,
          trackingStateRef.current,
        )
        return {
          updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
        }
      } catch (error) {
        const lockReason = getSaveLockReason(error)
        if (lockReason) {
          activateSaveProtection(lockReason)
        } else if (!silent) {
          setSaveErrorMessage(toSaveWarningMessage(error))
          setSaveStatus('error')
          window.setTimeout(() => setSaveStatus('idle'), 2200)
        }
        return false
      } finally {
        imageSyncInFlightRef.current = null
      }
    })()

    imageSyncInFlightRef.current = syncPromise
    return syncPromise
  }

  async function persistUserState(options?: { silent?: boolean; force?: boolean }) {
    const silent = Boolean(options?.silent)
    const force = Boolean(options?.force)

    if (authStatus !== 'authed' || !authUser) {
      return false
    }

    if (!force && !hasLoadedRemoteState) {
      return false
    }

    const mustSeedRemoteStateForImages =
      hasPendingImageChangesRef.current && (!lastSavedStatePayloadRef.current || lastSavedStateVersionRef.current <= 0)
    const shouldSaveState = force || hasPendingChangesRef.current || mustSeedRemoteStateForImages
    const shouldSaveImages = hasPendingImageChangesRef.current
    const currentRemotePayload = remotePayloadRef.current

    if (!shouldSaveState && !shouldSaveImages) {
      return true
    }

    if (isSaveLocked) {
      if (!silent && saveLockReason) {
        setSaveStatus('error')
        setSaveErrorMessage(getSaveLockMessage(saveLockReason))
      }
      return false
    }

    if (saveInFlightRef.current) {
      const inFlightSaved = await saveInFlightRef.current
      if (!inFlightSaved) {
        return false
      }
      if (hasPendingChangesRef.current || hasPendingImageChangesRef.current) {
        return persistUserState(options)
      }
      return true
    }

    if (shouldSaveState && !currentRemotePayload) {
      const now = Date.now()
      if (now - lastPayloadTooLargeWarningRef.current > 15_000) {
        setSaveErrorMessage(
          'Payload cloud encore trop volumineux après réduction automatique. Supprime quelques images/cartes puis réessaie.',
        )
        setSaveStatus('error')
        window.setTimeout(() => setSaveStatus('idle'), 2800)
        lastPayloadTooLargeWarningRef.current = now
      }
      return false
    }

    if (currentRemotePayload?.body) {
      latestStatePayloadRef.current = currentRemotePayload.body
    }

    const savePromise = (async () => {
      if (!silent) {
        setSaveErrorMessage('')
        setSaveStatus('saving')
      }
      try {
        let updatedAtRaw: string | null = null
        if (shouldSaveState && currentRemotePayload?.body) {
          const previousPayload = parsePersistStatePayloadBody(lastSavedStatePayloadRef.current, authUser)
          const nextPayload = parsePersistStatePayloadBody(currentRemotePayload.body, authUser)
          if (!nextPayload) {
            throw new Error('Etat cloud invalide: payload local non parsable.')
          }

          const mergePatch = previousPayload ? buildMergePatch(previousPayload, nextPayload) : undefined
          const requestId = generateRequestId(mergePatch ? 'patch' : 'full')
          const isPatchRequest = mergePatch && typeof mergePatch === 'object'
          const requestBody = isPatchRequest
            ? JSON.stringify({
                patch: mergePatch,
                baseVersion: lastSavedStateVersionRef.current,
                requestId,
              })
            : JSON.stringify({
                ...nextPayload,
                baseVersion: lastSavedStateVersionRef.current,
                requestId,
              })
          const requestBytes = getUtf8ByteLength(requestBody)
          if (isPatchRequest) {
            const patchBytes = getUtf8ByteLength(JSON.stringify(mergePatch))
            logOutgoingSavePayload('patch', requestBytes, {
              patchBytes,
              patchSize: formatByteSize(patchBytes),
              baseVersion: lastSavedStateVersionRef.current,
            })
          } else {
            logOutgoingSavePayload('full', requestBytes, {
              payloadBytes: currentRemotePayload.bytes,
              payloadSize: formatByteSize(currentRemotePayload.bytes),
              baseVersion: lastSavedStateVersionRef.current,
            })
          }
          const payload =
            isPatchRequest
              ? await apiRequest(
                  '/api/state',
                  {
                    method: 'PATCH',
                    body: requestBody,
                  },
                  { requireServerAppHeader: true },
                )
              : await apiRequest(
                  '/api/state',
                  {
                    method: 'PUT',
                    body: requestBody,
                  },
                  { requireServerAppHeader: true },
                )

          lastSavedStatePayloadRef.current = currentRemotePayload.body
          hasPendingChangesRef.current = latestStatePayloadRef.current !== lastSavedStatePayloadRef.current
          const nextVersion = Number(payload.version)
          if (Number.isFinite(nextVersion)) {
            lastSavedStateVersionRef.current = nextVersion
          }
          updatedAtRaw = typeof payload.updatedAt === 'string' ? payload.updatedAt : null
        }

        if (shouldSaveImages) {
          const imagesSaved = await persistQuizImages({ silent: true })
          if (!imagesSaved) {
            return false
          }
          if (imagesSaved.updatedAt) {
            updatedAtRaw = imagesSaved.updatedAt
          }
        }

        const savedAt = updatedAtRaw ? new Date(updatedAtRaw) : null
        if (savedAt && !Number.isNaN(savedAt.getTime())) {
          setLastSavedAt(
            new Intl.DateTimeFormat('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(savedAt),
          )
        }
        setSaveErrorMessage('')
        clearLocalCloudShadow(authUser.id)
        setLocalShadowNotice(null)
        if (!silent) {
          setSaveStatus('saved')
          window.setTimeout(() => setSaveStatus('idle'), 1800)
        }
        return true
      } catch (error) {
        const lockReason = getSaveLockReason(error)
        if (lockReason) {
          activateSaveProtection(lockReason)
        } else {
          setSaveErrorMessage(toSaveWarningMessage(error))
          if (!silent) {
            setSaveStatus('error')
            window.setTimeout(() => setSaveStatus('idle'), 2200)
          }
        }
        return false
      } finally {
        saveInFlightRef.current = null
      }
    })()

    saveInFlightRef.current = savePromise
    const saved = await savePromise
    if (saved && (hasPendingChangesRef.current || hasPendingImageChangesRef.current)) {
      return persistUserState(options)
    }
    return saved
  }

  function resetSessionToGuest(authMessage?: string) {
    storeAuthToken('')
    setHasLoadedRemoteState(false)
    setAuthUser(null)
    setAuthStatus('guest')
    setSaveLockReason(null)
    setSaveStatus('idle')
    setSaveErrorMessage('')
    hasPendingChangesRef.current = false
    hasInitializedSnapshotRef.current = false
    shouldForceFirstSyncRef.current = false
    latestStatePayloadRef.current = ''
    lastSavedStatePayloadRef.current = ''
    lastSavedStateVersionRef.current = 0
    lastSyncedQuizImagesRef.current = {}
    lazyImageLoadInFlightRef.current.clear()
    hasPendingImageChangesRef.current = false
    setTrackingState(getInitialTrackingState())
    setTheme('light')
    setFocusMode(false)
    setYoutubeDisplayMode('embed')
    setProfile(getDefaultProfile())
    setLastSavedAt(null)
    if (authMessage) {
      setAuthError(authMessage)
    }
  }

  async function refreshAuth() {
    try {
      const payload = await apiRequest('/api/auth/me', undefined, { requireServerAppHeader: true })
      const user = payload.user as AuthUser | undefined
      if (!user || !Number.isFinite(Number(user.id))) {
        throw new Error('Session utilisateur invalide.')
      }
      setAuthUser(user)
      setAuthStatus('authed')
      clearSaveProtection()
    } catch (error) {
      const hadActiveSession = authStatus === 'authed'
      const lockReason = getSaveLockReason(error)
      if (lockReason === 'session-expired') {
        storeAuthToken('')
      }
      setAuthUser(null)
      setAuthStatus('guest')
      setHasLoadedRemoteState(false)
      if (hadActiveSession) {
        if (lockReason) {
          activateSaveProtection(lockReason)
        }
      } else {
        clearSaveProtection()
      }
      if (error instanceof Error && error.message.includes('404')) {
        setAuthError(
          "API introuvable (/api/auth/me). Configure `VITE_API_BASE_URL` vers ton backend, puis rebuild/redeploy.",
        )
      }
    }
  }

  async function handleRecoveryAction() {
    if (saveLockReason === 'client-stale') {
      window.location.reload()
      return
    }

    try {
      const payload = await apiRequest('/api/auth/me', undefined, { requireServerAppHeader: true })
      const user = payload.user as AuthUser | undefined
      if (!user || !Number.isFinite(Number(user.id))) {
        throw new Error('Session utilisateur invalide.')
      }
      setAuthUser(user)
      setAuthStatus('authed')
      setSaveLockReason(null)
      setSaveStatus('idle')
      setSaveErrorMessage('')
      if (hasPendingChangesRef.current) {
        void persistUserState({ silent: false })
      }
    } catch (error) {
      const lockReason = getSaveLockReason(error)
      if (lockReason) {
        activateSaveProtection(lockReason)
      } else {
        setSaveStatus('error')
        setSaveErrorMessage(toSaveWarningMessage(error))
      }
    }
  }

  async function confirmSessionAfterAuth(options?: { fallbackUser?: AuthUser }) {
    const fallbackUser = options?.fallbackUser ?? null
    try {
      const payload = await apiRequest('/api/auth/me', undefined, { requireServerAppHeader: true })
      const resolvedUser = ((payload.user as AuthUser | undefined) ?? fallbackUser) as AuthUser | null
      if (!resolvedUser) {
        throw new Error('Session utilisateur introuvable après connexion.')
      }
      setAuthUser(resolvedUser)
      setAuthStatus('authed')
      clearSaveProtection()
      return true
    } catch (error) {
      setLoginPending(false)
      if (getSaveLockReason(error) === 'session-expired') {
        storeAuthToken('')
      }
      setAuthUser(null)
      setAuthStatus('guest')
      setHasLoadedRemoteState(false)
      clearSaveProtection()
      if (getSaveLockReason(error) === 'session-expired') {
        setAuthError('Connexion réussie mais session non conservée. Vérifie la config de session serveur puis réessaie.')
      } else {
        setAuthError(error instanceof Error ? error.message : 'Impossible de valider la session.')
      }
      return false
    }
  }

  function startAuthSuccessTransition(user: AuthUser) {
    setAuthUser(user)
    clearSaveProtection()

    const cardRect = authCardRef.current?.getBoundingClientRect()
    if (!cardRect) {
      setDashboardIntroPhase('entering')
      setAuthStatus('authed')
      setLoginPending(false)
      return
    }

    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const scaleX = Math.min(1, Math.max(0.06, cardRect.width / viewportWidth))
    const scaleY = Math.min(1, Math.max(0.06, cardRect.height / viewportHeight))

    setAuthExpandStyle(
      {
        '--auth-start-top': `${cardRect.top.toFixed(2)}px`,
        '--auth-start-left': `${cardRect.left.toFixed(2)}px`,
        '--auth-start-width': `${cardRect.width.toFixed(2)}px`,
        '--auth-start-height': `${cardRect.height.toFixed(2)}px`,
        '--auth-translate-x': `${cardRect.left.toFixed(2)}px`,
        '--auth-translate-y': `${cardRect.top.toFixed(2)}px`,
        '--auth-scale-x': scaleX.toFixed(4),
        '--auth-scale-y': scaleY.toFixed(4),
        '--auth-start-radius': '22px',
      } as CSSProperties,
    )

    window.requestAnimationFrame(() => {
      setAuthTransitionPhase('expanding')
    })

    window.setTimeout(() => {
      setAuthTransitionPhase('idle')
      setDashboardIntroPhase('entering')
      setAuthStatus('authed')
      setLoginPending(false)
    }, 720)
  }

  useEffect(() => {
    if (!loginPending || authTransitionPhase !== 'idle') {
      return
    }
    if (authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return
    }
    if (idleLogoutPending && idleLogoutPending.userId === authUser.id) {
      return
    }
    startAuthSuccessTransition(authUser)
  }, [loginPending, authTransitionPhase, authStatus, authUser, hasLoadedRemoteState, idleLogoutPending])

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
      await confirmSessionAfterAuth({ fallbackUser: payload.user as AuthUser | undefined })
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
      await confirmSessionAfterAuth({ fallbackUser: payload.user as AuthUser | undefined })
    } catch (error) {
      setLoginPending(false)
      if (getSaveLockReason(error) === 'session-expired') {
        setAuthError('Connexion refusée: session non conservée. Vérifie la config de session serveur puis réessaie.')
      } else {
        setAuthError(error instanceof Error ? error.message : 'Erreur de connexion.')
      }
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
      setAuthMessage(String(payload.message ?? 'Mot de passe mis à jour.'))
      setResetMode(false)
      setResetCodeInput('')
      setResetPasswordInput('')
      await confirmSessionAfterAuth({ fallbackUser: payload.user as AuthUser | undefined })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Erreur lors de la réinitialisation du mot de passe.')
    }
  }

  async function finalizeIdleLogout(trigger: 'timeout' | 'resume') {
    if (idleLogoutInFlightRef.current || authStatus !== 'authed' || !authUser || !hasLoadedRemoteState) {
      return false
    }

    idleLogoutInFlightRef.current = true
    const pendingForUser =
      idleLogoutPending && idleLogoutPending.userId === authUser.id
        ? idleLogoutPending
        : {
            userId: authUser.id,
            requestedAtMs: Date.now(),
          }

    setIdleLogoutPendingState(pendingForUser)
    if (latestStatePayloadRef.current) {
      writeLocalCloudShadow(authUser.id, latestStatePayloadRef.current)
    }

    setSaveStatus('saving')
    setSaveErrorMessage(
      trigger === 'timeout'
        ? "15 minutes d'inactivité détectées. Sauvegarde finale puis fermeture de session..."
        : 'Reconnexion détectée. Finalisation de la sauvegarde avant fermeture de session...',
    )

    try {
      const saved = await persistUserState({ force: true, silent: false })
      if (!saved) {
        setSaveStatus('error')
        setSaveErrorMessage(
          "Inactivité détectée: fermeture différée. Dès que le cloud ou la session revient, la sauvegarde partira puis la session sera fermée.",
        )
        return false
      }

      setIdleLogoutPendingState(null)
      await disconnectToAuth('Session fermée après 15 minutes d’inactivité.')
      return true
    } finally {
      idleLogoutInFlightRef.current = false
    }
  }

  async function disconnectToAuth(authMessage?: string) {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    resetSessionToGuest(authMessage)
  }

  async function handleLogout() {
    const saved = await persistUserState({ force: true, silent: false })
    if (!saved) {
      const continueWithoutSave = window.confirm(
        "La sauvegarde cloud a échoué. Voulez-vous quand même vous déconnecter ?",
      )
      if (!continueWithoutSave) {
        return
      }
    }
    await disconnectToAuth()
  }

  async function forceLogoutForStaleClient() {
    await disconnectToAuth('Nouvelle version disponible: reconnecte-toi pour charger la dernière mise à jour.')
  }

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser || isSaveLocked) {
      return
    }

    const verifySession = async () => {
      try {
        await apiRequest('/api/auth/me', undefined, { requireServerAppHeader: true })
      } catch (error) {
        const lockReason = getSaveLockReason(error)
        if (lockReason === 'session-expired') {
          activateSaveProtection(lockReason)
        }
      }
    }

    void verifySession()
    const interval = window.setInterval(() => {
      void verifySession()
    }, SESSION_HEARTBEAT_MS)

    return () => window.clearInterval(interval)
  }, [authStatus, authUser, isSaveLocked])

  useEffect(() => {
    if (authStatus !== 'authed' || !authUser) {
      return
    }

    let checking = false

    const checkClientVersion = async () => {
      if (checking) {
        return
      }
      checking = true
      try {
        await apiRequest('/api/auth/me', undefined, { requireServerAppHeader: true })
      } catch (error) {
        const lockReason = getSaveLockReason(error)
        if (lockReason === 'client-stale') {
          await forceLogoutForStaleClient()
        }
      } finally {
        checking = false
      }
    }

    const interval = window.setInterval(() => {
      void checkClientVersion()
    }, VERSION_CHECK_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [authStatus, authUser])

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
      const latestLisaReviewDate = getLatestSheetReviewDate(tracking.lisaSheets)
      const latestPlatformReviewDate = getLatestSheetReviewDate(tracking.platformSheets)
      const mergedLastReviewDate = getLatestIsoDate(
        tracking.lastReviewDate,
        lastReviewDate,
        latestLisaReviewDate,
        latestPlatformReviewDate,
      )

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
            item.tracking.youtubeUrl,
            item.tracking.usefulLinkUrl,
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
      const aLastReviewTime = a.lastReviewDate ? new Date(a.lastReviewDate).getTime() : null
      const bLastReviewTime = b.lastReviewDate ? new Date(b.lastReviewDate).getTime() : null

      if (sortKey === 'itemAsc') {
        return a.itemNumber - b.itemNumber
      }
      if (sortKey === 'itemDesc') {
        return b.itemNumber - a.itemNumber
      }
      if (sortKey === 'reviews') {
        return b.totalReviews - a.totalReviews || a.itemNumber - b.itemNumber
      }
      if (sortKey === 'progress') {
        return b.progress - a.progress || b.totalReviews - a.totalReviews || a.itemNumber - b.itemNumber
      }
      if (sortKey === 'lastReviewAsc') {
        if (aLastReviewTime === null && bLastReviewTime === null) {
          return a.itemNumber - b.itemNumber
        }
        if (aLastReviewTime === null) {
          return 1
        }
        if (bLastReviewTime === null) {
          return -1
        }
        return aLastReviewTime - bLastReviewTime || a.itemNumber - b.itemNumber
      }
      if (sortKey === 'lastReviewDesc') {
        if (aLastReviewTime === null && bLastReviewTime === null) {
          return a.itemNumber - b.itemNumber
        }
        if (aLastReviewTime === null) {
          return 1
        }
        if (bLastReviewTime === null) {
          return -1
        }
        return bLastReviewTime - aLastReviewTime || a.itemNumber - b.itemNumber
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

  useEffect(() => {
    if (!effectiveSelectedItem) {
      setYoutubeInput('')
      setYoutubeInputError('')
      setUsefulLinkInput('')
      setUsefulLinkInputError('')
      return
    }
    setYoutubeInput(effectiveSelectedItem.tracking.youtubeUrl)
    setYoutubeInputError('')
    setUsefulLinkInput(effectiveSelectedItem.tracking.usefulLinkUrl)
    setUsefulLinkInputError('')
  }, [effectiveSelectedItem])

  const selectedYouTubeVideoId = useMemo(
    () => (effectiveSelectedItem ? extractYouTubeVideoId(effectiveSelectedItem.tracking.youtubeUrl) : null),
    [effectiveSelectedItem],
  )

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
    const custom = activeQuizCard?.question ?? ''
    if (hasQuizRichTextContent(custom)) {
      return sanitizeQuizRichTextHtml(custom)
    }
    return getAutoQuizQuestion(quizItem)
  }, [quizItem, activeQuizCard])

  const quizAnswer = useMemo(() => {
    if (!quizItem) {
      return ''
    }
    const custom = activeQuizCard?.answer ?? ''
    if (hasQuizRichTextContent(custom)) {
      return sanitizeQuizRichTextHtml(custom)
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
        question: hasQuizRichTextContent(card.question) ? sanitizeQuizRichTextHtml(card.question) : getAutoQuizQuestion(item),
        answer: hasQuizRichTextContent(card.answer) ? sanitizeQuizRichTextHtml(card.answer) : item.shortDescription,
        frontImageDataUrl: card.frontImageDataUrl,
        hasFrontImageDataUrl: card.hasFrontImageDataUrl,
        backImageDataUrl: card.backImageDataUrl,
        hasBackImageDataUrl: card.hasBackImageDataUrl,
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

  const generatedFlashcards = useMemo<GlobalFlashcard[]>(() => {
    return flashGeneratedCardKeys
      .map((key) => flashcardsByKey.get(key) ?? null)
      .filter((card): card is GlobalFlashcard => card !== null)
  }, [flashcardsByKey, flashGeneratedCardKeys])

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

  useEffect(() => {
    if (!quizItem || !activeQuizCard) {
      return
    }
    void loadQuizCardImagesOnDemand(quizItem.itemNumber, activeQuizCard)
  }, [
    quizItem?.itemNumber,
    activeQuizCard?.id,
    activeQuizCard?.frontImageDataUrl,
    activeQuizCard?.hasFrontImageDataUrl,
    activeQuizCard?.backImageDataUrl,
    activeQuizCard?.hasBackImageDataUrl,
  ])

  useEffect(() => {
    if (!activeGeneratedFlashcard) {
      return
    }
    void loadQuizCardImagesOnDemand(activeGeneratedFlashcard.itemNumber, {
      id: activeGeneratedFlashcard.cardId,
      frontImageDataUrl: activeGeneratedFlashcard.frontImageDataUrl,
      hasFrontImageDataUrl: activeGeneratedFlashcard.hasFrontImageDataUrl,
      backImageDataUrl: activeGeneratedFlashcard.backImageDataUrl,
      hasBackImageDataUrl: activeGeneratedFlashcard.hasBackImageDataUrl,
    })
  }, [
    activeGeneratedFlashcard?.itemNumber,
    activeGeneratedFlashcard?.cardId,
    activeGeneratedFlashcard?.frontImageDataUrl,
    activeGeneratedFlashcard?.hasFrontImageDataUrl,
    activeGeneratedFlashcard?.backImageDataUrl,
    activeGeneratedFlashcard?.hasBackImageDataUrl,
  ])

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
        if (entry.reviewHistory.length === 0 && entry.reviews > 0 && entry.lastReviewedAt) {
          applyEvent({ date: entry.lastReviewedAt, delta: entry.reviews })
        }
      }

      for (const sheet of item.tracking.lisaSheets) {
        for (const event of sheet.tracking.reviewHistory) {
          applyEvent(event)
        }
        if (
          sheet.tracking.reviewHistory.length === 0 &&
          sheet.tracking.reviews > 0 &&
          sheet.tracking.lastReviewedAt
        ) {
          applyEvent({ date: sheet.tracking.lastReviewedAt, delta: sheet.tracking.reviews })
        }
      }
      for (const sheet of item.tracking.platformSheets) {
        for (const event of sheet.tracking.reviewHistory) {
          applyEvent(event)
        }
        if (
          sheet.tracking.reviewHistory.length === 0 &&
          sheet.tracking.reviews > 0 &&
          sheet.tracking.lastReviewedAt
        ) {
          applyEvent({ date: sheet.tracking.lastReviewedAt, delta: sheet.tracking.reviews })
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

  const flashCollegeCards = useMemo(() => {
    const normalizedSearch = normalizeText(flashCollegeSearch)

    return collegesViewRows
      .map((row, index) => {
        const collegeFlashcards = allFlashcards.filter((card) => card.colleges.includes(row.college))
        const masteredFlashcards = collegeFlashcards.filter(
          (card) => card.lastResult === 'good' || card.lastResult === 'easy',
        ).length
        const flashcardMastery =
          collegeFlashcards.length === 0 ? row.completion : Math.round((masteredFlashcards / collegeFlashcards.length) * 100)

        return {
          ...row,
          displayName: getFlashCollegeDisplayName(row.college),
          itemCount: row.items.length,
          flashcardCount: collegeFlashcards.length,
          masteryPercent: Math.max(row.completion, flashcardMastery),
          accent: FLASH_COLLEGE_ACCENTS[index % FLASH_COLLEGE_ACCENTS.length],
        }
      })
      .filter((row) => {
        if (flashCollegeFilter !== 'ALL' && row.college !== flashCollegeFilter) {
          return false
        }
        if (
          normalizedSearch &&
          !normalizeText(row.displayName).includes(normalizedSearch) &&
          !normalizeText(row.college).includes(normalizedSearch)
        ) {
          return false
        }
        if (flashCollegeLevelFilter !== 'ALL') {
          const collegeFlashcards = allFlashcards.filter((card) => card.colleges.includes(row.college))
          return collegeFlashcards.some((card) => (card.lastResult ?? 'none') === flashCollegeLevelFilter)
        }
        return true
      })
      .sort((a, b) => {
        if (flashCollegeSort === 'name') {
          return a.displayName.localeCompare(b.displayName, 'fr')
        }
        if (flashCollegeSort === 'items') {
          return b.itemCount - a.itemCount || a.displayName.localeCompare(b.displayName, 'fr')
        }
        return b.masteryPercent - a.masteryPercent || a.displayName.localeCompare(b.displayName, 'fr')
      })
  }, [allFlashcards, collegesViewRows, flashCollegeFilter, flashCollegeLevelFilter, flashCollegeSearch, flashCollegeSort])

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
    const question = getQuizRichTextPlainText(card.question)
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

  function openImageLightbox(src: string, alt: string) {
    setImageLightboxSrc(src)
    setImageLightboxAlt(alt || 'Image')
  }

  function closeImageLightbox() {
    setImageLightboxSrc(null)
    setImageLightboxAlt('Image')
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

  function buildQuizGeneratorCardKeys(config: {
    scope: FlashGeneratorScope
    selectedItems: number[]
    selectedColleges: string[]
    selectedFeelings: FlashFeelingFilter[]
    prioritizeWeak: boolean
    questionCount: number
    randomize?: boolean
  }) {
    const selectedItemsSet = new Set(config.selectedItems)
    const selectedCollegesSet = new Set(config.selectedColleges)
    const selectedFeelingsSet = new Set(config.selectedFeelings)
    const scopeFiltered = allFlashcards.filter((card) => {
      if (config.scope === 'items') {
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

    const ranked = config.randomize
      ? feelingFiltered
          .map((card) => ({ card, rank: Math.random() }))
          .sort((a, b) => a.rank - b.rank)
          .map(({ card }) => card)
      : [...feelingFiltered].sort((a, b) => {
          const aFeeling = a.lastResult ?? 'none'
          const bFeeling = b.lastResult ?? 'none'
          const aScore = config.prioritizeWeak ? weakRank[aFeeling] * 100 + a.quizCount * 4 : a.quizCount
          const bScore = config.prioritizeWeak ? weakRank[bFeeling] * 100 + b.quizCount * 4 : b.quizCount
          if (aScore !== bScore) {
            return aScore - bScore
          }
          return a.itemNumber - b.itemNumber
        })

    const safeCount = Math.max(1, Math.min(200, Number.isFinite(config.questionCount) ? Math.round(config.questionCount) : 20))
    return ranked.slice(0, safeCount).map((card) => `${card.itemNumber}:${card.cardId}`)
  }

  function startGeneratedFlashSession(keys: string[]) {
    setFlashGeneratedCardKeys(keys)
    setFlashGeneratedIndex(0)
    setFlashGeneratedSide('front')
    setFlashGeneratedFeedback(null)
    setFlashGeneratedSessionResults({})
  }

  function applyQuizGenerator() {
    const keys = buildQuizGeneratorCardKeys({
      scope: flashGeneratorScope,
      selectedItems: flashSelectedItems,
      selectedColleges: flashSelectedColleges,
      selectedFeelings: flashSelectedFeelings,
      prioritizeWeak: flashPrioritizeWeak,
      questionCount: flashQuestionCount,
    })
    startGeneratedFlashSession(keys)
  }

  function startCollegeGeneratedQuiz(college: string, options?: { randomize?: boolean }) {
    const selectedFeelings: FlashFeelingFilter[] =
      flashCollegeLevelFilter === 'ALL' ? ['none', 'again', 'hard', 'good', 'easy'] : [flashCollegeLevelFilter]
    const keys = buildQuizGeneratorCardKeys({
      scope: 'colleges',
      selectedItems: [],
      selectedColleges: [college],
      selectedFeelings,
      prioritizeWeak: !options?.randomize,
      questionCount: flashQuestionCount,
      randomize: options?.randomize,
    })

    setFlashGeneratorScope('colleges')
    setFlashSelectedColleges([college])
    setFlashSelectedFeelings(selectedFeelings)
    setFlashPrioritizeWeak(!options?.randomize)
    startGeneratedFlashSession(keys)
    setFlashGeneratorModalOpen(true)
    setFlashGeneratorStep(3)
  }

  function startSelectedCollegeGeneratedQuiz() {
    const fallbackCollege = flashCollegeCards[0]?.college ?? COLLEGES[0]
    const college = flashCollegeFilter === 'ALL' ? fallbackCollege : flashCollegeFilter
    startCollegeGeneratedQuiz(college)
  }

  function startRandomFlashQuiz() {
    const selectedFeelings: FlashFeelingFilter[] =
      flashCollegeLevelFilter === 'ALL' ? ['none', 'again', 'hard', 'good', 'easy'] : [flashCollegeLevelFilter]
    const visibleColleges = flashCollegeCards.map((row) => row.college)
    const selectedColleges = visibleColleges.length > 0 ? visibleColleges : [...COLLEGES]
    const keys = buildQuizGeneratorCardKeys({
      scope: 'colleges',
      selectedItems: [],
      selectedColleges,
      selectedFeelings,
      prioritizeWeak: false,
      questionCount: flashQuestionCount,
      randomize: true,
    })

    setFlashGeneratorScope('colleges')
    setFlashSelectedColleges(selectedColleges)
    setFlashSelectedFeelings(selectedFeelings)
    setFlashPrioritizeWeak(false)
    startGeneratedFlashSession(keys)
    setFlashGeneratorModalOpen(true)
    setFlashGeneratorStep(3)
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
          youtubeUrl: currentItemTracking.youtubeUrl,
          usefulLinkUrl: currentItemTracking.usefulLinkUrl,
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
          youtubeUrl: itemTracking.youtubeUrl,
          usefulLinkUrl: itemTracking.usefulLinkUrl,
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
      const nextLastReviewDate = getLatestIsoDate(
        itemTracking.lastReviewDate,
        getLatestSheetReviewDate(nextLisaSheets),
        getLatestSheetReviewDate(nextPlatformSheets),
      )
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
          youtubeUrl: itemTracking.youtubeUrl,
          usefulLinkUrl: itemTracking.usefulLinkUrl,
          itemMastery: itemTracking.itemMastery,
          itemIcon: itemTracking.itemIcon,
          itemColor: itemTracking.itemColor,
          itemLabel: itemTracking.itemLabel,
          lastQuizResult: itemTracking.lastQuizResult,
          quizCount: itemTracking.quizCount,
          lastReviewDate: nextLastReviewDate,
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
          youtubeUrl: itemTracking.youtubeUrl,
          usefulLinkUrl: itemTracking.usefulLinkUrl,
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
            youtubeUrl: itemTracking.youtubeUrl,
            usefulLinkUrl: itemTracking.usefulLinkUrl,
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

  function updateItemYoutubeUrl(itemNumber: number, value: string) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const previousUrl = itemTracking.youtubeUrl.trim()
      const nextUrl = value.trim()
      const actions: string[] = []

      if (nextUrl !== previousUrl) {
        if (!nextUrl) {
          actions.push('Vidéo YouTube supprimée')
        } else if (!previousUrl) {
          actions.push('Vidéo YouTube ajoutée')
        } else {
          actions.push('Vidéo YouTube modifiée')
        }
      }

      const nextTracking = appendActionLogs(
        {
          ...itemTracking,
          youtubeUrl: nextUrl,
          usefulLinkUrl: itemTracking.usefulLinkUrl,
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
            youtubeUrl: itemTracking.youtubeUrl,
            usefulLinkUrl: itemTracking.usefulLinkUrl,
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
            youtubeUrl: itemTracking.youtubeUrl,
            usefulLinkUrl: itemTracking.usefulLinkUrl,
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

  function getQuizImageKey(itemNumber: number, cardId: string, slot?: QuizImageSlot) {
    return slot ? `${itemNumber}:${cardId}:${slot}` : `${itemNumber}:${cardId}`
  }

  function applyLazyLoadedQuizImages(
    itemNumber: number,
    cardId: string,
    images: Partial<Record<QuizImageSlot, string>>,
  ) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      let changed = false
      const cards = itemTracking.quiz.cards.map((card) => {
        if (card.id !== cardId) {
          return card
        }
        const nextCard = { ...card }
        for (const slot of QUIZ_IMAGE_SLOTS) {
          const imageDataUrl = images[slot]?.trim() ?? ''
          if (!imageDataUrl || getQuizCardImageDataUrl(nextCard, slot)) {
            continue
          }
          Object.assign(nextCard, getQuizCardImagePatch(slot, imageDataUrl, true))
          changed = true
        }
        if (!changed) {
          return card
        }
        return nextCard
      })
      if (!changed) {
        return current
      }
      return {
        ...current,
        items: {
          ...current.items,
          [itemNumber]: {
            ...itemTracking,
            quiz: {
              ...itemTracking.quiz,
              cards,
            },
          },
        },
      }
    })
  }

  async function loadQuizCardImagesOnDemand(
    itemNumber: number,
    card: Pick<
      QuizCard,
      'id' | 'frontImageDataUrl' | 'hasFrontImageDataUrl' | 'backImageDataUrl' | 'hasBackImageDataUrl'
    >,
  ) {
    const needsFrontImage = card.hasFrontImageDataUrl && !card.frontImageDataUrl
    const needsBackImage = card.hasBackImageDataUrl && !card.backImageDataUrl
    if (!needsFrontImage && !needsBackImage) {
      return
    }
    const key = getQuizImageKey(itemNumber, card.id)
    if (lazyImageLoadInFlightRef.current.has(key)) {
      return
    }

    lazyImageLoadInFlightRef.current.add(key)
    try {
      const payload = await apiRequest(`/api/state/images/${itemNumber}/${encodeURIComponent(card.id)}`, undefined, {
        requireServerAppHeader: true,
      })
      const frontImageDataUrl = typeof payload.frontImageDataUrl === 'string' ? payload.frontImageDataUrl : ''
      const backImageDataUrl = typeof payload.backImageDataUrl === 'string' ? payload.backImageDataUrl : ''
      if (frontImageDataUrl || backImageDataUrl) {
        const nextSyncedImages = { ...lastSyncedQuizImagesRef.current }
        if (frontImageDataUrl) {
          nextSyncedImages[getQuizImageKey(itemNumber, card.id, 'front')] = frontImageDataUrl
        }
        if (backImageDataUrl) {
          nextSyncedImages[getQuizImageKey(itemNumber, card.id, 'back')] = backImageDataUrl
        }
        lastSyncedQuizImagesRef.current = nextSyncedImages
        applyLazyLoadedQuizImages(itemNumber, card.id, {
          front: frontImageDataUrl,
          back: backImageDataUrl,
        })
      } else {
        console.info('[quiz-image] Image introuvable pour la carte', { itemNumber, cardId: card.id })
      }
    } catch {
      console.info('[quiz-image] Chargement différé impossible pour le moment', { itemNumber, cardId: card.id })
    } finally {
      lazyImageLoadInFlightRef.current.delete(key)
    }
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

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        if (!result) {
          reject(new Error('Lecture image impossible.'))
          return
        }
        resolve(result)
      }
      reader.onerror = () => reject(new Error('Lecture image impossible.'))
      reader.readAsDataURL(file)
    })
  }

  function setQuizImageFeedback(slot: QuizImageSlot, patch: { error?: string; fileName?: string }) {
    if (patch.error !== undefined) {
      setQuizImageErrors((current) => ({ ...current, [slot]: patch.error ?? '' }))
    }
    if (patch.fileName !== undefined) {
      setQuizImageFileNames((current) => ({ ...current, [slot]: patch.fileName ?? '' }))
    }
  }

  async function handleQuizCardImageUpload(
    itemNumber: number,
    cardId: string,
    slot: QuizImageSlot,
    files: FileList | null,
  ) {
    setQuizImageFeedback(slot, { error: '' })
    const file = files?.[0]
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setQuizImageFeedback(slot, { fileName: '', error: 'Fichier invalide: choisis une image.' })
      return
    }
    if (file.size > QUIZ_CARD_IMAGE_MAX_BYTES) {
      setQuizImageFeedback(slot, { fileName: '', error: 'Image trop lourde: maximum 1 MB.' })
      return
    }
    try {
      const imageDataUrl = await fileToDataUrl(file)
      updateQuizCard(itemNumber, cardId, getQuizCardImagePatch(slot, imageDataUrl, true))
      setQuizImageFeedback(slot, { fileName: file.name, error: '' })
    } catch {
      setQuizImageFeedback(slot, { fileName: '', error: "Impossible d'importer l'image." })
    }
  }

  function openQuizCardImagePicker(itemNumber: number, cardId: string, slot: QuizImageSlot) {
    setQuizImageFeedback(slot, { error: '' })
    const picker = document.createElement('input')
    picker.type = 'file'
    picker.accept = 'image/*'
    picker.style.position = 'fixed'
    picker.style.width = '1px'
    picker.style.height = '1px'
    picker.style.opacity = '0'
    picker.style.pointerEvents = 'none'
    picker.style.left = '-9999px'
    document.body.appendChild(picker)
    picker.addEventListener(
      'change',
      () => {
        setQuizImageFeedback(slot, { fileName: '', error: '' })
        void handleQuizCardImageUpload(itemNumber, cardId, slot, picker.files)
        picker.remove()
      },
      { once: true },
    )
    picker.click()
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
          youtubeUrl: itemTracking.youtubeUrl,
          usefulLinkUrl: itemTracking.usefulLinkUrl,
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

  function handleYouTubeSave() {
    if (!effectiveSelectedItem) {
      return
    }
    const videoId = extractYouTubeVideoId(youtubeInput)
    if (!videoId) {
      setYoutubeInputError('Lien YouTube invalide. Exemple: https://www.youtube.com/watch?v=...')
      return
    }
    const normalizedUrl = makeYouTubeWatchUrl(videoId)
    updateItemYoutubeUrl(effectiveSelectedItem.itemNumber, normalizedUrl)
    setYoutubeInput(normalizedUrl)
    setYoutubeInputError('')
  }

  function handleYouTubeClear() {
    if (!effectiveSelectedItem) {
      return
    }
    updateItemYoutubeUrl(effectiveSelectedItem.itemNumber, '')
    setYoutubeInput('')
    setYoutubeInputError('')
  }

  function updateItemUsefulLinkUrl(itemNumber: number, value: string) {
    setTrackingState((current) => {
      const itemTracking = normalizeItemTracking(current.items[itemNumber] ?? getDefaultItemTracking())
      const previousUrl = itemTracking.usefulLinkUrl.trim()
      const nextUrl = value.trim()
      const actions: string[] = []

      if (nextUrl !== previousUrl) {
        if (!nextUrl) {
          actions.push('Lien utile supprimé')
        } else if (!previousUrl) {
          actions.push('Lien utile ajouté')
        } else {
          actions.push('Lien utile modifié')
        }
      }

      const nextTracking = appendActionLogs(
        {
          ...itemTracking,
          usefulLinkUrl: nextUrl,
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

  function handleUsefulLinkSave() {
    if (!effectiveSelectedItem) {
      return
    }
    const normalizedUrl = normalizeGenericUrl(usefulLinkInput)
    if (!normalizedUrl) {
      setUsefulLinkInputError('Lien invalide. Exemple: https://example.com')
      return
    }
    updateItemUsefulLinkUrl(effectiveSelectedItem.itemNumber, normalizedUrl)
    setUsefulLinkInput(normalizedUrl)
    setUsefulLinkInputError('')
  }

  function handleUsefulLinkClear() {
    if (!effectiveSelectedItem) {
      return
    }
    updateItemUsefulLinkUrl(effectiveSelectedItem.itemNumber, '')
    setUsefulLinkInput('')
    setUsefulLinkInputError('')
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
        youtubeDisplayMode,
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
      setYoutubeDisplayMode(parsed.data.youtubeDisplayMode === 'external' ? 'external' : 'embed')
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

  const isAuthBootstrapping = authStatus === 'authed' && !hasLoadedRemoteState

  if (authStatus !== 'authed' || isAuthBootstrapping) {
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
                    <button
                      className="ghost-btn auth-login-btn"
                      disabled={loginPending || isAuthBootstrapping}
                      onClick={() => void handleLogin()}
                    >
                      {loginPending || isAuthBootstrapping ? (
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
            {authStatus === 'loading' || isAuthBootstrapping ? <p className="auth-sub">Chargement...</p> : null}
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
      } ${isSaveLocked ? 'is-save-locked' : ''}`}
    >
      {isSaveLocked ? (
        <div className="save-lock-banner" role="alert" aria-live="assertive">
          <p>{saveLockReason ? getSaveLockMessage(saveLockReason) : 'Sauvegarde bloquée.'}</p>
          <div className="save-lock-actions">
            <button type="button" className="ghost-btn" onClick={() => void handleRecoveryAction()}>
              {saveLockReason === 'client-stale' ? 'Recharger la page' : 'Se reconnecter'}
            </button>
            {saveLockReason === 'session-expired' ? (
              <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>
                Recharger quand même
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
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
              <p className="sidebar-title">ItemsTracker</p>
            </div>
          </div>
        </div>
        <nav ref={sidebarNavRef} className={`sidebar-nav ${sidebarNavBubble.ready ? 'with-active-bubble' : ''}`}>
          <span
            className="sidebar-nav-active-bubble"
            aria-hidden="true"
            style={{
              transform: `translateY(${sidebarNavBubble.top}px)`,
              height: `${sidebarNavBubble.height}px`,
              opacity: sidebarNavBubble.ready ? 1 : 0,
            }}
          />
          <button
            type="button"
            ref={(node) => {
              sidebarNavButtonRefs.current.dashboard = node
            }}
            className={`sidebar-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <img src={navDashboardIcon} className="sidebar-nav-icon-img" alt="" />
            </span>
            <span className="sidebar-nav-label">Dashboard</span>
          </button>
          <button
            type="button"
            ref={(node) => {
              sidebarNavButtonRefs.current.items = node
            }}
            className={`sidebar-nav-item ${activeView === 'items' ? 'active' : ''}`}
            onClick={() => setActiveView('items')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <img src={navItemsIcon} className="sidebar-nav-icon-img" alt="" />
            </span>
            <span className="sidebar-nav-label">Items</span>
          </button>
          <button
            type="button"
            ref={(node) => {
              sidebarNavButtonRefs.current.flashcards = node
            }}
            className={`sidebar-nav-item ${activeView === 'flashcards' ? 'active' : ''}`}
            onClick={() => setActiveView('flashcards')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <img src={navFlashcardsIcon} className="sidebar-nav-icon-img" alt="" />
            </span>
            <span className="sidebar-nav-label">FlashCards</span>
          </button>
          <button
            type="button"
            ref={(node) => {
              sidebarNavButtonRefs.current.colleges = node
            }}
            className={`sidebar-nav-item ${activeView === 'colleges' ? 'active' : ''}`}
            onClick={() => setActiveView('colleges')}
          >
            <span className="sidebar-nav-icon" aria-hidden="true">
              <img src={navCollegesIcon} className="sidebar-nav-icon-img" alt="" />
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
              <img src={navInsightsIcon} className="sidebar-nav-icon-img" alt="" />
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
                <div className="menu-row-input menu-row-highlight">
                  <span>Affichage vidéo YouTube</span>
                  <div className="youtube-view-mode" role="group" aria-label="Choix affichage YouTube">
                    <button
                      type="button"
                      className={`ghost-btn ${youtubeDisplayMode === 'embed' ? 'active' : ''}`}
                      onClick={() => setYoutubeDisplayMode('embed')}
                    >
                      Vidéo
                    </button>
                    <button
                      type="button"
                      className={`ghost-btn ${youtubeDisplayMode === 'external' ? 'active' : ''}`}
                      onClick={() => setYoutubeDisplayMode('external')}
                    >
                      Bouton
                    </button>
                  </div>
                </div>
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
          <div className="topbar-meta" aria-live="polite">
            {saveErrorMessage ? (
              <span className="topbar-save-warning">{saveErrorMessage}</span>
            ) : lastSavedAt ? (
              <span>Dernière sauvegarde : {lastSavedAt}</span>
            ) : authStatus === 'authed' && !hasLoadedRemoteState ? (
              <span>Cloud indisponible, reconnexion...</span>
            ) : null}
            {localShadowNotice ? (
              <span className="topbar-save-note">
                Copie locale plus récente détectée ({localShadowNotice.savedAtLabel}) sur cet appareil. Version cloud confirmée chargée.
              </span>
            ) : null}
          </div>
          <div className="topbar-actions">
          <button
            className="ghost-btn icon-btn"
            title="Déconnexion"
            aria-label="Déconnexion"
            onClick={() => void handleLogout()}
          >
            <img src={logoutIcon} className="logout-icon-img" alt="" aria-hidden="true" />
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
                ? `Sauvegarde cloud OK${lastSavedAt ? ` (${lastSavedAt})` : ''}`
                : `Erreur de sauvegarde${saveErrorMessage ? `: ${saveErrorMessage}` : ''}`}
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
              <option value="itemAsc">Trier : Item croissant</option>
              <option value="itemDesc">Trier : Item décroissant</option>
              <option value="reviews">Trier : Révisions</option>
              <option value="progress">Trier : Progression</option>
              <option value="lastReviewAsc">Trier : Dernière révision croissante</option>
              <option value="lastReviewDesc">Trier : Dernière révision décroissante</option>
            </select>
          </div>

              <div className="table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Colleges</th>
                  <th>Fiches LISA</th>
                  <th>Fiches Plateformes</th>
                  <th>Révisions</th>
                  <th>Progression</th>
                  <th>Ressenti</th>
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
                  const masteryToneClass =
                    item.tracking.itemMastery === 'Non évalué'
                      ? 'none'
                      : `mastery-${normalizeText(item.tracking.itemMastery).toLowerCase().replace(' ', '-')}`
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
                        <span className={`item-mastery-pill ${masteryToneClass}`}>{item.tracking.itemMastery}</span>
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
                Prochaine(s) lecture(s)
                <textarea
                  value={effectiveSelectedItem.tracking.itemComment}
                  placeholder="Notes pour les prochaines lectures..."
                  onChange={(event) => updateItemComment(effectiveSelectedItem.itemNumber, event.target.value)}
                />
              </label>

              <div className="inline-accordion">
                <button
                  type="button"
                  className={`inline-accordion-head ${youtubeSectionOpen ? 'open' : ''}`}
                  aria-expanded={youtubeSectionOpen}
                  onClick={() => setYoutubeSectionOpen((current) => !current)}
                >
                  <h3>Vidéo YouTube</h3>
                  <span className="inline-accordion-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {youtubeSectionOpen ? (
                  <div className="youtube-editor">
                    <div className="youtube-input-row">
                      <input
                        type="url"
                        placeholder="Coller le lien YouTube ici (ex. https://www.youtube.com/watch?v=...)"
                        value={youtubeInput}
                        onChange={(event) => {
                          setYoutubeInput(event.target.value)
                          if (youtubeInputError) {
                            setYoutubeInputError('')
                          }
                        }}
                      />
                      <button type="button" className="ghost-btn" onClick={handleYouTubeSave}>
                        {effectiveSelectedItem.tracking.youtubeUrl ? 'Modifier' : 'Ajouter'}
                      </button>
                      {effectiveSelectedItem.tracking.youtubeUrl ? (
                        <button type="button" className="ghost-btn" onClick={handleYouTubeClear}>
                          Supprimer
                        </button>
                      ) : null}
                      {selectedYouTubeVideoId && youtubeDisplayMode === 'external' ? (
                        <a
                          href={makeYouTubeWatchUrl(selectedYouTubeVideoId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ghost-btn youtube-open-link"
                        >
                          Voir vidéo
                        </a>
                      ) : null}
                    </div>
                    {youtubeInputError ? <p className="youtube-error">{youtubeInputError}</p> : null}
                    {selectedYouTubeVideoId ? (
                      <div className="youtube-preview">
                        {youtubeDisplayMode === 'embed' ? (
                          <div className="youtube-embed-wrap">
                            <iframe
                              src={`https://www.youtube-nocookie.com/embed/${selectedYouTubeVideoId}`}
                              title={`Vidéo item ${effectiveSelectedItem.itemNumber}`}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              referrerPolicy="strict-origin-when-cross-origin"
                              allowFullScreen
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : effectiveSelectedItem.tracking.youtubeUrl ? (
                      <p className="muted">Le lien YouTube sauvegardé est invalide.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="inline-accordion">
                <button
                  type="button"
                  className={`inline-accordion-head ${usefulLinkSectionOpen ? 'open' : ''}`}
                  aria-expanded={usefulLinkSectionOpen}
                  onClick={() => setUsefulLinkSectionOpen((current) => !current)}
                >
                  <h3>Lien utile</h3>
                  <span className="inline-accordion-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {usefulLinkSectionOpen ? (
                  <div className="useful-link-editor">
                    <div className="youtube-input-row">
                      <input
                        type="url"
                        placeholder="Coller un lien utile (ex. https://example.com)"
                        value={usefulLinkInput}
                        onChange={(event) => {
                          setUsefulLinkInput(event.target.value)
                          if (usefulLinkInputError) {
                            setUsefulLinkInputError('')
                          }
                        }}
                      />
                      <button
                        type="button"
                        className={`ghost-btn ${effectiveSelectedItem.tracking.usefulLinkUrl ? 'link-icon-btn' : ''}`}
                        title={effectiveSelectedItem.tracking.usefulLinkUrl ? 'Modifier le lien utile' : 'Ajouter le lien utile'}
                        aria-label={effectiveSelectedItem.tracking.usefulLinkUrl ? 'Modifier le lien utile' : 'Ajouter le lien utile'}
                        onClick={handleUsefulLinkSave}
                      >
                        {effectiveSelectedItem.tracking.usefulLinkUrl ? (
                          <span className="link-icon-glyph" aria-hidden="true">
                            ✏️
                          </span>
                        ) : (
                          'Ajouter'
                        )}
                      </button>
                      {effectiveSelectedItem.tracking.usefulLinkUrl ? (
                        <button
                          type="button"
                          className="ghost-btn link-icon-btn link-icon-btn-danger"
                          title="Supprimer le lien utile"
                          aria-label="Supprimer le lien utile"
                          onClick={handleUsefulLinkClear}
                        >
                          <span className="link-icon-glyph" aria-hidden="true">
                            🗑️
                          </span>
                        </button>
                      ) : null}
                      {effectiveSelectedItem.tracking.usefulLinkUrl ? (
                        <a
                          href={effectiveSelectedItem.tracking.usefulLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ghost-btn youtube-open-link"
                        >
                          Voir lien
                        </a>
                      ) : null}
                    </div>
                    {usefulLinkInputError ? <p className="youtube-error">{usefulLinkInputError}</p> : null}
                  </div>
                ) : null}
              </div>

              <div className="inline-accordion">
                <button
                  type="button"
                  className={`inline-accordion-head ${itemVisualSectionOpen ? 'open' : ''}`}
                  aria-expanded={itemVisualSectionOpen}
                  onClick={() => setItemVisualSectionOpen((current) => !current)}
                >
                  <h3>Marqueur visuel item</h3>
                  <span className="inline-accordion-chevron" aria-hidden="true">
                    ▾
                  </span>
                </button>
                {itemVisualSectionOpen ? (
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
                ) : null}
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
                          title={getQuizRichTextPlainText(card.question) || `Carte ${index + 1}`}
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
                            <QuizRichTextEditor
                              placeholder="Laisser vide pour question auto..."
                              value={activeCard.question}
                              onChange={(value) =>
                                updateQuizCard(effectiveSelectedItem.itemNumber, activeCard.id, {
                                  question: value,
                                })
                              }
                            />
                          </label>
                          <label className="block-label">
                            Réponse carte active
                            <QuizRichTextEditor
                              placeholder="Laisser vide pour utiliser la description de l'item..."
                              value={activeCard.answer}
                              onChange={(value) =>
                                updateQuizCard(effectiveSelectedItem.itemNumber, activeCard.id, {
                                  answer: value,
                                })
                              }
                            />
                          </label>
                          <label className="block-label">
                            Image recto (max 1 MB)
                            <div className="quiz-file-input-row">
                              <button
                                type="button"
                                className="ghost-btn quiz-file-picker-btn"
                                onClick={() =>
                                  openQuizCardImagePicker(effectiveSelectedItem.itemNumber, activeCard.id, 'front')
                                }
                              >
                                Choose File
                              </button>
                              {quizImageErrors.front ? (
                                <span className="quiz-file-name quiz-file-name-error">{quizImageErrors.front}</span>
                              ) : quizImageFileNames.front ? (
                                <span className="quiz-file-name">{quizImageFileNames.front}</span>
                              ) : null}
                            </div>
                          </label>
                          <label className="block-label">
                            Image verso (max 1 MB)
                            <div className="quiz-file-input-row">
                              <button
                                type="button"
                                className="ghost-btn quiz-file-picker-btn"
                                onClick={() =>
                                  openQuizCardImagePicker(effectiveSelectedItem.itemNumber, activeCard.id, 'back')
                                }
                              >
                                Choose File
                              </button>
                              {quizImageErrors.back ? (
                                <span className="quiz-file-name quiz-file-name-error">{quizImageErrors.back}</span>
                              ) : quizImageFileNames.back ? (
                                <span className="quiz-file-name">{quizImageFileNames.back}</span>
                              ) : null}
                            </div>
                          </label>
                          <div className="quiz-card-media-actions">
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                  setQuizImageFeedback('front', { fileName: '', error: '' })
                                  updateQuizCard(
                                    effectiveSelectedItem.itemNumber,
                                    activeCard.id,
                                    getQuizCardImagePatch('front', '', false),
                                  )
                                }}
                              disabled={!activeCard.frontImageDataUrl && !activeCard.hasFrontImageDataUrl}
                            >
                              Retirer image recto
                            </button>
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => {
                                  setQuizImageFeedback('back', { fileName: '', error: '' })
                                  updateQuizCard(
                                    effectiveSelectedItem.itemNumber,
                                    activeCard.id,
                                    getQuizCardImagePatch('back', '', false),
                                  )
                                }}
                              disabled={!activeCard.backImageDataUrl && !activeCard.hasBackImageDataUrl}
                            >
                              Retirer image verso
                            </button>
                          </div>
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
                    <CollegeHealthIcon college={college} className="college-picker-health-icon" />
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
                        <p>
                          <CollegeHealthIcon college={college} className="college-card-health-icon" />
                          <span>{college}</span>
                        </p>
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
                <div className="quiz-face-body">
                  <div
                    className={`${getQuizTextSizeClass(getQuizRichTextPlainText(quizQuestion))} quiz-rich-rendered`}
                    dangerouslySetInnerHTML={{ __html: sanitizeQuizRichTextHtml(quizQuestion) }}
                  />
                  {activeQuizCard?.frontImageDataUrl ? (
                    <img
                      className="quiz-face-media"
                      src={activeQuizCard.frontImageDataUrl}
                      alt="Illustration du recto"
                      onClick={(event) => {
                        event.stopPropagation()
                        openImageLightbox(activeQuizCard.frontImageDataUrl, 'Illustration du recto')
                      }}
                    />
                  ) : (
                    <span className="quiz-face-media-placeholder" aria-hidden="true">IMG</span>
                  )}
                </div>
              </div>
              <div className="quiz-face quiz-back">
                <p className="quiz-face-label">Réponse</p>
                <div className="quiz-face-body">
                  <div
                    className={`${getQuizTextSizeClass(getQuizRichTextPlainText(quizAnswer))} quiz-rich-rendered`}
                    dangerouslySetInnerHTML={{ __html: sanitizeQuizRichTextHtml(quizAnswer) }}
                  />
                  {activeQuizCard?.backImageDataUrl ? (
                    <img
                      className="quiz-face-media"
                      src={activeQuizCard.backImageDataUrl}
                      alt="Illustration du verso"
                      onClick={(event) => {
                        event.stopPropagation()
                        openImageLightbox(activeQuizCard.backImageDataUrl, 'Illustration du verso')
                      }}
                    />
                  ) : (
                    <span className="quiz-face-media-placeholder" aria-hidden="true">IMG</span>
                  )}
                </div>
              </div>
            </div>

            {quizEditMode && activeQuizCard ? (
              <div className="quiz-modal-editor">
                <label className="block-label">
                  Question
                  <QuizRichTextEditor
                    placeholder="Question de la flashcard..."
                    value={activeQuizCard.question}
                    onChange={(value) => updateQuizCard(quizItem.itemNumber, activeQuizCard.id, { question: value })}
                  />
                </label>
                <label className="block-label">
                  Réponse
                  <QuizRichTextEditor
                    placeholder="Réponse de la flashcard..."
                    value={activeQuizCard.answer}
                    onChange={(value) => updateQuizCard(quizItem.itemNumber, activeQuizCard.id, { answer: value })}
                  />
                </label>
                <label className="block-label">
                  Image recto (max 1 MB)
                  <div className="quiz-file-input-row">
                    <button
                      type="button"
                      className="ghost-btn quiz-file-picker-btn"
                      onClick={() => openQuizCardImagePicker(quizItem.itemNumber, activeQuizCard.id, 'front')}
                    >
                      Choose File
                    </button>
                    {quizImageErrors.front ? (
                      <span className="quiz-file-name quiz-file-name-error">{quizImageErrors.front}</span>
                    ) : quizImageFileNames.front ? (
                      <span className="quiz-file-name">{quizImageFileNames.front}</span>
                    ) : null}
                  </div>
                </label>
                <label className="block-label">
                  Image verso (max 1 MB)
                  <div className="quiz-file-input-row">
                    <button
                      type="button"
                      className="ghost-btn quiz-file-picker-btn"
                      onClick={() => openQuizCardImagePicker(quizItem.itemNumber, activeQuizCard.id, 'back')}
                    >
                      Choose File
                    </button>
                    {quizImageErrors.back ? (
                      <span className="quiz-file-name quiz-file-name-error">{quizImageErrors.back}</span>
                    ) : quizImageFileNames.back ? (
                      <span className="quiz-file-name">{quizImageFileNames.back}</span>
                    ) : null}
                  </div>
                </label>
                <div className="quiz-card-media-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setQuizImageFeedback('front', { fileName: '', error: '' })
                      updateQuizCard(quizItem.itemNumber, activeQuizCard.id, getQuizCardImagePatch('front', '', false))
                    }}
                    disabled={!activeQuizCard.frontImageDataUrl && !activeQuizCard.hasFrontImageDataUrl}
                  >
                    Retirer image recto
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      setQuizImageFeedback('back', { fileName: '', error: '' })
                      updateQuizCard(quizItem.itemNumber, activeQuizCard.id, getQuizCardImagePatch('back', '', false))
                    }}
                    disabled={!activeQuizCard.backImageDataUrl && !activeQuizCard.hasBackImageDataUrl}
                  >
                    Retirer image verso
                  </button>
                </div>
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
        <section id="flashcards-section" className="flashcards-page">
          <div className="flashcards-generator-callout" aria-label="Générateur de quiz">
            <div className="flashcards-generator-copy">
              <p className="flashcards-generator-kicker">
                <span aria-hidden="true">✦</span>
                Générateur de quiz
              </p>
              <h2>Créez un quiz personnalisé</h2>
              <p>Choisissez un collège, le nombre de questions et le niveau pour générer un quiz adapté.</p>
            </div>
            <div className="flashcards-generator-controls">
              <label className="flashcards-field">
                <span>Collège</span>
                <select value={flashCollegeFilter} onChange={(event) => setFlashCollegeFilter(event.target.value)}>
                  <option value="ALL">Sélectionner un collège</option>
                  {COLLEGES.map((college) => (
                    <option key={college} value={college}>
                      {getFlashCollegeDisplayName(college)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flashcards-field">
                <span>Nombre de questions</span>
                <select value={String(flashQuestionCount)} onChange={(event) => setFlashQuestionCount(Number(event.target.value))}>
                  {[10, 20, 30, 40, 50].map((count) => (
                    <option key={count} value={String(count)}>
                      {count} questions
                    </option>
                  ))}
                </select>
              </label>
              <label className="flashcards-field">
                <span>Niveau</span>
                <select
                  value={flashCollegeLevelFilter}
                  onChange={(event) => setFlashCollegeLevelFilter(event.target.value as FlashCollegeLevelFilter)}
                >
                  <option value="ALL">Tous les niveaux</option>
                  <option value="none">Non évalué</option>
                  <option value="again">Revoir</option>
                  <option value="hard">Difficile</option>
                  <option value="good">Bon</option>
                  <option value="easy">Parfait</option>
                </select>
              </label>
            </div>
            <button type="button" className="flashcards-generator-btn" onClick={startSelectedCollegeGeneratedQuiz}>
              <span aria-hidden="true">✦</span>
              Générer le quiz
            </button>
          </div>
          <div className="flashcards-toolbar">
            <label className="flashcards-search">
              <span className="flashcards-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="Rechercher un collège..."
                value={flashCollegeSearch}
                onChange={(event) => setFlashCollegeSearch(event.target.value)}
              />
            </label>
            <select
              className="flashcards-toolbar-select"
              value={flashCollegeLevelFilter}
              onChange={(event) => setFlashCollegeLevelFilter(event.target.value as FlashCollegeLevelFilter)}
            >
              <option value="ALL">Tous les niveaux</option>
              <option value="none">Non évalué</option>
              <option value="again">Revoir</option>
              <option value="hard">Difficile</option>
              <option value="good">Bon</option>
              <option value="easy">Parfait</option>
            </select>
            <select
              className="flashcards-toolbar-select"
              value={flashCollegeSort}
              onChange={(event) => setFlashCollegeSort(event.target.value as FlashCollegeSort)}
            >
              <option value="progress">Trier par : Progression</option>
              <option value="name">Trier par : Nom</option>
              <option value="items">Trier par : Items</option>
            </select>
            <button type="button" className="flashcards-random-btn" onClick={startRandomFlashQuiz}>
              <span aria-hidden="true">⤨</span>
              Quiz aléatoire
            </button>
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
                                <CollegeHealthIcon college={college} className="flash-generator-health-icon" />
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
                            <div className="quiz-face-body">
                              <div
                                className={`${getQuizTextSizeClass(getQuizRichTextPlainText(activeGeneratedFlashcard.question))} quiz-rich-rendered`}
                                dangerouslySetInnerHTML={{ __html: sanitizeQuizRichTextHtml(activeGeneratedFlashcard.question) }}
                              />
                              {activeGeneratedFlashcard.frontImageDataUrl ? (
                                <img
                                  className="quiz-face-media"
                                  src={activeGeneratedFlashcard.frontImageDataUrl}
                                  alt="Illustration du recto"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openImageLightbox(activeGeneratedFlashcard.frontImageDataUrl, 'Illustration du recto')
                                  }}
                                />
                              ) : (
                                <span className="quiz-face-media-placeholder" aria-hidden="true">IMG</span>
                              )}
                            </div>
                          </div>
                          <div className="quiz-face quiz-back">
                            <p className="quiz-face-label">Réponse</p>
                            <div className="quiz-face-body">
                              <div
                                className={`${getQuizTextSizeClass(getQuizRichTextPlainText(activeGeneratedFlashcard.answer))} quiz-rich-rendered`}
                                dangerouslySetInnerHTML={{ __html: sanitizeQuizRichTextHtml(activeGeneratedFlashcard.answer) }}
                              />
                              {activeGeneratedFlashcard.backImageDataUrl ? (
                                <img
                                  className="quiz-face-media"
                                  src={activeGeneratedFlashcard.backImageDataUrl}
                                  alt="Illustration du verso"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openImageLightbox(activeGeneratedFlashcard.backImageDataUrl, 'Illustration du verso')
                                  }}
                                />
                              ) : (
                                <span className="quiz-face-media-placeholder" aria-hidden="true">IMG</span>
                              )}
                            </div>
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
          {flashCollegeCards.length > 0 ? (
            <div className="flashcards-college-grid">
              {flashCollegeCards.map((row) => (
                <article
                  key={`flash-college-${row.college}`}
                  className="flashcards-college-card"
                  style={{ '--flash-college-color': row.accent } as CSSProperties}
                >
                  <div className="flashcards-card-head">
                    <CollegeHealthIcon college={row.college} className="flashcards-card-icon" />
                    <div className="flashcards-card-title">
                      <h3>{row.displayName}</h3>
                      <p>{row.itemCount} items</p>
                    </div>
                    <button
                      type="button"
                      className="flashcards-card-menu"
                      title={`Options ${row.displayName}`}
                      aria-label={`Options ${row.displayName}`}
                      onClick={() => {
                        setFlashCollegeFilter(row.college)
                        jumpToQuizGeneratorSetup()
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                  <div className="flashcards-progress-track" aria-hidden="true">
                    <span style={{ width: `${row.masteryPercent}%` }} />
                  </div>
                  <p className="flashcards-card-progress">{row.masteryPercent}% maîtrisés</p>
                  <button type="button" className="flashcards-card-launch" onClick={() => startCollegeGeneratedQuiz(row.college)}>
                    <span aria-hidden="true">▶</span>
                    Lancer le quiz
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="flashcards-empty-state">
              <p>Aucun collège ne correspond aux filtres sélectionnés.</p>
            </div>
          )}
        </section>
      ) : null}

      {isImageLightboxOpen && imageLightboxSrc ? (
        <div className="image-lightbox-backdrop" onClick={closeImageLightbox}>
          <div className="image-lightbox-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ghost-btn image-lightbox-close" onClick={closeImageLightbox}>
              Fermer
            </button>
            <img className="image-lightbox-media" src={imageLightboxSrc} alt={imageLightboxAlt} />
          </div>
        </div>
      ) : null}

      {activeView === 'colleges' ? (
        <section className="panel colleges-page">
          <div className="panel-head">
            <h2>Colleges</h2>
          </div>
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
                    <div className="colleges-heat-cell-head">
                      <CollegeHealthIcon college={row.college} />
                      <span>{row.college}</span>
                    </div>
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
