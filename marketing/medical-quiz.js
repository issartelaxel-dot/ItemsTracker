'use strict';
(() => {
  const cnec='https://www.sfcardio.fr/publication/chapitre-08-item-233-valvulopathies/';
  const campus='https://archives.uness.fr/sites/campus-unf3s-2015/UNF3Smiroir/campus-numeriques/cardiologie-et-maladies-vasculaires/enseignement/cardio_281/site/html/';
  const questions=[
    {topic:'Auscultation',question:'Un patient présente un souffle systolique éjectionnel au foyer aortique, irradiant aux carotides. Quelle valvulopathie évoquez-vous ?',choices:['Insuffisance mitrale','Rétrécissement aortique','Insuffisance aortique','Rétrécissement mitral'],correct:1,explanation:'Ce souffle évoque un obstacle à l’éjection du ventricule gauche au niveau de la valve aortique.',source:cnec,image:true},
    {topic:'Diagnostic',question:'Quel examen confirme et évalue en première intention un rétrécissement aortique suspecté à l’auscultation ?',choices:['Électrocardiogramme seul','Radiographie thoracique','Échocardiographie transthoracique avec Doppler','Coronarographie systématique'],correct:2,explanation:'L’échographie-Doppler examine la valve, mesure les vitesses et le gradient, et estime la surface de son ouverture.',source:cnec},
    {topic:'Signes fonctionnels',question:'Quels symptômes à l’effort sont classiquement recherchés dans un rétrécissement aortique ?',choices:['Dyspnée, angor et syncope','Fièvre, frissons et arthralgies','Toux, expectoration et hémoptysie','Céphalées, acouphènes et épistaxis'],correct:0,explanation:'L’essoufflement, la douleur thoracique et la perte de connaissance à l’effort constituent les trois symptômes classiques.',source:cnec},
    {topic:'Physiopathologie',question:'Quelle adaptation du ventricule gauche est favorisée par l’obstacle chronique à l’éjection dans un rétrécissement aortique ?',choices:['Diminution de la postcharge','Hypertrophie concentrique','Disparition de la pression systolique','Dilatation isolée du ventricule droit'],correct:1,explanation:'Le ventricule doit développer davantage de pression. L’épaississement de sa paroi peut compenser cette surcharge.',source:campus+'3.html'},
    {topic:'Étiologie',question:'Chez un patient de 80 ans, quelle est la cause la plus fréquente d’un rétrécissement aortique ?',choices:['Une unicuspidie congénitale','Un rhumatisme articulaire aigu récent','Une dégénérescence calcifiante de la valve','Une rupture de cordage mitral'],correct:2,explanation:'Chez le sujet âgé, la calcification dégénérative des feuillets valvulaires est l’étiologie habituelle.',source:campus+'2.html'}
  ];
  const root=document.querySelector('#medical-quiz'),panel=document.querySelector('#panel-cards');
  let deck=[...questions],index=0,results=[],selected=null,answered=false,started=null,elapsed=0,review=false;
  const icon=id=>`<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const timeLabel=ms=>{const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
  function startClock(){if(started===null&&!panel.hidden&&!root.hidden)started=Date.now();}
  new MutationObserver(startClock).observe(panel,{attributes:true,attributeFilter:['hidden']});
  function reset(newDeck=questions,errorReview=false){
    deck=[...newDeck];index=0;results=[];selected=null;answered=false;started=null;elapsed=0;review=errorReview;
    root.hidden=false;
    document.querySelector('.quiz-source-note').hidden=false;
    document.querySelector('#panel-cards .panel-intro h3').textContent='Testez vos connaissances.';
    document.querySelector('#panel-cards .panel-intro p').textContent=errorReview ? `Item 233 · Valvulopathies — Reprenez vos ${deck.length} question${deck.length>1?'s':''} à revoir.` : 'Item 233 · Valvulopathies — 5 questions, une seule réponse correcte par question.';
    startClock();render();
  }
  function render(){
    const q=deck[index];
    root.innerHTML=`<div class="quiz-context"><span>ITEM 233 · VALVULOPATHIES / DFASM1</span><span>${review?'REPRISE DES ERREURS':'QUIZ'} · ${index+1} / ${deck.length}</span></div><div class="quiz-progress" role="progressbar" aria-label="Questions validées" aria-valuemin="0" aria-valuemax="${deck.length}" aria-valuenow="${index}"><span style="width:${index/deck.length*100}%"></span></div><form class="medical-question-form"><fieldset><legend tabindex="-1">${q.question}</legend><p class="quiz-answer-help">Une seule réponse correcte.</p><div class="quiz-choices">${q.choices.map((choice,i)=>`<label class="quiz-choice"><input type="radio" name="medical-choice" value="${i}"><span class="quiz-choice-letter" aria-hidden="true">${'ABCD'[i]}</span><span>${choice}</span><span class="quiz-choice-result"></span></label>`).join('')}</div></fieldset><div class="quiz-correction" hidden></div><button class="button button-blue full quiz-submit" type="submit" disabled>Valider ma réponse ${icon('check')}</button><button class="button button-blue full quiz-next" type="button" hidden>${index===deck.length-1?'Voir mon bilan':'Question suivante'} ${icon('arrow')}</button><p class="quiz-live visually-hidden" role="status"></p></form>`;
    const form=root.querySelector('form');
    form.addEventListener('change',event=>{if(answered||event.target.name!=='medical-choice')return;startClock();selected=Number(event.target.value);root.querySelector('.quiz-submit').disabled=false;});
    form.addEventListener('submit',event=>{
      event.preventDefault();if(answered||selected===null)return;answered=true;const correct=selected===q.correct;results.push({q,correct});root.querySelector('.quiz-progress').setAttribute('aria-valuenow',String(index+1));root.querySelector('.quiz-progress span').style.width=`${(index+1)/deck.length*100}%`;
      root.querySelectorAll('.quiz-choice').forEach((label,i)=>{label.querySelector('input').disabled=true;if(i===q.correct){label.classList.add('is-correct');label.querySelector('.quiz-choice-result').textContent='Réponse correcte';}else if(i===selected){label.classList.add('is-wrong');label.querySelector('.quiz-choice-result').textContent='Votre réponse';}});
      const correction=root.querySelector('.quiz-correction');correction.hidden=false;correction.classList.toggle('is-wrong',!correct);
      correction.innerHTML=`<strong>${correct?'Bonne réponse !':'Réponse incorrecte'}</strong><p>Réponse attendue : ${q.choices[q.correct]}.</p><p>${q.explanation}</p>${q.image?`<button class="quiz-medical-image" type="button" aria-haspopup="dialog" aria-controls="medical-image-dialog" aria-label="Agrandir le schéma du souffle"><img src="assets/souffle-aortique.svg" alt="Souffle systolique crescendo–decrescendo entre B1 et B2." width="640" height="440"><span>Agrandir le schéma ${icon('plus')}</span></button>`:''}<a href="${q.source}" target="_blank" rel="noopener">Lire la référence médicale ${icon('arrow')}</a>`;
      correction.querySelector('.quiz-medical-image')?.addEventListener('click',()=>document.querySelector('#medical-image-dialog').showModal());
      root.querySelector('.quiz-submit').hidden=true;root.querySelector('.quiz-next').hidden=false;
      root.querySelector('.quiz-live').textContent=correct?'Bonne réponse. Vous pouvez passer à la suite.':`Réponse incorrecte. Réponse attendue : ${q.choices[q.correct]}.`;
      root.querySelector('.quiz-next').focus();
    });
    root.querySelector('.quiz-next').addEventListener('click',()=>{if(!answered)return;index++;selected=null;answered=false;if(index===deck.length){elapsed=started===null?0:Date.now()-started;summary();}else{render();root.querySelector('legend').focus();}});
  }
  function summary(){
    const count=results.filter(r=>r.correct).length,score=Math.round(count/results.length*100),errors=results.filter(r=>!r.correct);
    const title=score>=90?'Excellent !':score>=70?'Bonne révision !':'À consolider';
    root.innerHTML=`<section class="demo-quiz-summary" aria-labelledby="quiz-summary-title"><button class="quiz-summary-quit text-button">Quitter</button><div class="demo-summary-top"><div class="demo-summary-score"><strong>${score}%</strong><h3 id="quiz-summary-title" tabindex="-1">${title}</h3><p>${count} réponse${count>1?'s':''} correcte${count>1?'s':''} sur ${results.length}.</p><small>Item 233 · Valvulopathies${review?' · Reprise des erreurs':''}</small></div><div class="demo-summary-metrics"><div>${icon('card')}<span>Précision</span><strong>${score}%</strong></div><div>${icon('reset')}<span>Temps</span><strong>${timeLabel(elapsed)}</strong></div><div>${icon('check')}<span>Série actuelle</span><strong>—</strong><small>Liée à votre compte</small></div></div></div><button class="demo-review-banner ${errors.length?'has-errors':'is-clear'}" ${errors.length?'':'disabled'}>${icon(errors.length?'card':'check')}<span><strong>${errors.length?'Notions à revoir':'Aucune notion à revoir'}</strong><small>${errors.length?`${errors.length} question${errors.length>1?'s':''} · ${errors.map(r=>r.q.topic).join(', ')}`:'Toutes les réponses de cette session sont correctes.'}</small></span>${errors.length?icon('arrow'):''}</button><div class="demo-summary-actions"><button class="button button-outline quiz-new">${icon('play')} Lancer un nouveau quiz ${icon('arrow')}</button><button class="button button-outline quiz-exit">${icon('home')} Retour à l’aperçu ${icon('arrow')}</button></div><p class="quiz-summary-note">Résultat de cette démo uniquement · aucune donnée envoyée à votre compte.</p></section>`;
    root.querySelector('.demo-review-banner').addEventListener('click',()=>{if(errors.length){reset(errors.map(r=>r.q),true);root.querySelector('legend').focus();}});
    root.querySelector('.quiz-new').addEventListener('click',()=>{reset();root.querySelector('legend').focus();});
    root.querySelectorAll('.quiz-exit,.quiz-summary-quit').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#tab-items').click();document.querySelector('#tab-items').focus();}));
    root.querySelector('#quiz-summary-title').focus();
  }
  window.ItemsQuiz={reset};reset();
})();
