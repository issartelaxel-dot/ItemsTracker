import { Check, CreditCards, FireFlame, Group, List, NavArrowDown, NavArrowRight, OpenBook, Play } from 'iconoir-react'
import type { CSSProperties, ReactNode } from 'react'
import mountain from '../assets/dashboard-mountain-bg.png'
import { HabitGrid } from './HabitGrid'

type StudyDay = { dateKey: string; label: string; count: number; isToday: boolean }
type ReadingWeek = {
  weekKey: string
  weekLabel: string
  days: { dateKey: string; count: number; inRange: boolean; intensity: number }[]
}
type CollegeRow = { college: string; displayName: string; assigned: number; progress: number; accent: string }

export function MobileDashboard({ isMobile, name, progress, dueCount, dueMinutes, streak, weekDays, year, weeks, colleges,
  canReview, onReview, onItems, onCreateFlashcards, onColleges, onCollege, renderCollegeIcon,
}: {
  isMobile: boolean; name: string; progress: number; dueCount: number; dueMinutes: number; streak: number
  weekDays: StudyDay[]; year: number; weeks: ReadingWeek[]; colleges: CollegeRow[]; canReview: boolean
  onReview: () => void; onItems: () => void; onCreateFlashcards: () => void
  onColleges: () => void; onCollege: (college: string) => void; renderCollegeIcon: (college: string) => ReactNode
}) {
  const percent = Math.round(Math.max(0, Math.min(100, progress)))
  const streakLabel = `${streak} jour${streak > 1 ? 's' : ''} de régularité`
  return (
    <section className={`dashboard-home ${isMobile ? 'mobile-dashboard' : 'desktop-dashboard'}`} aria-labelledby="dashboard-title">
      <div className="mobile-dash-greeting">
        <h1 id="dashboard-title">Bonjour, {name} <span aria-hidden="true">👋</span></h1>
        <p>Avance à ton rythme.</p>
      </div>

      <article className="mobile-dash-hero" style={{ '--mobile-dash-mountain': `url(${mountain})` } as CSSProperties}>
        <h2>Un peu chaque jour</h2>
        <p>{streakLabel}</p>
        <button type="button" className="mobile-dash-primary" onClick={onReview} disabled={!canReview}
          title={canReview ? 'Lancer une révision globale' : 'Ajoute une flashcard pour lancer une révision'}>
          <Play aria-hidden="true" />Lancer une révision
        </button>
        {!canReview ? <small>Crée ta première flashcard pour commencer.</small> : null}
      </article>

      <article className="mobile-dash-card mobile-dash-journey" aria-labelledby="mobile-dash-journey-title">
        <h2 id="mobile-dash-journey-title">Ton parcours</h2>
        <div className="mobile-dash-journey-grid">
          <div className="mobile-dash-progress" role="progressbar" aria-label="Progression globale"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="mobile-dash-progress-track" cx="50" cy="50" r="42" />
              <circle className="mobile-dash-progress-value" cx="50" cy="50" r="42" pathLength="100"
                strokeDasharray={`${percent} 100`} opacity={percent === 0 ? 0 : 1} />
            </svg>
            <strong aria-hidden="true">{percent}%</strong>
          </div>
          <p className="mobile-dash-progress-label">Progression<br />globale</p>
          <div className="mobile-dash-due">
            <OpenBook aria-hidden="true" />
            <strong>{dueCount}</strong>
            <span>item{dueCount > 1 ? 's' : ''} à revoir</span>
            <small>≈ {dueMinutes} min</small>
          </div>
        </div>
      </article>

      <section className="mobile-dash-shortcuts" aria-labelledby="mobile-dash-shortcuts-title">
        <h2 id="mobile-dash-shortcuts-title">Tes raccourcis</h2>
        <button type="button" className="mobile-dash-shortcut mobile-dash-items" onClick={onItems}>
          <span className="mobile-dash-shortcut-icon"><List aria-hidden="true" /></span>
          <span><strong>Réviser mes items</strong><small>Reprends là où tu en étais</small></span>
          <NavArrowRight aria-hidden="true" />
        </button>
        <button type="button" className="mobile-dash-shortcut mobile-dash-flashcards" onClick={onCreateFlashcards}>
          <span className="mobile-dash-shortcut-icon"><CreditCards aria-hidden="true" /></span>
          <span><strong>Créer des flashcards</strong><small>Transforme tes notions</small></span>
          <NavArrowRight aria-hidden="true" />
        </button>
      </section>

      <article className="mobile-dash-card mobile-dash-activity" aria-labelledby="mobile-dash-activity-title">
        <h2 id="mobile-dash-activity-title">Régularité</h2>
        <div className="mobile-dash-week">
          <p className="mobile-dash-streak"><FireFlame aria-hidden="true" /><strong>{streak}</strong><span>jour{streak > 1 ? 's' : ''}<br />consécutif{streak > 1 ? 's' : ''}</span></p>
          <div className="mobile-dash-days" aria-label="Activité de la semaine">
            {weekDays.map(day => <span key={day.dateKey}
              className={`mobile-dash-day ${day.count > 0 ? 'is-active' : ''} ${day.isToday ? 'is-today' : ''}`}
              aria-label={`${day.dateKey} : ${day.count} lecture${day.count > 1 ? 's' : ''}${day.isToday ? ', aujourd’hui' : ''}`}>
              <span aria-hidden="true">{day.label}</span>
              <i aria-hidden="true">{day.count > 0 ? <Check /> : null}</i>
            </span>)}
          </div>
        </div>
        <details className="mobile-dash-calendar" open>
          <summary>Lectures en {year}<NavArrowDown aria-hidden="true" /></summary>
          <HabitGrid weeks={weeks.length} maxHeight={100} minCell={3}>
            {weeks.map(week => <div className="habit-week" key={week.weekKey} title={`Semaine du ${week.weekLabel}`}>
              {week.days.map(day => <span key={day.dateKey}
                className={`habit-dot ${day.inRange ? `intensity-${day.intensity}` : 'out-range'}`}
                title={`${day.dateKey} : ${day.count} lecture${day.count > 1 ? 's' : ''}`} />)}
            </div>)}
          </HabitGrid>
          <div className="mobile-dash-legend"><span>Faible</span><span className="legend-scale" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(intensity => <span key={intensity} className={`habit-dot intensity-${intensity}`} />)}
          </span><span>Intense</span></div>
        </details>
      </article>

      <section className="mobile-dash-card mobile-dash-colleges" aria-labelledby="mobile-dash-colleges-title">
        <div className="mobile-dash-section-head">
          <h2 id="mobile-dash-colleges-title">Tes collèges</h2>
          <button type="button" onClick={onColleges}>Voir tout<NavArrowRight aria-hidden="true" /></button>
        </div>
        {colleges.length ? <div className="mobile-dash-college-list">
          {colleges.map(row => <button type="button" key={row.college} className="mobile-dash-college-row"
            style={{ '--mobile-dash-college-accent': row.accent } as CSSProperties} onClick={() => onCollege(row.college)}>
            <span className="mobile-dash-college-icon">{renderCollegeIcon(row.college)}</span>
            <span className="mobile-dash-college-meta"><strong>{row.displayName}</strong><small>{row.assigned} item{row.assigned > 1 ? 's' : ''}</small>
              <span className="mobile-dash-college-track" aria-hidden="true"><span style={{ width: `${row.progress}%` }} /></span>
            </span>
            <span className="mobile-dash-college-percent">{Math.round(row.progress)}%</span>
            <NavArrowRight aria-hidden="true" />
          </button>)}
        </div> : isMobile ? <p className="mobile-dash-empty">Aucun collège assigné pour le moment. Retrouve tes items pour commencer.</p> :
          <div className="desktop-dash-empty-state">
            <span aria-hidden="true"><Group /></span>
            <p className="mobile-dash-empty"><strong>Aucun collège assigné pour le moment.</strong><br />Retrouve tes items pour commencer.</p>
          </div>}
      </section>
    </section>
  )
}
