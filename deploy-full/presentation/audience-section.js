(() => {
 const root=document.querySelector('.audience-cards');
 const toggle=root?.querySelector('.audience-medicine-toggle');
 if(!toggle)return;
 const years=document.getElementById('medicine-years');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let animations=[];
 reduced.addEventListener('change',()=>{if(reduced.matches)animations.forEach(a=>a.cancel());});
 function expand(open){
  animations.forEach(a=>a.cancel());animations=[];
  const cards=[...root.querySelectorAll('.audience-card')];
  const previous=cards.map(card=>card.getBoundingClientRect());
  root.classList.toggle('is-expanded',open);years.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Refermer le parcours en médecine':'Découvrir le parcours en médecine, de la prépa à la 4e année');
  if(reduced.matches)return;
  cards.forEach((card,i)=>{
   const next=card.getBoundingClientRect(),before=previous[i];
   animations.push(card.animate([{transform:`translate(${before.x-next.x}px,${before.y-next.y}px) scale(${before.width/next.width},${before.height/next.height})`},{transform:'none'}],{duration:520,easing:'cubic-bezier(.2,.75,.25,1)',fill:'none'}));
  });
  if(open)years.querySelectorAll('.medicine-year').forEach((card,i)=>animations.push(card.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:430,delay:120+i*55,easing:'cubic-bezier(.2,.75,.25,1)',fill:'backwards'})));
 }
 toggle.addEventListener('click',()=>expand(toggle.getAttribute('aria-expanded')!=='true'));
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){expand(false);toggle.focus();}});
})();
