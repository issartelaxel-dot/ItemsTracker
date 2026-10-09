'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const items = [
  { id: 1, title: 'La relation médecin-malade', college: 'Psychiatrie · Médecine Interne', readings: 4, references:3, flashcards:8, progress:25, feeling:'Difficile', tone:'hard', lastReading:'Il y a 3 jours' },
  { id: 2, title: 'Les valeurs professionnelles du médecin', college: 'Médecine Interne', readings: 2, references:0, flashcards:12, progress:42, feeling:'Moyen', tone:'medium', lastReading:'Hier' },
  { id: 3, title: 'Le raisonnement et la décision en médecine', college: 'Santé Publique · Médecine Interne', readings: 7, references:2, flashcards:6, progress:75, feeling:'À l’aise', tone:'good', lastReading:'Il y a 2 jours' },
];
const initialItems=items.map(item=>({...item}));
const selectedDetails=$('#selected-item');
const selectedField=selector=>selectedDetails.querySelector(selector);
let expandedItemId=null;
let selectedId = 2;
const resourceItemId = 233;
const resourceVideoSource = 'https://commons.wikimedia.org/wiki/File:Aortic_valve_disease_video.webm';
function makeInitialResources() {
  return [
    {id:1,kind:'video',title:'Valvulopathies aortiques — comprendre le rétrécissement',url:resourceVideoSource},
    {id:2,kind:'link',title:'Item 233 — Valvulopathies',url:'https://www.sfcardio.fr/publication/chapitre-08-item-233-valvulopathies/',description:'Référentiel du Collège national des enseignants de cardiologie · en français.'}
  ];
}
let resources = makeInitialResources();
let activeTab = 'items';
let toastTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function animateMetric(element) {
  if (reducedMotion.matches) return;
  element.getAnimations().forEach(animation => animation.cancel());
  element.animate([
    {opacity: .4, transform: 'translateY(5px)'},
    {opacity: 1, transform: 'translateY(0)'}
  ], {duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)'});
}
function normalized(value) {
  return value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function selectedItem() { return items.find(item => item.id === selectedId); }
function notify(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}
function itemIcon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function renderItems(focusId = null) {
  const query = normalized($('#item-search').value.trim()).replace(/^#/, '');
  const visibleItems = items.filter(item => normalized(`${item.id} ${item.title} ${item.college}`).includes(query));
  const list = $('#item-list');
  selectedDetails.remove();
  list.replaceChildren();
  for (const item of visibleItems) {
    const entry=document.createElement('article');entry.className=`item-entry tone-${item.tone}`;entry.dataset.itemRow=String(item.id);
    const open=item.id===expandedItemId;
    entry.classList.toggle('is-open',open);
    const references=item.references;
    entry.innerHTML=`<button type="button" id="item-toggle-${item.id}" class="item-choice" data-item="${item.id}" aria-expanded="${open}" aria-controls="item-expansion-${item.id}"><span class="item-tone-dot" aria-hidden="true">${itemIcon(item.tone==='hard'?'alert':item.tone==='good'?'check':'book')}</span><span class="item-id">#${item.id}</span><span class="item-row-content"><strong>${item.title}</strong><small>${item.college}</small><span class="item-row-counters"><span role="img" aria-label="${item.readings} lectures enregistrées">${itemIcon('book')}<span class="item-readings">${item.readings}</span></span><span role="img" aria-label="${references} ressources d’exemple">${itemIcon('link')}${references}</span><span role="img" aria-label="${item.flashcards} flashcards d’exemple">${itemIcon('card')}${item.flashcards}</span></span></span><span class="item-row-state"><span class="item-progress-number" role="img" aria-label="Progression illustrative : ${item.progress} pour cent">${item.progress}%</span><span class="item-feeling">${item.feeling}</span></span><span class="item-expand-arrow" aria-hidden="true">${itemIcon('item-chevron')}</span></button><div id="item-expansion-${item.id}" class="item-expansion" role="region" aria-labelledby="item-toggle-${item.id}" aria-hidden="${!open}"><div class="item-expansion-inner"></div></div>`;
    const expansion=entry.querySelector('.item-expansion');expansion.inert=!open;
    if(open){entry.querySelector('.item-expansion-inner').append(selectedDetails);selectedDetails.hidden=false;}
    entry.querySelector('button').addEventListener('click',()=>{
      selectedId=item.id;expandedItemId=expandedItemId===item.id ? null : item.id;
      for(const row of list.querySelectorAll('.item-entry')) {
        const isOpen=Number(row.dataset.itemRow)===expandedItemId;
        row.classList.toggle('is-open',isOpen);
        row.querySelector('.item-choice').setAttribute('aria-expanded',String(isOpen));
        const details=row.querySelector('.item-expansion');details.setAttribute('aria-hidden',String(!isOpen));details.inert=!isOpen;
        if(isOpen){row.querySelector('.item-expansion-inner').append(selectedDetails);selectedDetails.hidden=false;}
      }
      renderSelected();
    });
    list.append(entry);
  }
  if (!visibleItems.length) {
    const empty = document.createElement('p'); empty.className = 'empty-search';
    empty.textContent = 'Aucun des trois exemples ne correspond à votre recherche.';list.append(empty);
  }
  $('#search-status').textContent = `${visibleItems.length} item${visibleItems.length > 1 ? 's' : ''} d’exemple trouvé${visibleItems.length > 1 ? 's' : ''}.`;
  if (focusId) list.querySelector(`[data-item="${focusId}"]`)?.focus();
}
function renderSelected() {
  const item=selectedItem();
  selectedField('#selected-number').textContent=`ITEM #${item.id}`;
  selectedField('#selected-college').textContent=item.college;
  selectedField('#selected-title').textContent=item.title;
  selectedField('#selected-readings').textContent=String(item.readings);
  selectedField('#reading-unit').textContent=`lecture${item.readings>1?'s':''} enregistrée${item.readings>1?'s':''}`;
  selectedField('#reading-status').textContent=`Dernière lecture : ${item.lastReading.toLocaleLowerCase('fr')}.`;
  selectedField('#reading-status').classList.toggle('success',item.lastReading==='À l’instant');
  selectedField('#selected-progress').textContent=`${item.progress}%`;
  selectedField('#selected-progress-fill').style.width=`${item.progress}%`;
  selectedDetails.dataset.tone=item.tone;
}
function renderHero({animate = false} = {}) {
  const count = items.reduce((sum,item)=>sum+item.readings,0);
  const previous = Number($('#hero-count').textContent);
  $('#hero-count').textContent = String(count);
  document.querySelectorAll('[data-hero-reading-total]').forEach(node=>node.textContent=String(count));
  $('#hero-card-count').textContent = String(items.reduce((sum,item)=>sum+item.flashcards,0));
  if (!$('#activity-grid').children.length) {
    for (let index = 0; index < 84; index++) $('#activity-grid').append(document.createElement('span'));
  }
  const filledIndexes = new Set(Array.from({length:Math.min(count,84)},(_,index)=>(index*17+7)%84));
  [...$('#activity-grid').children].forEach((cell,index)=>cell.classList.toggle('filled',filledIndexes.has(index)));
  window.ItemsHeroRelief?.updateTotal(count);
  if (animate && count!==previous && document.documentElement.dataset.heroDesign!=='relief') animateMetric($('#hero-count'));
}
function addReading(id, origin) {
  const item = items.find(entry => entry.id === id);
  const readingFocused=document.activeElement===selectedField('#add-reading');
  item.readings++;item.lastReading='À l’instant';
  renderHero({animate: true}); renderItems();renderSelected();
  if(readingFocused) selectedField('#add-reading').focus({preventScroll:true});
  const message = `Lecture enregistrée pour l’item #${id}. ${item.readings} au total dans cette démo.`;
  selectedField('#reading-status').textContent = message;
  notify(`Item #${id} · lecture ajoutée`);
}
selectedField('#add-reading').addEventListener('click', () => addReading(selectedId, 'workshop'));
$('#item-search').addEventListener('input', () => renderItems());

function selectTab(name, focus = false) {
  activeTab = name;
  if(name!=='resources')$('#resource-list').querySelectorAll('video').forEach(video=>video.pause());
  if(name==='items'){renderItems();renderSelected();}
  for (const tab of $$('[data-tab]')) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`#panel-${tab.dataset.tab}`).hidden = !selected;
    if (focus && selected) tab.focus();
  }
}
const tabs = $$('[data-tab]');
const mobileTabs = matchMedia('(max-width: 760px)');
function updateTabOrientation() {
  $('.feature-tabs').setAttribute('aria-orientation', mobileTabs.matches ? 'horizontal' : 'vertical');
}
updateTabOrientation();
mobileTabs.addEventListener('change', updateTabOrientation);
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', event => {
    let target;
    if (['ArrowDown', 'ArrowRight'].includes(event.key)) target = (index + 1) % tabs.length;
    if (['ArrowUp', 'ArrowLeft'].includes(event.key)) target = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target !== undefined) { event.preventDefault(); selectTab(tabs[target].dataset.tab, true); }
  });
});
$$('[data-select-demo]').forEach(link => link.addEventListener('click', () => selectTab(link.dataset.selectDemo)));

function renderResources() {
  const list=$('#resource-list');list.replaceChildren();
  $('#resource-count').textContent=`${resources.length} ressource${resources.length>1?'s':''}`;
  if(!resources.length){const empty=document.createElement('p');empty.className='resource-empty';empty.textContent='Ajoutez un lien utile, ou réinitialisez la démo pour retrouver la vidéo et le référentiel.';list.append(empty);}
  for(const resource of resources){
    const section=document.createElement('details');section.className='resource-section';section.open=true;section.dataset.resourceId=String(resource.id);
    const summary=document.createElement('summary');
    summary.innerHTML=itemIcon(resource.kind==='video'?'play':'link')+`<span>${resource.kind==='video'?'Vidéo pédagogique':'Lien utile'}</span><span class="resource-chevron">${itemIcon('item-chevron')}</span>`;
    const body=document.createElement('div');body.className='resource-section-body';
    if(resource.kind==='video'){
      const title=document.createElement('h4');title.textContent=resource.title;
      const meta=document.createElement('p');meta.className='resource-media-meta';meta.innerHTML='Osmosis · 2016 · 7 min 05 <span>Anglais · sous-titres français</span>';
      const video=document.createElement('video');video.className='resource-video';video.controls=true;video.playsInline=true;video.preload='none';video.poster='assets/aortic-valve-disease-osmosis-poster.jpg';video.setAttribute('aria-label','Vidéo Osmosis sur les maladies de la valve aortique, avec sous-titres français');
      const source=document.createElement('source');source.src='assets/aortic-valve-disease-osmosis-cc-by-sa-4.webm';source.type='video/webm';video.append(source);
      for(const lang of ['fr','en']){const track=document.createElement('track');track.kind='captions';track.src=`assets/aortic-valve-disease-${lang}.vtt`;track.srclang=lang;track.label=lang==='fr'?'Français':'English';track.default=lang==='fr';video.append(track);}
      const fallback=document.createElement('a');fallback.href=resourceVideoSource;fallback.target='_blank';fallback.rel='noopener noreferrer';fallback.textContent='Voir la vidéo sur Wikimedia Commons';video.append(fallback);
      const credit=document.createElement('p');credit.className='resource-credit';
      credit.innerHTML='<a href="https://commons.wikimedia.org/wiki/File:Aortic_valve_disease_video.webm" target="_blank" rel="noopener">Aortic valve disease</a> — Osmosis · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> · vidéo intégrale, sans modification. Sous-titres : <a href="https://commons.wikimedia.org/wiki/TimedText:Aortic_valve_disease_video.webm.fr.srt" target="_blank" rel="noopener">contributeurs Wikimedia Commons</a>.';
      body.append(title,meta,video,credit);
      section.addEventListener('toggle',()=>{if(!section.open)video.pause();});
    }else{
      const link=document.createElement('a');link.className='resource-link-preview';link.href=resource.url;link.target='_blank';link.rel='noopener noreferrer';
      link.innerHTML=itemIcon('book')+'<span></span>'+itemIcon('arrow');link.lastElementChild.classList.add('resource-link-arrow');
      const title=document.createElement('strong');title.textContent=resource.title;
      const description=document.createElement('small');description.textContent=resource.description??`Item ${resourceItemId} · votre lien utile`;
      link.querySelector('span').append(title,description);body.append(link);
    }
    section.append(summary,body);list.append(section);
  }
}
$$('a[href="#faq-ai"]').forEach(link => link.addEventListener('click', () => { $('#faq-ai').open = true; }));

$('#reset-demo').addEventListener('click', () => {
  items.forEach((item,index)=>Object.assign(item,initialItems[index]));
  expandedItemId=null;
  selectedId = 2; resources = makeInitialResources();
  $('#item-search').value = '';
  $('#resource-status').textContent = '';
  renderItems(); renderSelected(); renderHero(); renderResources();
  window.ItemsQuiz?.reset();
  selectTab(activeTab);
  notify('Tous les exemples ont été réinitialisés.');
});
const dialog = $('#access-dialog');
$$('[data-access]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
// Decorative icon instances inherit no accessible name; their controls carry the labels.
$$('svg.icon').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
renderItems(); renderSelected(); renderHero(); renderResources();
