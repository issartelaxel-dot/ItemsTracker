(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const logos=[...document.querySelectorAll('.site-header .brand>.logo,.site-footer .brand>.logo')];
 const controllers=logos.map(logo=>{
  logo.classList.add('brand-motion');
  const link=logo.closest('.brand');
  let timer=0;
  function measure(){
   const size=logo.getBoundingClientRect();
   const capsule=getComputedStyle(logo,'::after');
   const top=parseFloat(capsule.top),height=parseFloat(capsule.height);
   const drop=Math.max(0,Math.min(size.height*20/44,size.height-top-height-3));
   logo.style.setProperty('--brand-drop',`${drop}px`);
   return {size,centerY:top+height/2,drop};
  }
  function reset(){clearTimeout(timer);logo.classList.remove('is-brand-greeting');logo.style.setProperty('--brand-bar-y','0px');}
  function greet(){
   reset();if(reduced.matches||document.hidden)return;
   measure();void logo.offsetWidth;logo.classList.add('is-brand-greeting');
   timer=setTimeout(()=>logo.classList.remove('is-brand-greeting'),1100);
  }
  logo.addEventListener('pointermove',event=>{
   if(event.pointerType!=='mouse'||reduced.matches)return;
   clearTimeout(timer);logo.classList.remove('is-brand-greeting');
   const {size,centerY,drop}=measure();
   const near=Math.hypot(event.clientX-size.left-size.width/2,event.clientY-size.top-centerY)<=size.width*18/44;
   logo.style.setProperty('--brand-bar-y',`${near?drop:0}px`);
  });
  logo.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')reset();});
  logo.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')greet();});
  link.addEventListener('focus',()=>{if(link.matches(':focus-visible'))greet();});
  link.addEventListener('blur',reset);
  return {logo,reset,greet};
 });
 const header=controllers.find(c=>c.logo.closest('.site-header'));
 let intro=0;
 if(header&&!reduced.matches)intro=setTimeout(()=>header.greet(),250);
 reduced.addEventListener('change',()=>{clearTimeout(intro);controllers.forEach(c=>c.reset());});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(intro);controllers.forEach(c=>c.reset());}});
})();
