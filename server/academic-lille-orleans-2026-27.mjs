// Sources officielles du millésime 2026–2027. Les intitulés de disciplines
// n'établissent aucune correspondance avec les items ou collèges LiSA.
const lilleRules = 'https://ufr3s.univ-lille.fr/fileufr3s/user_upload/ufr3s-formations/medecine-scolarite/examens/generalites/2026-27_reglement-des-etudes_MED2-MED6.pdf'
const orleansRules = 'https://www.univ-orleans.fr/upload/public/2026-09/2026-27_MED_SCOL_M3C_DFASM_VF_CFVU_210926.pdf'

function program(facultyId, yearCode, sourceUrl, rows, reviewStatus = 'extracted_needs_review') {
  return {
    facultyId, yearCode, sourceUrl, academicTerm: '2026-2027', reviewStatus,
    sourcePages: [...new Set(rows.map(([, page]) => page))],
    units: rows.map(([label, page, kind = 'obligatoire', slot]) => ({
      code: '', label, page, kind, ...(slot ? { slot } : {}), itemNumbers: [], itemReferences: [],
    })),
  }
}

export const lilleOrleansPrograms2026 = [
  program('lille', 'Y4', lilleRules, [
    ['Endocrinologie–Nutrition', 66, 'obligatoire', 'Première période'],
    ['Gynécologie–Obstétrique', 66, 'obligatoire', 'Première période'],
    ['Neurologie–Neurochirurgie', 66, 'obligatoire', 'Première période'],
    ['Pneumologie–Chirurgie thoracique', 66, 'obligatoire', 'Deuxième période'],
    ['Gastro-entérologie–Chirurgie digestive', 66, 'obligatoire', 'Deuxième période'],
    ['Maladies infectieuses–Santé publique', 66, 'obligatoire', 'Deuxième période'],
    ['Pédiatrie', 66, 'obligatoire', 'Deuxième période'],
    ['Séméiologie', 66],
    ['Lecture critique d’article', 66],
    ['ECOS facultaires MED4', 67],
    ['Stages hospitaliers', 69, 'stage'],
    ['Gardes hospitalières', 69, 'stage'],
    ['Modules préparatoires aux stages · PRESAGE', 70],
    ['Radioprotection', 72],
  ], 'draft_pending_vote'),
  program('lille', 'Y5', lilleRules, [
    ['ORL–Ophtalmologie–Stomatologie', 75, 'obligatoire', 'Première période'],
    ['Douleur–Soins palliatifs–Anesthésie–Défaillances viscérales aiguës', 75, 'obligatoire', 'Première période'],
    ['Médecine interne–Vieillissement–Handicap', 75, 'obligatoire', 'Première période'],
    ['Cancérologie', 75, 'obligatoire', 'Première période'],
    ['Dermatologie–Hématologie', 75, 'obligatoire', 'Deuxième et troisième périodes'],
    ['Psychiatrie–Addictologie–Pédopsychiatrie', 75, 'obligatoire', 'Deuxième et troisième périodes'],
    ['Médecine légale–Médecine générale–Médecine du travail', 75, 'obligatoire', 'Deuxième et troisième périodes'],
    ['Séméiologie', 75],
    ['Lecture critique d’article', 75],
    ['ECOS facultaires MED5', 75],
    ['Stages hospitaliers', 78, 'stage'],
    ['Gardes hospitalières', 78, 'stage'],
    ['Modules préparatoires aux stages · PRESAGE', 79],
  ], 'draft_pending_vote'),
  // Les M3C décrivent des obligations de DFASM3, mais leur annexe n'en donne
  // aucune liste d'UE propre à cette année : cette entrée reste partielle.
  program('orleans', 'Y6', orleansRules, [
    ['ECOS facultaires DFASM3', 2],
    ['Stages hospitaliers DFASM3', 3, 'stage'],
    ['Gardes du second cycle', 3, 'stage'],
  ], 'partial_confirmed'),
]
