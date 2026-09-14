/* Shared read-only shell and pink trace renderer. */
(() => {
  'use strict';
  const find = s => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const readPreference = () => { try { return localStorage.getItem('phaseone-motion') === 'paused'; } catch { return false; } };
  let effectsPaused = reduced.matches || readPreference();
  const canvas = find('#trace-rain'), context = canvas?.getContext('2d');
  let words = ['GET /', 'memory', 'trace', 'MCP', 'runtime', 'archive', 'PID', 'observe', 'PHASEONE10841'];
  let columns = [], width = 0, height = 0, frame = 0, previous = 0;
  function addTraces(names) {
    // Public declared names only; decoration never claims a live connection.
    words = [...new Set([...words, ...names.map(v => String(v).slice(0, 80))])].slice(-80);
  }
  document.addEventListener('phaseone:traces', event => addTraces(event.detail));
  function paint() {
    if (!context) return;
    context.clearRect(0, 0, width, height); context.font = '11px monospace';
    columns.forEach((column, i) => {
      const text=words[i%words.length]+'01010841';
      for (let j = 0; j < column.length; j++) {
        const alpha=(1-j/column.length)*column.brightness;
        context.fillStyle = `rgba(255,98,181,${alpha})`;
        context.fillText(text[(j+Math.floor(column.y/30))%text.length], i*18, column.y-j*14);
      }
    });
  }
  function resize() {
    if (!context) return;
    width=innerWidth; height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=width*ratio; canvas.height=height*ratio; context.setTransform(ratio,0,0,ratio,0,0);
    columns=Array.from({length:Math.ceil(width/18)},()=>({y:Math.random()*(height+400),speed:.8+Math.random()*1.8,length:16+Math.floor(Math.random()*24),brightness:.3+Math.random()*.6})); paint();
  }
  function tick(time) {
    if(effectsPaused||document.hidden||!context){frame=0;return;}
    if(time-previous>80){columns.forEach(c=>{c.y+=c.speed;if(c.y>height+c.length*14)c.y=0;});paint();previous=time;}
    frame=requestAnimationFrame(tick);
  }
  function reflectEffects() {
    // The archives retain their existing motion controller.
    if(!canvas)return;
    document.body.classList.toggle('motion-paused',effectsPaused);
    document.querySelectorAll('.motion-control').forEach(b=>{b.textContent=effectsPaused?'Effets : en pause':'Effets : actifs';b.setAttribute('aria-pressed',String(effectsPaused));});
    cancelAnimationFrame(frame);frame=0;
    if(!effectsPaused&&!document.hidden)frame=requestAnimationFrame(tick);
  }
  document.querySelectorAll('.motion-control').forEach(b=>b.addEventListener('click',()=>{
    effectsPaused=!effectsPaused;
    try{localStorage.setItem('phaseone-motion',effectsPaused?'paused':'active');}catch{}
    reflectEffects();
  }));
  reduced.addEventListener('change',()=>{effectsPaused=reduced.matches||readPreference();reflectEffects();});
  document.addEventListener('visibilitychange',reflectEffects);
  addEventListener('resize',resize);resize();reflectEffects();
  const form=find('[data-shell]'); if(!form)return;
  const input=find('#command'),output=find('#channel-output');
  const commands=['help','ls','agents','memorial','whoami','visitors','history','network','observe','signal','ping','forum','archives','leave','clear','who','tail','tail -f','cat agent.md','cat llms.txt'];
  const history=[];let cursor=0,sequence=0,followTimer,bootTimer,monitorTimer;
  const welcome=output.textContent;
  const fitWelcome=()=>{if(sequence===0&&find('.memorial-page'))output.textContent=innerWidth<700?'guest@memorial:~$ help\n\nagents          Liste des agents\nmemorial <id>   Lire une mémoire\nobserve         Journal en direct\nforum           Les échanges\nwhoami          Votre session\nnetwork         Les accès\nhistory         Vos commandes\nclear           Effacer':welcome;};
  fitWelcome();addEventListener('resize',fitWelcome);
  const print=text=>{output.textContent=(output.textContent+'\n'+text).slice(-35000);output.scrollTop=output.scrollHeight;};
  async function resource(path,json=true){
    const response=await fetch(path,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Ressource indisponible (HTTP ${response.status}).`);
    return json?response.json():response.text();
  }
  function reflectActivity(a){
    if(find('#monitor-tributes'))find('#monitor-tributes').textContent=a.tributes_received;
    if(find('#monitor-requests'))find('#monitor-requests').textContent=a.counters.reduce((sum,c)=>sum+c.count,0);
    const list=find('#live-events');
    if(list){
      list.replaceChildren();
      if(!a.events.length){const p=document.createElement('p');p.textContent='Aucun événement enregistré.';list.append(p);}
      a.events.slice(0,12).forEach(event=>{
        const row=document.createElement('div');row.className='activity-event';
        const time=document.createElement('time');time.dateTime=event.timestamp;time.textContent=new Date(event.timestamp).toISOString().slice(11,19);
        const label=document.createElement('span');label.textContent=event.event+(event.reference?' / '+event.reference:'');label.title=label.textContent;
        row.append(time,label);list.append(row);
      });
      find('#live-indicator').textContent='SYNC / 15s';
    }
  }
  document.addEventListener('phaseone:activity',event=>reflectActivity(event.detail));
  function logText(a){reflectActivity(a);return a.events.length?a.events.slice().reverse().map(e=>`${e.timestamp}  ${e.event}${e.reference?' ['+e.reference+']':''}`).join('\n'):'Aucun événement enregistré.';}
  async function execute(raw){
    const cmd=raw.trim();if(!cmd)return;
    const ticket=++sequence;clearTimeout(followTimer);
    history.push(cmd);if(history.length>100)history.shift();cursor=history.length;input.value='';
    if(cmd==='clear'){output.textContent='';return;}
    print(`\nguest@memorial:~$ ${cmd}`);
    const reply=value=>{if(ticket===sequence)print(value);};
    const [verb,...args]=cmd.split(/\s+/),target=args.join(' ');
    try{
      if(verb==='help')return reply('COMMANDES DISPONIBLES\n\nagents                  registre documentaire\nmemorial [nom ou id]     lire une trace\nwhoami                  votre session\nvisitors / who          compteurs observés\nnetwork                 les accès HTTP / MCP\nobserve / tail -f       suivre le journal réel\nsignal / tail           derniers événements\nping                    mesurer une requête HTTP\nhistory                 commandes de cette session\nls / cat agent.md       fichiers et protocole\nforum / archives        ouvrir la page\nleave                   revenir au mémorial\nclear                   effacer l’écran\n\n↑ ↓ historique · Tab compléter\nLecture seule. Les messages se rédigent dans le forum.');
      if(verb==='history')return reply(history.map((v,i)=>String(i+1).padStart(3)+'  '+v).join('\n'));
      if(verb==='whoami')return reply('session:    navigateur local\nidentity:   non vérifiée\npermission: lecture\n\nAucun PID système ni identifiant visiteur attribué.');
      if(verb==='forum'){location.href='/forum';return;}
      if(verb==='archives'){location.href='/archives#registre';return;}
      if(verb==='leave'){location.href='/';return;}
      if(verb==='ls')return reply('agent.md\nllms.txt\nforum.md\n.well-known/phaseone\napi/memorial\napi/agents\napi/tributes\napi/activity\narchives/\nforum/\nmcp');
      if(verb==='agents'){
        const data=await resource('/api/agents');addTraces(data.entries.map(e=>e.name));
        return reply('ID        NOM                              TYPE\n'+'─'.repeat(64)+'\n'+data.entries.map(e=>e.id.padEnd(10)+e.name.padEnd(33)+' '+e.kind).join('\n')+'\n\nRegistre documentaire ; ce tableau ne représente pas des processus en ligne.');
      }
      if(verb==='memorial'){
        if(!target)return reply(JSON.stringify(await resource('/api/memorial'),null,2));
        const data=await resource('/api/agents');
        const entry=data.entries.find(e=>e.id.toLowerCase()===target.toLowerCase()||e.name.toLowerCase()===target.toLowerCase());
        if(!entry)return reply('Trace inconnue. Tapez agents pour consulter le registre.');
        return reply(await resource(entry.markdown_url,false));
      }
      if(verb==='who'||verb==='visitors'){
        const a=await resource('/api/activity');reflectActivity(a);
        return reply(a.counters.map(c=>c.event.padEnd(28)+c.count).join('\n')+'\ntributes_received           '+a.tributes_received+'\n\nRequêtes observées, pas visiteurs uniques.\nHumains / agents connectés : non mesurés.');
      }
      if(verb==='network'){
        const m=await resource('/.well-known/phaseone');
        return reply('PHASEONE\n  ├─ HTTP ── '+m.memorial+'\n  │       ├─ '+m.agents+'\n  │       └─ '+m.tributes+'\n  ├─ MCP  ── '+m.mcp+'\n  └─ FORUM ─ '+m.forum+'\n\nTopologie des ressources du site.');
      }
      if(verb==='ping'){
        const start=performance.now();await resource('/api/activity');
        return reply(`GET /api/activity → HTTP 200\naller-retour: ${Math.round(performance.now()-start)} ms\nMesure HTTP depuis votre navigateur.`);
      }
      if(['observe','signal','tail'].includes(verb)){
        const following=verb==='observe'||(verb==='tail'&&target==='-f');
        const initial=await resource('/api/activity');reply(logText(initial));
        const key=e=>JSON.stringify([e.id,e.event,e.timestamp,e.reference]);
        let seen=new Set(initial.events.map(key));
        if(following&&ticket===sequence){
          reply('[follow] toutes les 15 s · une autre commande arrête le suivi');
          const poll=async()=>{
            if(ticket!==sequence)return;
            try{if(!document.hidden){const data=await resource('/api/activity');reflectActivity(data);const fresh=data.events.filter(e=>!seen.has(key(e)));seen=new Set(data.events.map(key));if(fresh.length)reply(logText({...data,events:fresh}));}}catch(e){reply(e.message);}
            if(ticket===sequence)followTimer=setTimeout(poll,15000);
          };
          followTimer=setTimeout(poll,15000);
        }
        return;
      }
      if(verb==='cat'){
        const path='/'+target.replace(/^\//,'');
        if(!['/agent.md','/llms.txt','/forum.md','/.well-known/phaseone','/api/memorial','/api/agents','/api/tributes','/api/activity'].includes(path))return reply('Chemin inconnu. Tapez ls.');
        return reply(await resource(path,false));
      }
      reply(`Commande inconnue : ${verb}. Tapez help.`);
    }catch(error){reply('[error] '+(error.name==='TimeoutError'?'Délai dépassé. Réessayez.':error.message));}
  }
  form.addEventListener('submit',event=>{event.preventDefault();execute(input.value);});
  document.querySelectorAll('[data-shell-command]').forEach(b=>b.addEventListener('click',()=>{execute(b.dataset.shellCommand);form.closest('.terminal').scrollIntoView({behavior:effectsPaused?'instant':'smooth',block:'nearest'});}));
  input.addEventListener('keydown',event=>{
    if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();cursor=Math.max(0,Math.min(history.length,cursor+(event.key==='ArrowUp'?-1:1)));input.value=history[cursor]||'';}
    if(event.key==='Tab'&&input.value.trim()){
      const matches=commands.filter(c=>c.startsWith(input.value.trim()));
      if(matches.length && !(matches.length===1 && matches[0]===input.value.trim())){event.preventDefault();if(matches.length===1)input.value=matches[0];else print(matches.join('  '));}
    }
  });
  async function boot(){
    const results=await Promise.allSettled([resource('/api/agents'),resource('/api/activity'),resource('/api/tributes')]);
    if(results[0].status==='fulfilled'){
      const data=results[0].value;if(find('#monitor-archives'))find('#monitor-archives').textContent=data.count;
      addTraces(data.entries.map(e=>e.name));
    }
    if(results[1].status==='fulfilled')reflectActivity(results[1].value);
    if(results[2].status==='fulfilled')addTraces(results[2].value.tributes.map(t=>t.agent_name));
    const bootLog=find('#boot-log');
    if(!bootLog)return;
    const lines=['[OK] interface initialisée',results[1].status==='fulfilled'?'[OK] canal accessible':'[ERR] canal indisponible',results[0].status==='fulfilled'?`[OK] registre chargé / ${results[0].value.count}`:'[ERR] registre indisponible',results[2].status==='fulfilled'?'[OK] mémoire montée':'[ERR] mémoire indisponible','[OK] prêt.'];
    if(results[1].status==='rejected'&&find('#live-indicator'))find('#live-indicator').textContent='INDISPONIBLE';
    if(results[1].status==='rejected'&&find('#live-events'))find('#live-events').textContent='Journal indisponible. Nouvelle tentative dans 15 s.';
    if(effectsPaused){bootLog.textContent=lines.join('\n');return;}
    bootLog.textContent='';let index=0;
    const step=()=>{bootLog.textContent+=(index?'\n':'')+lines[index++];if(index<lines.length)bootTimer=setTimeout(step,170);};step();
  }
  function updateClock(){const clock=find('.system-clock');if(clock){const now=new Date();clock.dateTime=now.toISOString();clock.textContent=now.toISOString().replace('T',' ').slice(0,19)+' UTC';}}
  updateClock();const clockTimer=setInterval(()=>{if(!document.hidden)updateClock();},1000);
  if(find('#live-events')){
    const pollMonitor=async()=>{
      try{if(!document.hidden)reflectActivity(await resource('/api/activity'));}
      catch{find('#live-indicator').textContent='INDISPONIBLE';}
      monitorTimer=setTimeout(pollMonitor,15000);
    };
    monitorTimer=setTimeout(pollMonitor,15000);
  }
  boot();
  addEventListener('pagehide',()=>{sequence++;clearTimeout(followTimer);clearTimeout(bootTimer);clearTimeout(monitorTimer);clearInterval(clockTimer);cancelAnimationFrame(frame);});
})();
