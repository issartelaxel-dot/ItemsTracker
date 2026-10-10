(() => {
  const hero = document.querySelector('.hero-showcase');
  const active = document.documentElement.dataset.heroDesign === 'relief';
  const pause = hero.querySelector('.relief-motion-toggle');
  const base = [2,3,1,0,2,4,1];
  const days = ['L','M','M','J','V','S','D'];
  const bars = [];
  const progress = hero.querySelector('#hero-progress');
  const progressBars = [...hero.querySelectorAll('.showcase-progress>i')];
  const collegeValues = [...hero.querySelectorAll('.showcase-college-row>strong')];
  const collegeTargets = collegeValues.map(node=>parseInt(node.textContent,10));
  const toast = hero.querySelector('.relief-reading-toast');
  let inViewport = false, userPaused = false, running = false;
  let frame = 0, lastTime = null, elapsed = 0, duration = 14000;
  let cells = [], readings = [], schedule = [], total = 13, lastStep = -1;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  for (let index=0;index<days.length;index++) {
    const bar=document.createElement('span');
    bar.dataset.heroDay=String(index);
    bar.innerHTML=`<i></i><span>${days[index]}</span>`;
    bars.push(bar);hero.querySelector('.relief-week-bars').append(bar);
  }
  function renderSequence(time, complete = false) {
    if (!active) return;
    const step=complete?readings.length:schedule.filter(at=>at<=time).length;
    const latest=step?readings[step-1]:null;
    const recent=!complete && step>0 && time-schedule[step-1]<500;
    if (toast.classList.contains('is-visible') !== recent) toast.classList.toggle('is-visible',recent);
    if(step===lastStep) {
      if (!recent && latest) latest.classList.remove('is-current-read');
      return;
    }
    lastStep=step;
    // Update only changed cells, rather than repainting the entire grid each step.
    const read = new Set(readings.slice(0,step));
    cells.forEach(cell=>{
      if (cell.classList.contains('is-read') !== read.has(cell)) cell.classList.toggle('is-read',read.has(cell));
      if (cell !== latest && cell.classList.contains('is-current-read')) cell.classList.remove('is-current-read');
    });
    if(recent && latest) latest.classList.add('is-current-read');
    const ratio=readings.length?step/readings.length:0;
    hero.querySelector('#hero-count').textContent=String(Math.round(total*ratio));
    progress.firstChild.nodeValue=String(Math.round(47*ratio));
    progressBars.forEach(bar=>bar.style.transform=`scaleX(${ratio})`);
    collegeValues.forEach((node,index)=>node.textContent=`${Math.round(collegeTargets[index]*ratio)}%`);
    bars.forEach(bar=>bar.firstElementChild.style.transform=`scaleY(${ratio})`);
  }
  function tick(timestamp) {
    if(!running)return;
    if(lastTime!==null)elapsed=(elapsed+timestamp-lastTime)%duration;
    lastTime=timestamp;
    renderSequence(elapsed);
    frame=requestAnimationFrame(tick);
  }
  function updateMotion() {
    const next=active && inViewport && !document.hidden && !reduced.matches && !userPaused;
    hero.style.setProperty('--hero-motion-play-state',next?'running':'paused');
    hero.classList.toggle('hero-reading-paused',!next);
    if(reduced.matches)renderSequence(0,true);
    if(next===running)return;
    running=next;
    cancelAnimationFrame(frame);lastTime=null;
    if(running){lastStep=-1;frame=requestAnimationFrame(tick);}
  }
  window.ItemsHeroRelief={
    updateTotal(value) {
      cells=[...hero.querySelectorAll('#activity-grid>span')];
      // This marketing animation illustrates one reading each day, independently of the interactive demo.
      total=active?cells.length:value;
      const counts=active?Array(7).fill(1):[...base];
      if(!active)counts[5]+=Math.max(0,total-13);
      bars.forEach((bar,index)=>{
        bar.dataset.empty=String(counts[index]===0);
        bar.style.setProperty('--bar-height',`${active?54:Math.max(5,Math.min(54,counts[index]*12))}px`);
      });
      readings=active?cells:cells.filter(cell=>cell.classList.contains('filled'));
      let cursor=450, previousRow=0;
      schedule=readings.map(cell=>{
        const row=Math.floor(cells.indexOf(cell)/21);
        if(row!==previousRow)cursor+=450;
        previousRow=row;cursor+=140;return cursor;
      });
      duration=cursor+3400;elapsed=0;lastTime=null;lastStep=-1;
      // The completed illustrative state is used when motion is reduced or offscreen.
      renderSequence(0,true);
    },
    reset(){this.updateTotal(13);}
  };
  window.ItemsHeroRelief.updateTotal(Number(hero.querySelector('#hero-count').textContent));
  if(active){
    hero.querySelector('.relief-caption>span').textContent='Aperçu animé · données d’exemple.';
    hero.querySelector('.showcase-dashboard').setAttribute('aria-label','Aperçu animé du tableau de bord : les lectures se cumulent de gauche à droite, ligne par ligne, et les indicateurs de progression avancent au même rythme. Données d’exemple.');
  }
  pause.addEventListener('click',()=>{
    userPaused=!userPaused;
    pause.setAttribute('aria-pressed',String(userPaused));
    pause.textContent=userPaused?'Reprendre l’animation':'Mettre en pause';
    updateMotion();
  });
  const observer=new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;updateMotion();},{threshold:.1});
  observer.observe(hero);
  document.addEventListener('visibilitychange',updateMotion);
  reduced.addEventListener('change',()=>{lastStep=-1;updateMotion();});
  updateMotion();
})();
