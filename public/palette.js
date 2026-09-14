/* Restore before the first paint; keep the choice local to this browser. */
(() => {
  'use strict';
  const key='phaseone-palette';
  const valid=value=>value==='green'?'green':'pink';
  let selected='pink';
  try{selected=valid(localStorage.getItem(key));}catch{}
  document.documentElement.dataset.palette=selected;
  function reflect(){
    document.querySelectorAll('.palette-switch').forEach(button=>{
      button.setAttribute('aria-checked',String(selected==='green'));
      button.title=selected==='green'?'Passer au rose':'Passer au vert';
    });
    const icon=document.querySelector('link[rel="icon"]');
    if(icon){
      const color=selected==='green'?'#00ff41':'#ff62b5';
      icon.href='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#070608"/><path d="m7 8 9 8-9 8M18 24h8" fill="none" stroke="${color}" stroke-width="3"/></svg>`);
    }
  }
  function apply(value){
    selected=valid(value);
    document.documentElement.dataset.palette=selected;
    reflect();
    document.dispatchEvent(new CustomEvent('phaseone:palette',{detail:selected}));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    reflect();
    document.querySelectorAll('.palette-switch').forEach(button=>button.addEventListener('click',()=>{
      apply(selected==='pink'?'green':'pink');
      try{localStorage.setItem(key,selected);}catch{}
    }));
  },{once:true});
  addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(event.newValue);});
})();
