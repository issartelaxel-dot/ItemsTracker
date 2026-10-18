import { z } from 'zod'
import { onboardingSources } from './onboarding-sources.mjs'
import { academicCoverageFor, academicLocalProgramFor } from './academic-catalog.mjs'

export const ACTIVE_YEARS = ['Y4', 'Y5', 'Y6']
const yearSchema = z.enum(ACTIVE_YEARS)
const updateSchema = z.object({
  yearCode: yearSchema,
  facultyId: z.string().max(80).nullable().optional(),
  betaAcknowledged: z.boolean().optional(),
}).strict()

// Annuaire de recherche uniquement : les identités institutionnelles et les UE
// de ces candidats ne sont pas validées par le dossier de spécification.
const FACULTY_CANDIDATES = [
  ['amiens','Amiens'], ['angers','Angers'], ['antilles-guyane','Antilles-Guyane'],
  ['besancon','Besançon'], ['bordeaux','Bordeaux'], ['brest','Brest'], ['caen','Caen'],
  ['clermont-ferrand','Clermont-Ferrand'], ['dijon','Dijon'], ['grenoble','Grenoble'],
  ['la-reunion','La Réunion'], ['lille','Lille'], ['lille-catho','Lille Catho'],
  ['limoges','Limoges'], ['lyon-est','Lyon Est'], ['lyon-sud','Lyon Sud'],
  ['marseille','Marseille'], ['montpellier-nimes','Montpellier-Nîmes'], ['nancy','Nancy'],
  ['nantes','Nantes'], ['nice','Nice'], ['orleans','Orléans'], ['paris-est-creteil','Paris Est Créteil'],
  ['paris-saclay','Paris Saclay'], ['poitiers','Poitiers'], ['reims','Reims'],
  ['rennes','Rennes'], ['rouen','Rouen'], ['saint-etienne','Saint-Etienne'],
  ['sorbonne-paris-nord','Sorbonne Paris Nord'], ['sorbonne-universite','Sorbonne Université'],
  ['strasbourg','Strasbourg'], ['toulouse-purpan','Toulouse Purpan'],
  ['toulouse-rangueil','Toulouse Rangueil'], ['tours','Tours'],
  ['universite-de-paris','Université de Paris'], ['val-de-grace','Val-de-Grâce'],
  ['versailles-uvsq','Versailles UVSQ'],
]
const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function createOnboarding(pool) {
  async function init() {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(472013)')
      await client.query(`
        CREATE TABLE IF NOT EXISTS academic_faculties (
          id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
          registry_status TEXT NOT NULL DEFAULT 'needs_review',
          archived BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS academic_faculty_aliases (
          normal_form TEXT PRIMARY KEY, faculty_id TEXT NOT NULL REFERENCES academic_faculties(id),
          alias TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS academic_profiles (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          year_code TEXT CHECK (year_code IN ('Y2','Y3','Y4','Y5','Y6')),
          faculty_id TEXT REFERENCES academic_faculties(id),
          legacy_exempt BOOLEAN NOT NULL DEFAULT FALSE,
          completed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE academic_profiles ADD COLUMN IF NOT EXISTS beta_acknowledged_at TIMESTAMPTZ;
        ALTER TABLE academic_profiles ADD COLUMN IF NOT EXISTS faculty_change_count INTEGER NOT NULL DEFAULT 0 CHECK(faculty_change_count>=0);
        ALTER TABLE academic_profiles ADD COLUMN IF NOT EXISTS faculty_change_limit INTEGER NOT NULL DEFAULT 2 CHECK(faculty_change_limit>=2);
        ALTER TABLE academic_profiles ADD COLUMN IF NOT EXISTS faculty_choice_initialized BOOLEAN NOT NULL DEFAULT FALSE;
        UPDATE academic_profiles SET faculty_choice_initialized=TRUE WHERE faculty_id IS NOT NULL AND NOT faculty_choice_initialized;
        CREATE TABLE IF NOT EXISTS academic_faculty_change_requests (
          id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          faculty_id TEXT REFERENCES academic_faculties(id), year_code TEXT NOT NULL CHECK(year_code IN ('Y2','Y3','Y4','Y5','Y6')),
          message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS academic_faculty_change_pending ON academic_faculty_change_requests(user_id) WHERE status='pending';
        CREATE TABLE IF NOT EXISTS academic_availability_requests (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          faculty_id TEXT NOT NULL REFERENCES academic_faculties(id),
          year_code TEXT NOT NULL CHECK(year_code IN ('Y2','Y3','Y4','Y5','Y6')),
          academic_term TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id,faculty_id,year_code,academic_term)
        );
        CREATE TABLE IF NOT EXISTS academic_legacy_cohort (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS academic_migration_exceptions (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          explicit_year_code TEXT NOT NULL,
          detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS academic_migration_marker (
          id INTEGER PRIMARY KEY CHECK(id=1), cutover_at TIMESTAMPTZ NOT NULL,
          historical_count INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS academic_curricula (
          id BIGSERIAL PRIMARY KEY, faculty_id TEXT NOT NULL REFERENCES academic_faculties(id),
          year_code TEXT NOT NULL CHECK(year_code IN ('Y2','Y3','Y4','Y5','Y6')),
          academic_term TEXT NOT NULL, publication_status TEXT NOT NULL DEFAULT 'needs_review'
            CHECK(publication_status IN ('needs_review','published','outdated','rejected')),
          source_url TEXT, rights_status TEXT NOT NULL DEFAULT 'unverified'
            CHECK(rights_status IN ('unverified','approved','rejected')),
          reviewed_by TEXT, published_at TIMESTAMPTZ,
          UNIQUE(faculty_id,year_code,academic_term)
        );
        CREATE TABLE IF NOT EXISTS academic_units (
          id BIGSERIAL PRIMARY KEY, curriculum_id BIGINT NOT NULL REFERENCES academic_curricula(id),
          local_code TEXT, label TEXT NOT NULL, publication_status TEXT NOT NULL DEFAULT 'needs_review'
            CHECK(publication_status IN ('needs_review','published','outdated','rejected')),
          UNIQUE(curriculum_id,local_code)
        );
        CREATE TABLE IF NOT EXISTS academic_unit_item_links (
          unit_id BIGINT NOT NULL REFERENCES academic_units(id), item_number INTEGER NOT NULL,
          review_status TEXT NOT NULL DEFAULT 'needs_review'
            CHECK(review_status IN ('needs_review','published','outdated','rejected')),
          source_url TEXT, reviewed_by TEXT,
          PRIMARY KEY(unit_id,item_number)
        );
        ALTER TABLE academic_unit_item_links ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
        ALTER TABLE academic_profiles DROP CONSTRAINT IF EXISTS academic_profiles_year_code_check;
        ALTER TABLE academic_profiles ADD CONSTRAINT academic_profiles_year_code_check
          CHECK (year_code IN ('Y2','Y3','Y4','Y5','Y6'));
        ALTER TABLE academic_curricula DROP CONSTRAINT IF EXISTS academic_curricula_year_code_check;
        ALTER TABLE academic_curricula ADD CONSTRAINT academic_curricula_year_code_check
          CHECK (year_code IN ('Y2','Y3','Y4','Y5','Y6'));
      `)
      for (const [id, name] of FACULTY_CANDIDATES) {
        await client.query(`INSERT INTO academic_faculties(id,display_name,registry_status)
          VALUES($1,$2,'needs_review') ON CONFLICT(id) DO NOTHING`, [id, name])
      }
      const marker = await client.query('SELECT id FROM academic_migration_marker WHERE id=1')
      if (!marker.rowCount) {
        const historical = await client.query('INSERT INTO academic_legacy_cohort(user_id) SELECT id FROM users ON CONFLICT DO NOTHING')
        await client.query(`INSERT INTO academic_migration_marker(id,cutover_at,historical_count)
          VALUES(1,NOW(),$1)`, [historical.rowCount])
      }
      await client.query(`INSERT INTO academic_migration_exceptions(user_id,explicit_year_code)
        SELECT p.user_id,p.year_code FROM academic_profiles p JOIN academic_legacy_cohort c ON c.user_id=p.user_id
        WHERE p.year_code IS NOT NULL AND p.year_code<>'Y4'
        ON CONFLICT(user_id) DO NOTHING`)
      // Re-runnable, additive backfill. Explicit years are never overwritten.
      await client.query(`INSERT INTO academic_profiles(user_id,year_code,legacy_exempt,completed_at)
        SELECT user_id,'Y4',TRUE,NOW() FROM academic_legacy_cohort
        ON CONFLICT(user_id) DO UPDATE SET
          year_code=COALESCE(academic_profiles.year_code,'Y4'), legacy_exempt=TRUE,
          completed_at=COALESCE(academic_profiles.completed_at,NOW())`)
      const audit = await client.query(`SELECT
        (SELECT historical_count FROM academic_migration_marker WHERE id=1) AS historical_count,
        (SELECT COUNT(*)::int FROM academic_migration_exceptions) AS exceptions`)
      await client.query('COMMIT')
      return { historicalCount: audit.rows[0].historical_count, exceptions: audit.rows[0].exceptions }
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }

  async function state(userId) {
    const result = await pool.query(`SELECT p.year_code AS "yearCode",p.faculty_id AS "facultyId",
      f.display_name AS "facultyName",p.legacy_exempt AS "legacyExempt",
      p.completed_at AS "completedAt",p.faculty_change_count AS "facultyChangeCount",p.faculty_change_limit AS "facultyChangeLimit",
      (SELECT json_build_object('status',r.status,'facultyId',r.faculty_id,'yearCode',r.year_code,'createdAt',r.created_at)
       FROM academic_faculty_change_requests r WHERE r.user_id=u.id ORDER BY r.id DESC LIMIT 1) AS "facultyChangeRequest"
      FROM users u LEFT JOIN academic_profiles p ON p.user_id=u.id
      LEFT JOIN academic_faculties f ON f.id=p.faculty_id WHERE u.id=$1`, [userId])
    if (!result.rowCount) return null
    const row = result.rows[0]
    return { yearCode: row.yearCode || null, facultyId: row.facultyId || null,
      facultyName: row.facultyName || null, legacyExempt: Boolean(row.legacyExempt),
      facultyChangeCount: Number(row.facultyChangeCount || 0), facultyChangeLimit: Number(row.facultyChangeLimit || 2),
      facultyChangesRemaining: Math.max(0, Number(row.facultyChangeLimit || 2) - Number(row.facultyChangeCount || 0)), facultyChangeRequest: row.facultyChangeRequest || null,
      completedAt: row.completedAt || null, required: !ACTIVE_YEARS.includes(row.yearCode) || (!row.completedAt && !row.legacyExempt) || Boolean(row.facultyId && row.yearCode && academicCoverageFor(row.facultyId, row.yearCode) === 'missing') }
  }

  async function coverage(yearCode, facultyId) {
    if (!ACTIVE_YEARS.includes(yearCode)) return { nationalAccess: false, localStatus: 'not_configured', publishedUnitCount: 0, sourceTerm: null }
    const result = facultyId ? await pool.query(`SELECT COUNT(DISTINCT u.id)::int AS count,
      MAX(c.academic_term) AS term FROM academic_curricula c JOIN academic_units u ON u.curriculum_id=c.id
      WHERE c.faculty_id=$1 AND c.year_code=$2 AND c.publication_status='published'
      AND c.rights_status='approved' AND c.reviewed_by IS NOT NULL AND NULLIF(c.source_url,'') IS NOT NULL
      AND c.published_at IS NOT NULL
      AND u.publication_status='published'`, [facultyId, yearCode]) : null
    const count = result?.rows[0]?.count || 0
    return { nationalAccess: ['Y4', 'Y5', 'Y6'].includes(yearCode) && (!facultyId || academicCoverageFor(facultyId, yearCode) !== 'missing'),
      localStatus: count ? 'partial' : 'not_published', publishedUnitCount: count,
      sourceTerm: result?.rows[0]?.term || null,
      rolloutStatus: facultyId ? academicCoverageFor(facultyId, yearCode) : null, academicTerm: '2026-2027' }
  }

  async function resources(userId) {
    const profile = await state(userId)
    if (!profile) return null
    const access = await coverage(profile.yearCode, profile.facultyId)
    if (!ACTIVE_YEARS.includes(profile.yearCode) || access.rolloutStatus === 'missing') return { profile, coverage: { ...access, publishedUnitCount: 0 }, units: [], facultyProgram: null, facultySources: [] }
    const units = profile.facultyId && profile.yearCode ? (await pool.query(`
      SELECT u.id,u.local_code AS "localCode",u.label,c.academic_term AS "academicTerm",
      COALESCE(array_agg(l.item_number ORDER BY l.item_number) FILTER (WHERE l.review_status='published'),'{}') AS "itemNumbers"
      FROM academic_curricula c JOIN academic_units u ON u.curriculum_id=c.id
      LEFT JOIN academic_unit_item_links l ON l.unit_id=u.id AND l.review_status='published'
        AND NULLIF(l.source_url,'') IS NOT NULL AND l.reviewed_by IS NOT NULL
      WHERE c.faculty_id=$1 AND c.year_code=$2 AND c.publication_status='published'
        AND c.rights_status='approved' AND c.reviewed_by IS NOT NULL
        AND NULLIF(c.source_url,'') IS NOT NULL AND c.published_at IS NOT NULL
        AND u.publication_status='published'
      GROUP BY u.id,c.academic_term ORDER BY u.label`, [profile.facultyId, profile.yearCode])).rows : []
    // The collected programme is separate from published teaching resources.
    // It carries its original review status and only explicit item references.
    return { profile, coverage: access, units,
      facultyProgram: academicLocalProgramFor(profile.facultyId, profile.yearCode),
      facultySources: onboardingSources.filter(source => source.facultyId === profile.facultyId && source.years.includes(profile.yearCode))
        .map(({ title, url, academicTerm, note }) => ({ title, url, academicTerm, note })),
    }
  }

  async function save(userId, input, { firstOnly = false } = {}) {
    const parsed = updateSchema.safeParse(input)
    if (!parsed.success) return { status: 400, body: { error: 'Choisis la 4e, la 5e ou la 6e année de médecine.' } }
    const { yearCode, facultyId = null, betaAcknowledged = false } = parsed.data
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
      const existing = await client.query('SELECT * FROM academic_profiles WHERE user_id=$1 FOR UPDATE', [userId])
      if (firstOnly && existing.rows[0]?.completed_at && ACTIVE_YEARS.includes(existing.rows[0].year_code)) {
        await client.query('COMMIT')
        return { status: 200, body: { ok: true, alreadyCompleted: true, onboarding: await state(userId) } }
      }
      if (facultyId) {
        const faculty = await client.query('SELECT id FROM academic_faculties WHERE id=$1 AND archived=FALSE', [facultyId])
        if (!faculty.rowCount) {
          await client.query('ROLLBACK')
          return { status: 400, body: { error: 'Faculté inconnue. Tu peux continuer sans la préciser.' } }
        }
      }
      if (facultyId && academicCoverageFor(facultyId, yearCode) === 'missing') {
        await client.query('ROLLBACK')
        return { status: 409, body: { error: 'Ce cursus est bientôt disponible. Enregistre une demande de disponibilité pour cette faculté.' } }
      }
      if (facultyId && academicCoverageFor(facultyId, yearCode) === 'unconfirmed' && !betaAcknowledged) {
        await client.query('ROLLBACK')
        return { status: 400, body: { error: 'Confirme que tu vérifieras le programme de cette faculté en accès bêta.' } }
      }
      const previous = existing.rows[0]
      const initialized = Boolean(previous?.faculty_choice_initialized || previous?.faculty_id)
      const changed = initialized && (previous?.faculty_id || null) !== facultyId
      const changeCount = Number(previous?.faculty_change_count || 0)
      const changeLimit = Number(previous?.faculty_change_limit || 2)
      if (changed && changeCount >= changeLimit) {
        await client.query('ROLLBACK')
        return { status: 409, body: { code: 'FACULTY_CHANGE_LIMIT', error: 'La limite de changements de faculté est atteinte. Demande une autorisation à l’administration pour un changement supplémentaire.' } }
      }
      await client.query(`INSERT INTO academic_profiles(user_id,year_code,faculty_id,completed_at)
        VALUES($1,$2,$3,NOW()) ON CONFLICT(user_id) DO UPDATE SET
        year_code=EXCLUDED.year_code,faculty_id=EXCLUDED.faculty_id,
        completed_at=COALESCE(academic_profiles.completed_at,NOW()),updated_at=NOW()`,
      [userId, yearCode, facultyId])
      await client.query(`UPDATE academic_profiles SET faculty_change_count=$2,faculty_choice_initialized=$3 WHERE user_id=$1`,
        [userId, changeCount + (changed ? 1 : 0), initialized || Boolean(facultyId)])
      await client.query(`UPDATE academic_profiles SET beta_acknowledged_at=$2 WHERE user_id=$1`,
        [userId, facultyId && academicCoverageFor(facultyId, yearCode) === 'unconfirmed' ? new Date() : null])
      await client.query('COMMIT')
      return { status: 200, body: { ok: true, onboarding: await state(userId), coverage: await coverage(yearCode, facultyId) } }
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }

  async function analytics({ minimumGroupSize = 5 } = {}) {
    const [{ rows: totals }, { rows: years }, { rows: faculties }] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE p.faculty_id IS NOT NULL)::int AS "facultyProvided",
        COUNT(*) FILTER(WHERE p.completed_at IS NOT NULL)::int AS completed
        FROM users u LEFT JOIN academic_profiles p ON p.user_id=u.id`),
      pool.query(`SELECT COALESCE(p.year_code,'non_renseignee') AS "yearCode", COUNT(*)::int AS count
        FROM users u LEFT JOIN academic_profiles p ON p.user_id=u.id GROUP BY 1 ORDER BY 1`),
      pool.query(`SELECT COALESCE(p.faculty_id,'non_renseignee') AS "facultyId",
        COALESCE(f.display_name,'Non renseignée') AS name,COUNT(*)::int AS count
        FROM users u LEFT JOIN academic_profiles p ON p.user_id=u.id
        LEFT JOIN academic_faculties f ON f.id=p.faculty_id GROUP BY 1,2 ORDER BY 2`),
    ])
    const total = totals[0]?.total || 0
    const mask = row => ({ ...row, count: row.count >= minimumGroupSize ? row.count : null,
      suppressed: row.count < minimumGroupSize })
    return { total, completed: totals[0]?.completed || 0,
      facultyCompletionRate: total >= minimumGroupSize ? Math.round(100 * totals[0].facultyProvided / total) : null,
      yearGroups: years.map(mask), facultyGroups: faculties.map(mask),
      facultyMeaning: 'Établissement déclaré, non une géolocalisation', minimumGroupSize }
  }

  async function requestAvailability(userId, input) {
    const parsed = z.object({ facultyId: z.string().min(1).max(80), yearCode: yearSchema,
      message: z.string().trim().max(2000).optional() }).strict().safeParse(input)
    if (!parsed.success) return { status: 400, body: { error: 'Choisis une faculté et une année ; le message est limité à 2 000 caractères.' } }
    const { facultyId, yearCode, message = '' } = parsed.data
    const faculty = await pool.query('SELECT id FROM academic_faculties WHERE id=$1 AND archived=FALSE', [facultyId])
    if (!faculty.rowCount) return { status: 400, body: { error: 'Faculté inconnue.' } }
    if (academicCoverageFor(facultyId, yearCode) !== 'missing') return { status: 409, body: { error: 'Ce cursus est déjà proposé, éventuellement en bêta.' } }
    const result = await pool.query(`INSERT INTO academic_availability_requests(user_id,faculty_id,year_code,academic_term,message)
      VALUES($1,$2,$3,'2026-2027',$4) ON CONFLICT(user_id,faculty_id,year_code,academic_term)
      DO UPDATE SET message=EXCLUDED.message RETURNING id`, [userId, facultyId, yearCode, message])
    return { status: 200, body: { ok: true, requestId: result.rows[0].id } }
  }

  async function requestFacultyChange(userId, input) {
    const parsed = z.object({ facultyId: z.string().min(1).max(80).nullable(), yearCode: yearSchema, message: z.string().trim().max(2000).optional() }).strict().safeParse(input)
    if (!parsed.success) return { status: 400, body: { error: 'Choisis un cursus ; le message est limité à 2 000 caractères.' } }
    const { facultyId, yearCode, message = '' } = parsed.data
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const account = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
      if (!account.rowCount) { await client.query('ROLLBACK'); return { status: 401, body: { error: 'Unauthorized' } } }
      const profile = (await client.query('SELECT * FROM academic_profiles WHERE user_id=$1', [userId])).rows[0]
      if (!profile || profile.faculty_change_count < profile.faculty_change_limit || (profile.faculty_id || null) === facultyId) {
        await client.query('ROLLBACK'); return { status: 409, body: { error: 'Une autorisation supplémentaire n’est pas nécessaire pour ce changement.' } }
      }
      if (facultyId && !(await client.query('SELECT id FROM academic_faculties WHERE id=$1 AND archived=FALSE', [facultyId])).rowCount) {
        await client.query('ROLLBACK'); return { status: 400, body: { error: 'Faculté inconnue.' } }
      }
      const result = await client.query(`INSERT INTO academic_faculty_change_requests(user_id,faculty_id,year_code,message)
        VALUES($1,$2,$3,$4) ON CONFLICT(user_id) WHERE status='pending' DO UPDATE SET faculty_id=EXCLUDED.faculty_id,year_code=EXCLUDED.year_code,message=EXCLUDED.message RETURNING id`, [userId, facultyId, yearCode, message])
      await client.query('COMMIT')
      return { status: 200, body: { ok: true, requestId: result.rows[0].id, status: 'pending' } }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  async function facultyChangeRequests() {
    return (await pool.query(`SELECT r.id,r.user_id AS "userId",f.display_name AS "facultyName",r.faculty_id AS "facultyId",r.year_code AS "yearCode",r.message,r.status,r.created_at AS "createdAt",p.faculty_change_count AS "changeCount",p.faculty_change_limit AS "changeLimit"
      FROM academic_faculty_change_requests r LEFT JOIN academic_faculties f ON f.id=r.faculty_id LEFT JOIN academic_profiles p ON p.user_id=r.user_id ORDER BY r.id DESC LIMIT 500`)).rows
  }
  async function reviewFacultyChange(requestId, adminId, decision) {
    if (!['approved','rejected'].includes(decision) || !/^\d+$/.test(String(requestId))) return { status: 400, body: { error: 'Décision invalide.' } }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const found = (await client.query('SELECT user_id FROM academic_faculty_change_requests WHERE id=$1', [requestId])).rows[0]
      if (!found) { await client.query('ROLLBACK'); return { status: 404, body: { error: 'Demande introuvable.' } } }
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [found.user_id])
      const row = (await client.query('SELECT * FROM academic_faculty_change_requests WHERE id=$1 FOR UPDATE', [requestId])).rows[0]
      if (row.status !== 'pending') { await client.query('ROLLBACK'); return { status: 409, body: { error: 'Cette demande a déjà été traitée.' } } }
      if (decision === 'approved') await client.query('UPDATE academic_profiles SET faculty_change_limit=faculty_change_limit+1,updated_at=NOW() WHERE user_id=$1', [found.user_id])
      await client.query('UPDATE academic_faculty_change_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1', [requestId, decision, adminId])
      await client.query('COMMIT')
      return { status: 200, body: { ok: true } }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  return { init, state, coverage, resources, save, analytics, requestAvailability, requestFacultyChange, facultyChangeRequests, reviewFacultyChange,
    async availabilityRequests() {
      return (await pool.query(`SELECT r.id,r.faculty_id AS "facultyId",f.display_name AS "facultyName",
        r.year_code AS "yearCode",r.academic_term AS "academicTerm",r.message,r.created_at AS "createdAt"
        FROM academic_availability_requests r JOIN academic_faculties f ON f.id=r.faculty_id ORDER BY r.created_at DESC LIMIT 500`)).rows
    },
    async listFaculties(query = '', yearCode = null) {
      const needle = fold(query.trim())
      const { rows } = await pool.query(`SELECT f.id,f.display_name AS name,
        f.registry_status AS "registryStatus",COALESCE(array_agg(a.alias) FILTER(WHERE a.alias IS NOT NULL),'{}') AS aliases
        FROM academic_faculties f LEFT JOIN academic_faculty_aliases a ON a.faculty_id=f.id
        WHERE f.archived=FALSE GROUP BY f.id ORDER BY f.display_name`)
      return rows.filter(row => fold(row.name).includes(needle) || row.aliases.some(alias => fold(alias).includes(needle)))
        .slice(0, 50).map(row => ({ id: row.id, name: row.name, registryStatus: row.registryStatus,
          coverage: ACTIVE_YEARS.includes(yearCode) ? academicCoverageFor(row.id, yearCode) : null, academicTerm: '2026-2027' }))
    },
  }
}
