'use strict';
(() => {
 const root=document.querySelector('.ai-preview');
 if(!root)return;
 let updateMotion=()=>{};
 const tabs=[...root.querySelectorAll('[role=tab]')];
 function selectTab(index){
  tabs.forEach((tab,i)=>{
   const selected=i===index;
   tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
   document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected;
  });
  updateMotion();
 }
 tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectTab(index));
  tab.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
   selectTab(next);tabs[next].focus();
  });
 });
 root.querySelectorAll('[data-ai-open]').forEach(button=>button.addEventListener('click',()=>{const index=button.dataset.aiOpen==='plan'?2:1;selectTab(index);tabs[index].focus();}));
 const categories=[{value:45,name:'À consolider',color:'#256df3'},{value:35,name:'À revoir',color:'#8962e8'},{value:20,name:'Régulier',color:'#20b6ca'}];
 function selectSegment(index){
  const category=categories[index];
  root.querySelectorAll('[data-ai-segment]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.aiSegment)===index)));
  const label=root.querySelector('.ai-donut-label');
  label.querySelector('strong').firstChild.nodeValue=String(category.value);
  label.querySelector(':scope>span').textContent=category.name;
  label.style.color=category.color;
 }
 root.querySelectorAll('[data-ai-segment]').forEach(node=>{
  node.addEventListener('click',()=>selectSegment(Number(node.dataset.aiSegment)));
  if(node.tagName.toLowerCase()==='circle')node.addEventListener('keydown',event=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();selectSegment(Number(node.dataset.aiSegment));}
  });
 });
 const sessions=[...root.querySelectorAll('.ai-plan-row')];
 sessions.forEach((button,index)=>button.addEventListener('click',()=>{
  const done=button.getAttribute('aria-pressed')!=='true';
  button.setAttribute('aria-pressed',String(done));
  button.setAttribute('aria-label',`${done?'Décocher':'Cocher'} le jour ${[1,3,7][index]} dans le plan fictif`);
  root.querySelector('#ai-plan-count').textContent=`${sessions.filter(b=>b.getAttribute('aria-pressed')==='true').length} / 3`;
 }));
 // Automatic illustration; elapsed time stops off screen or during interaction.
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const progress=root.querySelector('.ai-global-progress p>strong');
 const flashcards=root.querySelector('.ai-mini-flashcards>strong');
 const rings=[...root.querySelectorAll('.ai-ring')];
 const bars=[...root.querySelectorAll('.ai-spark-bars i')];
 let visible=false,hovered=false,focused=false,frame=0,lastTime=null,elapsed=0;
 const ease=t=>t*t*(3-2*t);
 function render(time,complete=false){
  const phase=time%11000;
  const ratio=complete?1:phase<2400?ease(phase/2400):phase<9200?1:1-ease((phase-9200)/1800);
  progress.firstChild.nodeValue=String(Math.round(47*ratio));
  flashcards.textContent=String(Math.round(26*ratio));
  root.querySelector('.ai-global-bar>i').style.transform=`scaleX(${ratio})`;
  rings.forEach((ring,i)=>{const length=[43,33,18][i]*ratio;ring.style.strokeDasharray=`${length} ${100-length}`;});
  bars.forEach((bar,i)=>bar.style.transform=`scaleY(${Math.max(.04,Math.min(1,ratio*1.3-(i%8)*.04))})`);
 }
 function tick(now){
  if(lastTime!==null)elapsed+=Math.min(now-lastTime,80);
  lastTime=now;render(elapsed);frame=requestAnimationFrame(tick);
 }
 updateMotion=()=>{
  const running=visible&&!hovered&&!focused&&!document.hidden&&!root.querySelector('#ai-bilan').hidden&&!reduced.matches;
  root.dataset.motion=running?'running':'paused';
  if(!running){cancelAnimationFrame(frame);frame=0;lastTime=null;if(reduced.matches)render(0,true);return;}
  if(!frame)frame=requestAnimationFrame(tick);
 };
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;updateMotion();},{threshold:.2}).observe(root);
 root.addEventListener('pointerenter',()=>{hovered=true;updateMotion();});
 root.addEventListener('pointerleave',()=>{hovered=false;updateMotion();});
 root.addEventListener('focusin',()=>{focused=true;updateMotion();});
 root.addEventListener('focusout',()=>{focused=root.contains(document.activeElement);requestAnimationFrame(()=>{focused=root.contains(document.activeElement);updateMotion();});});
 document.addEventListener('visibilitychange',updateMotion);
 reduced.addEventListener('change',updateMotion);
 render(0,reduced.matches);updateMotion();
})();
