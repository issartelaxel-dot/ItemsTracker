// Transcription des six MCC 2026–2027 de la faculté Montpellier–Nîmes.
// Les deux sites ont des codes d'UE distincts ; aucun item LiSA n'est déduit du titre.
const sourcePage = 'https://facmedecine.umontpellier.fr/2e-cycle-dfasm/'
const pdfBase = 'https://facmedecine.umontpellier.fr/wp-content/uploads/2026/10/mcc-2026-2027-DE-DOCTEUR-EN-MEDECINE-Sans-Objet-Pas-de-parcours-type-DFA-Sciences-Me-'
const pdf = (site, year) => `${pdfBase}${site === 'Montpellier' ? 'M' : 'N'}ADA${year}M-500.pdf`

// label, code Montpellier, code Nîmes, page Montpellier, page Nîmes, kind, semester.
const rows = {
  Y4: [
    ['Cardiologie – Pneumologie – Médecine vasculaire', 'M0MJ3B5L', 'M0MJ6L3K', 2, 2, '', 'S1'],
    ['Hématologie – Endocrinologie', 'M0MJ4L4E', 'M0MJ706A', 2, 2, '', 'S1'],
    ['Hépato-gastro-entérologie – Dermatologie', 'M0MJ5IOC', 'M0MJ7DH0', 2, 2, '', 'S1'],
    ['Lecture critique d’article, niveau 2', 'M0NN93UF', 'M0NN9LLQ', 2, 2, '', 'S1'],
    ['Certificat de compétences cliniques ECOS 1', 'M0NNAAOG', 'M0NNAMLJ', 3, 3, '', 'S1'],
    ['Anglais', 'M0NNBE75', 'M0NNB2YT', 3, 3, '', 'S1'],
    ['AFGSU', 'M0NNBRKA', 'M0NNC2W6', 3, 3, '', 'S1'],
    ['Savoir-être', 'M0NNCY78', 'M0NNCLUY', 3, 3, '', 'S1'],
    ['UE libre', 'MA1S1LIB', 'NA1S1LIB', 2, 2, 'optionnelle', 'S1'],
    ['Stage de médecine spécialisée', 'MA1S1SMS', 'NA1S1SMS', 2, 2, 'stage', 'S1'],
    ['Choix de stage chirurgie ou médecine générale', 'MA1S1SCX', 'NA1S1SCX', 2, 2, 'choix', 'S1'],
    ['Néphrologie – Addictologie – Rhumatologie', 'M0NL13P1', 'M0NL2ORK', 4, 4, '', 'S2'],
    ['ORL – Chirurgie maxillo-faciale – Psychiatrie – Ophtalmologie', 'M0NL1N3F', 'M0NL33QE', 4, 4, '', 'S2'],
    ['Neurologie – Neurochirurgie – Anesthésie – Algologie', 'M0NL24QI', 'M0NL3I8O', 4, 4, '', 'S2'],
    ['Lecture critique d’article, niveau 2', 'M0NN1VC9', 'M0NN2DV5', 4, 4, '', 'S2'],
    ['Certificat de compétences cliniques ECOS 1', 'M0NN3EN0', 'M0NN3QU8', 5, 5, '', 'S2'],
    ['Anglais', 'M0NN49IS', 'M0NN4K9Q', 5, 5, '', 'S2'],
    ['AFGSU', 'M0NN5UI5', 'M0NN6AVB', 5, 5, '', 'S2'],
    ['Savoir-être', 'M0NN6TEC', 'M0NN7ATO', 5, 5, '', 'S2'],
    ['UE libre', 'MA1S2LIB', 'NA1S2LIB', 4, 4, 'optionnelle', 'S2'],
    ['Stage de médecine spécialisée', 'MA1S2SMS', 'NA1S2SMS', 4, 4, 'stage', 'S2'],
    ['Choix de stage chirurgie ou médecine générale', 'MA1S2SCX', 'NA1S2SCX', 4, 4, 'choix', 'S2'],
  ],
  Y5: [
    ['Médecine interne – Immunologie – Urgences-réanimation', 'M0NPM1HL', 'M0NPMGEM', 2, 2, '', 'S1'],
    ['Infectiologie – Gérontologie', 'M0NPN7EL', 'M0NPMVCK', 2, 2, '', 'S1'],
    ['Thérapeutique – Santé publique – Médecine légale – Médecine du travail', 'M0NPNMB9', 'M0NPNWOF', 2, 2, '', 'S1'],
    ['Lecture critique d’article, niveau 3', 'M0NWTSHK', 'M0NWUQKP', 2, 2, '', 'S1'],
    ['Certificat de compétences cliniques ECOS 2', 'M0NXWDEX', 'M0NXXKQL', 3, 2, '', 'S1'],
    ['UE libre', 'MA2LIB3', 'NA2LIB3', 2, 2, 'optionnelle', 'S1'],
    ['Stages', 'MA2S1STA', 'NA2S1STA', 2, 2, 'stage', 'S1'],
    ['Gynécologie-obstétrique – Cancérologie – Génétique', 'M0NVAIR2', 'M0NVBDAI', 4, 3, '', 'S2'],
    ['Pédiatrie', 'M0NVDJ55', 'M0NVE1MW', 4, 3, '', 'S2'],
    ['Pédopsychiatrie – MPR – Soins palliatifs', 'M0NVFQFB', 'M0NVEXZT', 4, 3, '', 'S2'],
    ['Lecture critique d’article, niveau 3', 'M0NWU83S', 'M0NWV77I', 4, 3, '', 'S2'],
    ['Certificat de compétences cliniques ECOS 2', 'M0NXX2C8', 'M0NXY7RH', 5, 3, '', 'S2'],
    ['UE libre', 'MA2LIB4', 'NA2LIB4', 4, 3, 'optionnelle', 'S2'],
    ['Stages', 'MA2S2STA', 'NA2S2STA', 4, 3, 'stage', 'S2'],
  ],
  Y6: [
    ['Sciences humaines et sociales', 'M0NYG8E3', 'M0NZ9IV8', 4, 4, '', 'Année'],
    ['Stage 1', 'M0NYCEQO', 'M0NYVYE1', 5, 5, 'stage', 'Année'],
    ['Stage 2', 'M0NYCWN1', 'M0NYWB2G', 5, 5, 'stage', 'Année'],
    ['Stage 3', 'M0NYD8PY', 'M0NYWMNX', 5, 5, 'stage', 'Année'],
    ['Gardes', 'M0NYDKOP', 'M0NYX56U', 5, 5, 'stage', 'Année'],
    ['Savoir-être', 'M0NYJVM1', 'M0NYY6JD', 6, 6, '', 'Année'],
    ['Enseignements obligatoires', 'M0NYL02L', 'M0NYZ0IW', 7, 7, '', 'Année'],
    ['ECOS', 'M0NYMB32', 'M0NZ00EL', 8, 8, '', 'Année'],
    ['Prescription médicamenteuse', 'MDEN6Q4S', 'MDENBHO1', 9, 9, '', 'Année'],
  ],
}

export const montpellierNimesPrograms2026 = Object.entries(rows).map(([yearCode, entries]) => ({
  facultyId: 'montpellier-nimes', yearCode, academicTerm: '2026-2027',
  sourceUrl: sourcePage, sourcePages: [], reviewStatus: 'extracted_needs_review',
  units: entries.flatMap(([label, codeMontpellier, codeNimes, pageMontpellier, pageNimes, kind, slot]) =>
    [['Montpellier', codeMontpellier, pageMontpellier], ['Nîmes', codeNimes, pageNimes]].map(([site, code, page]) => ({
      code, label, page, site, slot, ...(kind ? { kind } : {}),
      sourceUrl: pdf(site, Number(yearCode.slice(1)) - 3), itemNumbers: [], itemReferences: [],
    }))),
}))
