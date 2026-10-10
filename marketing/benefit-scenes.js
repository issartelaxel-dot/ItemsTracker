'use strict';
(() => {
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = [...document.querySelectorAll('[data-scene]')].map(element => ({element, name:element.dataset.sceneName, type:element.dataset.scene, visible:false, wanted:!motionPreference.matches && element.dataset.scene!=='memory', elapsed:0, duration:element.dataset.scene==='insights' ? 16000 : 6000, phase:-1}));
  const stillProgress = scene => scene.type === 'memory' ? .08 : .9;
  let frameId = null;
  let previousTime = null;
  // SVG geometry is static; cache it before changing drawing attributes.
  for (const scene of scenes) {
    if (scene.type === 'rhythm') {
      scene.steady = scene.element.querySelector('.rhythm-steady');
      scene.pathLength = scene.steady.getTotalLength();
      scene.lines = [...scene.element.querySelectorAll('.rhythm-line')];
      scene.point = scene.element.querySelector('.rhythm-point');
    }
  }
  function controls(scene) {
    const control = scene.element.querySelector('.scene-playback');
    const text = `${scene.wanted ? 'Mettre l’animation en pause' : 'Lancer l’animation'} : ${scene.name}`;
    control.setAttribute('aria-label', text);
    control.title = text;
    control.querySelector('use').setAttribute('href', scene.wanted ? '#i-pause' : '#i-play');
    scene.element.classList.toggle('scene-is-playing', scene.wanted && scene.visible && !document.hidden);
  }
  function draw(scene, progress) {
    const root = scene.element;
    if (scene.type === 'rhythm') {
      const drawProgress = Math.min(1, progress / .74);
      const point = scene.steady.getPointAtLength(scene.pathLength*drawProgress);
      scene.lines.forEach(line => {line.style.strokeDashoffset = String(1-drawProgress);});
      scene.point.setAttribute('cx',point.x);
      scene.point.setAttribute('cy',point.y);
      root.dataset.phase = String(Math.min(3,Math.floor(progress*4)));
      return;
    }
    const phase = progress >= .7 ? 2 : progress >= .33 ? 1 : 0;
    if (scene.phase === phase) return;
    scene.phase = phase;
    root.dataset.phase = String(phase);
    if (scene.type === 'start') {
      root.querySelectorAll('.start-step').forEach((step,index) => {
        step.classList.toggle('is-active',index===phase);
        step.classList.toggle('is-complete',index<phase || phase===2);
        step.setAttribute('aria-pressed',String(index===phase));
      });
      root.querySelector('.scene-progress span').style.transform = `scaleX(${(phase+1)/3})`;
    }
    if (scene.type === 'memory') {
      const revealed = phase > 0;
      root.classList.toggle('is-revealed',revealed);
      root.querySelector('.mini-card-front').setAttribute('aria-hidden',String(revealed));
      root.querySelector('.mini-card-back').setAttribute('aria-hidden',String(!revealed));
      for (const [selector,hidden] of [['.mini-card-front',revealed],['.mini-card-back',!revealed]]) {
        const face=root.querySelector(selector);
        face.inert=hidden;
        face.querySelectorAll('button').forEach(button=>{button.tabIndex=hidden ? -1 : 0;});
      }
      root.querySelector('.memory-flip span').textContent = revealed ? 'Revoir la question' : 'Révéler la réponse';
      root.querySelector('.memory-flip').setAttribute('aria-pressed',String(revealed));
    }
    if (scene.type === 'organize') {
      root.classList.toggle('is-organized',phase>0);
      root.querySelector('[data-scene-action]').setAttribute('aria-pressed',String(phase>0));
      root.querySelector('[data-scene-action]').firstChild.textContent = phase>0 ? 'Voir les supports séparés ' : 'Réunir autour de l’item ';
    }
  }
  const runs = scene => scene.wanted && scene.visible && !document.hidden;
  function tick(time) {
    frameId = null;
    const elapsed = previousTime===null ? 0 : Math.min(time-previousTime,80);
    previousTime = time;
    for (const scene of scenes) {
      if (!runs(scene)) continue;
      scene.elapsed = (scene.elapsed+elapsed)%scene.duration;
      draw(scene,scene.elapsed/scene.duration);
    }
    if (scenes.some(runs)) frameId = requestAnimationFrame(tick);
    else previousTime = null;
  }
  function update() {
    scenes.forEach(controls);
    if (scenes.some(runs) && frameId===null) {previousTime=null; frameId=requestAnimationFrame(tick);}
    if (!scenes.some(runs) && frameId!==null) {cancelAnimationFrame(frameId);frameId=null;previousTime=null;}
  }
  function manual(scene, progress) {
    scene.wanted = false;
    scene.elapsed = progress*scene.duration;
    draw(scene,progress);
    update();
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const scene=scenes.find(candidate=>candidate.element===entry.target);
      if(scene) scene.visible=entry.isIntersecting && entry.intersectionRatio>=.18;
    }
    update();
  },{threshold:.18});
  for(const scene of scenes) {
    draw(scene,motionPreference.matches ? stillProgress(scene) : 0);
    if(motionPreference.matches) scene.elapsed=scene.duration*stillProgress(scene);
    scene.element.querySelector('.scene-playback').addEventListener('click',()=>{scene.wanted=!scene.wanted;update();});
    scene.element.querySelector('.scene-replay').addEventListener('click',()=>{
      scene.elapsed=0;scene.phase=-1;
      scene.wanted=!motionPreference.matches;
      draw(scene,motionPreference.matches ? stillProgress(scene) : 0);
      update();
    });
    scene.element.querySelectorAll('[data-scene-step]').forEach(button=>button.addEventListener('click',()=>manual(scene,[.08,.43,.88][Number(button.dataset.sceneStep)])));
    scene.element.querySelectorAll('[data-scene-action]').forEach(button=>button.addEventListener('click',()=>{
      const revealed=scene.type==='memory' ? scene.element.classList.contains('is-revealed') : scene.type==='organize' ? scene.element.classList.contains('is-organized') : scene.element.classList.contains('is-focused');
      manual(scene,revealed ? .08 : .88);
      if(button.classList.contains('mini-card-turn')) {
        scene.element.querySelector(revealed ? '.mini-card-front .mini-card-turn' : '.mini-card-back .mini-card-turn').focus({preventScroll:true});
      }
    }));
    observer.observe(scene.element);
  }
  const imageDialog=document.querySelector('#medical-image-dialog');
  document.querySelectorAll('[data-expand-medical]').forEach(button=>button.addEventListener('click',event=>{
    event.stopPropagation();
    const scene=scenes.find(candidate=>candidate.type==='memory');
    scene.wanted=false;
    update();
    imageDialog.showModal();
  }));
  imageDialog.querySelector('[data-close-medical]').addEventListener('click',()=>imageDialog.close());
  imageDialog.addEventListener('click',event=>{
    if(event.target!==imageDialog) return;
    const rect=imageDialog.getBoundingClientRect();
    if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) imageDialog.close();
  });
  const memory=scenes.find(scene=>scene.type==='memory');
  memory.element.querySelector('.mini-card').addEventListener('focusin',()=>{memory.wanted=false;update();});
  document.addEventListener('visibilitychange',update);
  motionPreference.addEventListener('change',event=>{
    if(event.matches) scenes.forEach(scene=>{scene.wanted=false;scene.phase=-1;draw(scene,stillProgress(scene));scene.elapsed=scene.duration*stillProgress(scene);});
    update();
  });
  update();
})();
