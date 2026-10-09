(() => {
 const button=document.querySelector('.device-reveal');
 if(!button)return;
 button.addEventListener('click',()=>{
  const revealed=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(revealed));
  document.querySelector('.device-question').hidden=revealed;
  document.querySelector('.device-answer').hidden=!revealed;
  button.querySelector('span').textContent=revealed?'Revoir la question':'Afficher la réponse';
 });
})();
