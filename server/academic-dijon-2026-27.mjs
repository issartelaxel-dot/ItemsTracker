// Université Bourgogne Europe, offre de formation 2026-2027. Les UE sont
// transcrites des tableaux du programme officiel ; aucun lien item/UE n'y est
// inféré à partir du seul intitulé de l'enseignement.
import { readFileSync } from 'node:fs'
const sourcedItemLinks = JSON.parse(readFileSync(new URL('./data/academic-dijon-ue-item-links-2026-27.json', import.meta.url), 'utf8'))
const dfgsm = 'https://formations.ube.fr/plugins/odf-web/odf/_content/program-diplome-de-formation-generale-en-sciences-medicales-dfgsm-2-2/pdf/Dipl%C3%B4me%20de%20formation%20g%C3%A9n%C3%A9rale%20en%20sciences%20m%C3%A9dicales%20%28DFGSM%29.pdf'
const dfasm = 'https://formations.ube.fr/plugins/odf-web/odf/_content/program-diplome-de-formation-approfondie-en-sciences-medicales-dfasm-2-2/pdf/Dipl%C3%B4me%20de%20formation%20approfondie%20en%20sciences%20m%C3%A9dicales%20%28DFASM%29.pdf'

const unit = (code, label, page, kind = 'obligatoire', slot = '') => ({
  code, label, page, kind, slot, itemNumbers: [], itemReferences: [],
})
const program = (yearCode, sourceUrl, units) => ({
  facultyId: 'dijon', yearCode, academicTerm: '2026-2027', sourceUrl,
  sourcePages: [...new Set(units.map(entry => entry.page))],
  reviewStatus: 'extracted_needs_review', units,
})

// Le programme réimprime le même choix d'UE aux deux semestres de chaque
// année. On présente chaque choix une seule fois, avec son groupe de choix.
const dfgsmResearch = [
  ['Métabolisme des lipoprotéines : des fondements biochimiques à la physiopathologie', 3],
  ['Hématopoïèse normale et tumorale', 3],
  ['Imagerie fonctionnelle et moléculaire', 3],
  ['Oncogenèse, histogenèse et différenciation', 3],
  ['Physiopathologie des maladies transmissibles', 3],
  ['Conception et structure des molécules d’intérêt thérapeutique', 3],
  ['Développement du médicament : mise en forme et évaluation pharmacologique', 3],
  ['Gestion et analyse des risques environnementaux', 3],
  ['Maladies du SNC : modèles animaux, physiopathologie et stratégies thérapeutiques', 3],
  ['Outils et technologies appliqués à la recherche thérapeutique', 3],
  ['Nanobiosciences et nanobiotechnologies', 3],
  ['Chimie extractive et structurale des composés naturels végétaux', 4],
  ['Enjeux de la décarbonisation en santé', 4],
  ['Morphologie : anatomie, tissus et fonctions, imagerie', 4],
  ['Physiopathologies cardiométaboliques', 4],
]
const dfgsmOptions = [
  ['Adaptation physiologique et comportementale', 4],
  ['Anglais oral consultation', 4], ['Anglais mobilité', 4],
  ["Application de l’intelligence artificielle", 4], ['Génétique humaine', 4],
  ["L’enfant", 4], ['Histoire de la médecine et de la pharmacie', 4],
  ['Principes de biologie moléculaire en pratique médicale', 4],
  ['Enjeux énergie, climat, santé', 4],
  ['Dépistage et prise en charge des violences faites aux femmes', 4],
  ['UE libre Tutorat', 4],
  ['UE transversale : engagement culturel et solidaire des étudiants', 4],
  ['Humanités médicales', 4], ['Médecine, spiritualité et religions', 4],
]
const firstCycleOptions = (yearCode) => [
  ...dfgsmResearch.map(([label, y2Page]) => unit('', label, yearCode === 'Y2' ? y2Page : Number(y2Page) + 3, 'optionnelle', 'Recherche · choix S1/S2')),
  ...dfgsmOptions.map(([label, y2Page]) => unit('', label, yearCode === 'Y2' ? y2Page : Number(y2Page) + 3, 'optionnelle', 'Choix S1/S2')),
]

const mmOptions = [
  ['4', 'Santé en milieu militaire', 5, 'Bloc 1'],
  ['5', 'Réanimation médicale', 5, 'Bloc 1'],
  ['6', 'Activités physiques pour la santé et médecine du sport', 5, 'Bloc 1'],
  ['7', 'Psychologie et neurobiologie', 5, 'Bloc 1'],
  ['8', 'Maladies allergiques', 5, 'Bloc 1'],
  ['11', 'Relations humaines en médecine', 5, 'Blocs 1/2'],
  ['12', 'Apports et limites de l’analyse des tissus et cellules dans la prise en charge des maladies', 5, 'Bloc 1'],
  ['13', 'Analyse du mouvement physiologique et pathologique', 5, 'Bloc 1'],
  ['14', 'Conférences de préparation EDN', 5, 'Bloc 1'],
  ['3', 'Toxicologie aiguë', 6, 'Bloc 2'],
  ['8C', 'Explorations cardiovasculaires (ECG)', 6, 'Bloc 2'],
  ['2', 'Modèles expérimentaux et mécanismes physiologiques', 6, 'Bloc 3'],
  ['9', 'Examens complémentaires : pertinence médicale et stratégie diagnostique', 6, 'Bloc 3'],
  ['10', 'Pathologie de l’enfant', 6, 'Bloc 3'],
  ['', 'Oncogenèse et différenciation', 6, 'Bloc 3'],
]

export const dijonPrograms2026 = [
  program('Y2', dfgsm, [
    unit('1', 'Anglais', 3, 'obligatoire', 'S3'),
    unit('2', 'Bases moléculaires, cellulaires et tissulaires des traitements médicamenteux', 3, 'obligatoire', 'S3'),
    unit('3', 'Biopathie tissulaire, illustrations et moyens d’exploration', 3, 'obligatoire', 'S3'),
    unit('4', 'Appareil digestif', 3, 'obligatoire', 'S3'),
    unit('5', 'Appareil cardiovasculaire', 3, 'obligatoire', 'S3'),
    unit('6', 'Nutrition', 3, 'obligatoire', 'S3'),
    unit('7', 'Enseignement optionnel à choisir', 3, 'choix', 'S3'),
    unit('8', 'Anglais 2', 4, 'obligatoire', 'S4'),
    unit('9', 'Appareil locomoteur', 4, 'obligatoire', 'S4'),
    unit('10', 'Tissu sanguin et système immunitaire', 4, 'obligatoire', 'S4'),
    unit('11', 'De l’agent infectieux à l’hôte', 4, 'obligatoire', 'S4'),
    unit('12', 'Bases moléculaires et cellulaires des pathologies', 4, 'obligatoire', 'S4'),
    unit('13', 'Système neurosensoriel', 4, 'obligatoire', 'S4'),
    unit('14', 'Enseignement optionnel à choisir', 4, 'choix', 'S4'),
    unit('15', 'Séminaire handicap obligatoire', 5, 'obligatoire', 'S4'),
    unit('', 'Stage d’initiation aux soins infirmiers', 5, 'stage', 'S4'),
    ...firstCycleOptions('Y2'),
  ]),
  program('Y3', dfgsm, [
    unit('1', 'Anglais', 6, 'obligatoire', 'S5'),
    unit('2', 'Biostatistiques', 6, 'obligatoire', 'S5'),
    unit('3', 'Génétique médicale', 6, 'obligatoire', 'S5'),
    unit('4', 'Appareil respiratoire', 6, 'obligatoire', 'S5'),
    unit('5', 'Immunopathologie', 6, 'obligatoire', 'S5'),
    unit('6', 'Rein et voies urinaires', 6, 'obligatoire', 'S5'),
    unit('7', 'Enseignement optionnel à choisir', 6, 'choix', 'S5'),
    unit('15', 'Socle commun numérique en santé 1', 7, 'obligatoire', 'S5'),
    unit('17', 'Service sanitaire 1', 7, 'obligatoire', 'S5'),
    unit('8', 'Anglais 2', 7, 'obligatoire', 'S6'),
    unit('9', 'Santé Humanité Société', 7, 'obligatoire', 'S6'),
    unit('10', 'Sémiologie générale', 7, 'obligatoire', 'S6'),
    unit('11', 'Revêtement cutané', 7, 'obligatoire', 'S6'),
    unit('12', 'Hormonologie et reproduction', 7, 'obligatoire', 'S6'),
    unit('13', 'Tissu sanguin', 7, 'obligatoire', 'S6'),
    unit('14', 'Enseignement optionnel à choisir', 7, 'choix', 'S6'),
    unit('16', 'Socle commun numérique en santé 2', 8, 'obligatoire', 'S6'),
    unit('18', 'Service sanitaire 2', 8, 'obligatoire', 'S6'),
    ...firstCycleOptions('Y3'),
  ]),
  program('Y4', dfasm, [
    unit('4', 'Perception, système nerveux, dermatologie', 5, 'obligatoire', 'Bloc 1'),
    unit('11', 'Urgences médico-chirurgicales', 5, 'obligatoire', 'Bloc 1'),
    unit('5', 'Handicap, vieillissement, dépendance, douleur, soins palliatifs, accompagnement', 6, 'obligatoire', 'Bloc 2'),
    unit('8B', 'Circulation, néphrologie, urologie', 6, 'obligatoire', 'Bloc 2'),
    unit('14', 'Préparation à l’EDN', 6, 'obligatoire', 'Bloc 2'),
    unit('1', 'Apprentissage de l’exercice médical et de la coopération interprofessionnelle', 6, 'obligatoire', 'Bloc 3'),
    unit('7', 'Inflammation, immunopathologie, appareil respiratoire', 6, 'obligatoire', 'Bloc 3'),
    unit('2A', 'De la conception à la naissance, pathologie de la femme', 6, 'obligatoire', 'Bloc 3'),
    unit('', 'PIX', 6, 'obligatoire', 'Bloc 3'),
    unit('13', 'Stage hospitalier', 7, 'stage', 'Année'),
    unit('', 'Anglais médical', 7, 'obligatoire', 'Année'),
    unit('12', 'Initiation à la recherche (LCA)', 7, 'obligatoire', 'Année'),
    unit('15', 'Examen clinique objectif et structuré de pôle', 7, 'obligatoire', 'Année'),
    unit('', 'Gardes hospitalières', 7, 'stage', 'Année'),
    ...mmOptions.map(([code, label, page, slot]) => unit(code, label, page, 'optionnelle', slot)),
  ]),
  program('Y5', dfasm, [
    unit('6', 'Maladies transmissibles, risques sanitaires', 7, 'obligatoire', 'Bloc 1'),
    unit('3', 'Maturation, vulnérabilité, santé mentale, conduites addictives', 7, 'obligatoire', 'Bloc 1'),
    unit('9', 'Cancérologie, oncologie, hématologie', 7, 'obligatoire', 'Bloc 1'),
    unit('14', 'Préparation EDN', 7, 'obligatoire', 'Bloc 1'),
    unit('8A', 'Métabolisme, endocrinologie, hépato-gastro-entérologie', 7, 'obligatoire', 'Bloc 2'),
    unit('2B', 'Hérédité, enfant et adolescent', 7, 'obligatoire', 'Bloc 2'),
    unit('14', 'Préparation EDN', 8, 'obligatoire', 'Bloc 2'),
    unit('10', 'Bon usage du médicament et des thérapeutiques non médicamenteuses', 8, 'obligatoire', 'Bloc 3'),
    unit('14', 'Préparation EDN', 8, 'obligatoire', 'Bloc 3'),
    unit('', 'PIX', 8, 'obligatoire', 'Bloc 3'),
    unit('13', 'Stage hospitalier', 8, 'stage', 'Année'),
    unit('', 'Anglais médical', 8, 'obligatoire', 'Année'),
    unit('12', 'Initiation à la recherche', 8, 'obligatoire', 'Année'),
    unit('15', 'Examen clinique objectif et structuré', 8, 'obligatoire', 'Année'),
    unit('', 'Conférences optionnelles', 8, 'optionnelle', 'Année'),
    ...mmOptions.slice(0, 5).map(([code, label]) => unit(code, label, 7, 'optionnelle', 'Bloc 1')),
    unit('3', 'Toxicologie aiguë', 8, 'optionnelle', 'Bloc 2'),
    unit('2', 'Modèles expérimentaux et mécanismes physiologiques', 8, 'optionnelle', 'Bloc 3'),
    unit('9', 'Examens complémentaires : pertinence médicale et stratégie diagnostique', 8, 'optionnelle', 'Bloc 3'),
    unit('10', 'Pathologie de l’enfant', 8, 'optionnelle', 'Bloc 3'),
    unit('', 'Oncogenèse et différenciation', 8, 'optionnelle', 'Bloc 3'),
  ]),
  // Tableau DFA3 de l'offre 2026–2027, p. 9. Les UE optionnelles sont des
  // choix de parcours, pas des enseignements suivis par chaque étudiant.
  program('Y6', dfasm, [
    unit('', 'Séminaire « Pertinence des soins »', 9),
    unit('15', 'ECOS de pôle', 9),
    unit('17', 'Parcours Sciences humaines et sociales', 9),
    unit('13', 'Stage hospitalier · quatre stages', 9, 'stage'),
    unit('', 'ECOS facultaires', 9),
    unit('', 'Gardes hospitalières', 9, 'stage'),
    unit('16', 'Entraînement ECOS', 9, 'optionnelle', 'Points de parcours'),
    unit('', 'Oncogenèse et différenciation', 9, 'optionnelle', 'Points de parcours'),
    unit('3', 'Toxicologie aiguë', 9, 'optionnelle', 'Points de parcours'),
    unit('4', 'Santé en milieu militaire', 9, 'optionnelle', 'Points de parcours'),
    unit('5', 'Réanimation médicale', 9, 'optionnelle', 'Points de parcours'),
    unit('6', 'Activités physiques pour la santé et médecine du sport', 9, 'optionnelle', 'Points de parcours'),
  ]),
]

// Quatre fiches d'UE DFASM1 donnent elles-mêmes une liste d'items numérotés.
// Chaque lien conserve l'URL de la fiche, distincte du PDF de la maquette.
for (const link of sourcedItemLinks) {
  const program = dijonPrograms2026.find(entry => entry.yearCode === link.yearCode)
  const unitEntry = program?.units.find(entry => entry.code === link.unitCode && entry.kind === 'obligatoire')
  if (!unitEntry) throw new Error(`UE de Dijon introuvable pour les items : ${link.yearCode} ${link.unitCode}`)
  // Keep the curriculum PDF on the unit; the HTML syllabus is evidence for
  // its item associations and has no PDF page fragment.
  unitEntry.itemNumbers = link.itemNumbers
  unitEntry.itemReferences = link.itemNumbers.map(number => ({ number, page: null, sourceUrl: link.sourceUrl }))
}
