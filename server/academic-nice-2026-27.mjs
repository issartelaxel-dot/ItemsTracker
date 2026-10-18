// Transcription des MCC officielles 2026–2027 de la faculté de médecine de Nice.
// Les UE locales ne constituent pas, à elles seules, des associations aux items EDN.
const m1 = 'https://medecine.univ-cotedazur.fr/medias/fichier/mcc-m1-2026-2027v2_1789633636320-pdf'
const m2 = 'https://medecine.univ-cotedazur.fr/medias/fichier/m2-mcc_1789633704963-pdf'
const m3 = 'https://medecine.univ-cotedazur.fr/medias/fichier/m3-mcc-cours-obligatoires_1789634230935-pdf'

function program(yearCode, sourceUrl, units) {
  return {
    facultyId: 'nice', yearCode, academicTerm: '2026-2027', sourceUrl,
    sourcePages: [...new Set(units.map(unit => unit[1]))],
    reviewStatus: 'extracted_needs_review',
    units: units.map(([label, page, kind = 'obligatoire', semester = null]) => ({
      code: '', label, page, kind, semester, itemNumbers: [], itemReferences: [],
    })),
  }
}

export const nicePrograms2026 = [
  program('Y4', m1, [
    ['Dermatologie et revêtement cutané', 3, 'obligatoire', 1],
    ['Médecine interne', 3, 'obligatoire', 1],
    ['Immunopathologie et immuno-intervention', 3, 'obligatoire', 1],
    ['Hématologie et tissu sanguin', 3, 'obligatoire', 1],
    ['Endocrinologie, diabétologie, hormonologie et reproduction', 3, 'obligatoire', 1],
    ['Génétique médicale', 3, 'obligatoire', 1],
    ['Stages hospitaliers', 3, 'stage', 1],
    ['Médecine générale', 3, 'obligatoire', 2],
    ['Anatomie et cytologie pathologiques', 3, 'obligatoire', 2],
    ['Oncologie', 3, 'obligatoire', 2],
    ['Douleur et soins palliatifs', 3, 'obligatoire', 2],
    ['Thérapeutique', 3, 'obligatoire', 2],
    ['Santé numérique', 3, 'obligatoire', 2],
    ['Lecture critique d’article (LCA)', 3, 'obligatoire', 2],
    ['Anglais', 3, 'obligatoire', 2],
    ['Compétences relationnelles et éthique', 3, 'obligatoire', 2],
    ['Stages hospitaliers', 3, 'stage', 2],
    ['Service sanitaire', 1, 'obligatoire'],
    ['AFGSU niveau 2', 1, 'obligatoire'],
    ['UE Engagement pédagogique 3', 3, 'optionnelle'],
  ]),
  program('Y5', m2, [
    ['Gériatrie', 1, 'obligatoire', 1],
    ['Thérapeutique, pharmacologie et médecine intégrative', 1, 'obligatoire', 1],
    ['Microbiologie', 1, 'obligatoire', 1],
    ['Infectiologie', 1, 'obligatoire', 1],
    ['Urgences et réanimation', 1, 'obligatoire', 1],
    ['Médecine légale', 1, 'obligatoire', 1],
    ['Médecine du travail', 1, 'obligatoire', 1],
    ['Santé publique', 1, 'obligatoire', 1],
    ['Stages hospitaliers', 3, 'stage', 1],
    ['Révisions et entraînement EDN', 3, 'obligatoire', 2],
    ['Lecture critique d’article (LCA)', 3, 'obligatoire', 2],
    ['Stages hospitaliers', 3, 'stage', 2],
    ['Parcours Engagement pédagogique', 4, 'optionnelle'],
  ]),
  program('Y6', m3, [
    ['Professionnalisation', 1],
    ['Compétences relationnelles', 1],
    ['Stages hospitaliers', 1, 'stage'],
    ['Certificat de compétences cliniques (ECOS)', 1, 'evaluation'],
    ['Séminaire pluriprofessionnel de soins palliatifs', 1, 'optionnelle'],
  ]),
]
