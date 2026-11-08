/* Touch controls use the same keyboard events as the desktop adventure. */
(function (root) {
  'use strict';
  const KEYS = Object.freeze({
    up: {code:'ArrowUp',key:'ArrowUp',number:38},
    down: {code:'ArrowDown',key:'ArrowDown',number:40},
    left: {code:'ArrowLeft',key:'ArrowLeft',number:37},
    right: {code:'ArrowRight',key:'ArrowRight',number:39},
    confirm: {code:'Space',key:' ',number:32},
    back: {code:'Escape',key:'Escape',number:27},
    menu: {code:'Escape',key:'Escape',number:27},
    map: {code:'KeyM',key:'m',number:77},
    bag: {code:'KeyB',key:'b',number:66},
    run: {code:'ShiftLeft',key:'Shift',number:16}
  });

  function create({window,document,canvas}) {
    const buttons = Array.from(document.querySelectorAll('[data-key]'));
    const pointers = new Map();
    const held = new Map();
    const downAt = new Map();
    const pending = new Map();
    let ready = false;
    let view = 'story';
    let player = null;
    document.body.dataset.view=view;

    function send(key,pressed) {
      const spec = KEYS[key];
      canvas.dispatchEvent(new window.KeyboardEvent(pressed?'keydown':'keyup',{
        key:spec.key,code:spec.code,keyCode:spec.number,which:spec.number,
        location:spec.code==='ShiftLeft'?1:0,
        repeat:false,bubbles:true,cancelable:true,
        shiftKey: key==='run'?pressed:held.has('ShiftLeft')
      }));
    }

    function paint() {
      buttons.forEach(button => {
        button.setAttribute('aria-pressed',String(held.has(KEYS[button.dataset.key].code)));
      });
      ['directions','actions'].forEach(id=>{
        const nav=document.getElementById(id);
        nav.classList.toggle('controls-active',Boolean(nav.querySelector('[aria-pressed="true"]')));
      });
    }

    function hold(pointer,key) {
      if (!ready || !KEYS[key]) return;
      if (pointers.has(pointer)) release(pointer);
      pointers.set(pointer,key);
      const code = KEYS[key].code;
      if (!held.has(code)) {
        const old=pending.get(code);
        if (old) {
          window.clearTimeout(old.timer);
          pending.delete(code);
          send(old.key,false);
        }
        held.set(code,new Set([pointer]));
        downAt.set(code,window.performance.now());
        send(key,true);
      } else held.get(code).add(pointer);
      paint();
    }

    function release(pointer) {
      const key = pointers.get(pointer);
      if (!key) return;
      pointers.delete(pointer);
      const code = KEYS[key].code;
      const owners = held.get(code);
      if (!owners) return;
      owners.delete(pointer);
      if (!owners.size) {
        held.delete(code);
        // A quick touch must span a game frame: some inherited battle/dialogue
        // code reads just-pressed input on the following frame.
        const delay=Math.max(0,60-(window.performance.now()-downAt.get(code)));
        downAt.delete(code);
        if (delay>0) {
          const timer=window.setTimeout(()=>{pending.delete(code);send(key,false);},delay);
          pending.set(code,{timer,key});
        } else send(key,false);
      }
      paint();
    }

    function releaseAll() {
      Array.from(pointers.keys()).forEach(release);
      for (const entry of pending.values()) {
        window.clearTimeout(entry.timer);
        send(entry.key,false);
      }
      pending.clear();
    }

    buttons.forEach(button => {
      button.disabled=true;
      button.setAttribute('aria-pressed','false');
      button.addEventListener('pointerdown',event => {
        if (!ready || (event.pointerType==='mouse' && event.button!==0)) return;
        event.preventDefault();
        canvas.focus({preventScroll:true});
        hold(event.pointerId,button.dataset.key);
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      },{passive:false});
      button.addEventListener('pointermove',event => {
        if (!pointers.has(event.pointerId) || !button.classList.contains('direction')) return;
        const target=document.elementFromPoint(event.clientX,event.clientY);
        const next=target && target.closest('[data-key]');
        if (next && next.classList.contains('direction') && next.dataset.key!==pointers.get(event.pointerId)) {
          release(event.pointerId);
          hold(event.pointerId,next.dataset.key);
        }
      });
      button.addEventListener('lostpointercapture',event=>release(event.pointerId));
      button.addEventListener('contextmenu',event=>event.preventDefault());
      // Keyboard and assistive activation of the visible buttons remains usable.
      button.addEventListener('click',event => {
        if (!ready || event.detail!==0) return;
        const pointer='activation-'+button.dataset.key;
        hold(pointer,button.dataset.key);
        window.setTimeout(()=>release(pointer),50);
      });
    });

    document.addEventListener('pointerup',event=>release(event.pointerId));
    document.addEventListener('pointercancel',event=>release(event.pointerId));
    window.addEventListener('blur',releaseAll);
    window.addEventListener('pagehide',releaseAll);
    document.addEventListener('visibilitychange',()=>{
      if (document.hidden) releaseAll();
    });

    function fitScreen() {
      const slot=document.getElementById('screen-slot');
      const ratio=window.devicePixelRatio||1;
      const available=Math.min(slot.clientWidth/240,slot.clientHeight/160);
      const scale=Math.max(1,Math.floor(available*ratio))/ratio;
      canvas.style.width=(240*scale)+'px';
      canvas.style.height=(160*scale)+'px';
      const game=canvas.getBoundingClientRect();
      const consoleRect=document.getElementById('console').getBoundingClientRect();
      const directions=document.getElementById('directions');
      const actions=document.getElementById('actions');
      const padding=Math.max(6,Math.min(12,game.width*.015));
      directions.style.left=(game.left-consoleRect.left+padding)+'px';
      directions.style.top=(game.top-consoleRect.top+game.height*(view==='title'?132:104)/160-directions.offsetHeight)+'px';
      actions.style.left=(game.right-consoleRect.left-actions.offsetWidth-padding)+'px';
      actions.style.top=(game.top-consoleRect.top+game.height*(view==='title'?132:70)/160-actions.offsetHeight)+'px';
      ['directions','actions'].forEach(id=>{
        const nav=document.getElementById(id);const r=nav.getBoundingClientRect();
        const x=player?game.left+player[0]*game.width:-1000;
        const y=player?game.top+player[1]*game.height:-1000;
        const bottom=r.bottom+(id==='actions'&&view==='field'?document.querySelector('.shortcuts').offsetHeight+6:0);
        nav.classList.toggle('near-player',view==='field'&&x>r.left-20&&x<r.right+20&&y>r.top-20&&y<bottom+20);
      });
    }
    window.addEventListener('resize',()=>{releaseAll();fitScreen();});
    if (window.visualViewport) window.visualViewport.addEventListener('resize',fitScreen);
    window.addEventListener('orientationchange',releaseAll);
    if (window.ResizeObserver) new window.ResizeObserver(fitScreen).observe(document.getElementById('screen-slot'));
    fitScreen();

    const full=document.getElementById('fullscreen');
    const handheld=document.getElementById('handheld');
    if (handheld.requestFullscreen) {
      full.hidden=false;
      full.addEventListener('click',()=>{
        releaseAll();
        const result=document.fullscreenElement?document.exitFullscreen():handheld.requestFullscreen();
        if (result && result.then) result.then(()=>{
          if (window.screen.orientation && window.screen.orientation.lock && document.fullscreenElement) {
            return window.screen.orientation.lock('landscape').catch(()=>{});
          }
        }).catch(()=>{});
      });
    }

    return Object.freeze({
      setReady(value) {
        if (!value) releaseAll();
        ready=Boolean(value);
        buttons.forEach(button=>{button.disabled=!ready;});
      },
      releaseAll,
      fitScreen,
      setView(mode,x=-1,y=-1) {
        if (!['title','story','field','dialogue','menu','battle'].includes(mode)) return;
        if (view!==mode) releaseAll();
        view=mode;document.body.dataset.view=mode;
        player=x>=0&&y>=0?[x,y]:null;
        fitScreen();
      },
      getState:()=>({ready,view,pointers:pointers.size,held:Array.from(held.keys())})
    });
  }

  root.PokemonLoveControls=Object.freeze({create});
  if (typeof module!=='undefined' && module.exports) module.exports={create};
})(typeof globalThis!=='undefined'?globalThis:this);
