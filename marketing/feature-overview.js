'use strict';
(() => {
  const root=document.querySelector('#fonctionnalites');
  const checks=[...root.querySelectorAll('.overview-read-row input')];
  checks.forEach(input=>input.addEventListener('change',()=>{
    const count=10+checks.filter(check=>check.checked).length;
    root.querySelector('[data-overview-count]').textContent=`${count} / 24 lectures`;
    root.querySelector('.overview-read-progress span').style.width=`${count/24*100}%`;
  }));
  const flip=root.querySelector('.overview-flip-button');
  flip.addEventListener('click',()=>{
    const answer=flip.getAttribute('aria-pressed')!=='true';
    flip.setAttribute('aria-pressed',String(answer));
    flip.setAttribute('aria-label',answer?'Réponse : Échocardiographie transthoracique avec Doppler. Cliquez pour revoir la question.':'Votre flashcard. Cliquez pour retourner et afficher la réponse.');
    flip.querySelector('.overview-flip-front').setAttribute('aria-hidden',String(answer));
    flip.querySelector('.overview-flip-back').setAttribute('aria-hidden',String(!answer));
  });
  root.querySelectorAll('.overview-reference-row').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('.overview-reference-row').forEach(row=>{const selected=row===button;row.classList.toggle('is-active',selected);row.setAttribute('aria-pressed',String(selected));});
    root.querySelector('.overview-reference-status').textContent=button.dataset.overviewReference;
  }));
  root.querySelectorAll('.overview-calendar-grid button').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('.overview-calendar-grid button').forEach(day=>day.setAttribute('aria-pressed',String(day===button)));
    root.querySelector('[data-overview-date]').textContent=`Révision le ${button.textContent} oct.`;
  }));
  const toggle=root.querySelector('.overview-calendar-toggle');
  toggle.addEventListener('click',()=>{
    const enabled=toggle.getAttribute('aria-pressed')!=='true';
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.setAttribute('aria-label',enabled?'Désactiver le rappel de cet exemple':'Activer le rappel de cet exemple');
    root.querySelector('[data-overview-reminder]').textContent=enabled?'19:00 · rappel activé':'19:00 · sans rappel';
  });

})();
(() => {
  const root=document.querySelector('#fonctionnalites');
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-in-view',entry.isIntersecting)),{threshold:.15});
  root.querySelectorAll('.overview-card').forEach(card=>observer.observe(card));
  document.addEventListener('visibilitychange',()=>root.classList.toggle('is-background',document.hidden));
})();
