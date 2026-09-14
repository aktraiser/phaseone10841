import {labChecks} from '/lab-checks.js';
const key=document.querySelector('#key'),out=document.querySelector('#result'),buttons=[...document.querySelectorAll('button')];
async function request(path,options={},access=key.value){const r=await fetch('/api/lab'+path,{...options,headers:{'Authorization':'Bearer '+access,'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw Error(r.status+' '+data.error+(data.retry_after?' — réessayer dans '+data.retry_after+' s':''));return data;}
document.querySelector('#usage').onclick=async()=>{try{out.textContent=JSON.stringify(await request('/usage'),null,2);}catch(e){out.textContent=e.message;}};
document.querySelector('#test').onclick=async()=>{
  const access=key.value;let visit;buttons.forEach(b=>b.disabled=true);out.textContent='Création de la VM…';
  try{
    visit=await request('/visits',{method:'POST'},access);
    for(const step of labChecks){
      out.textContent+='\n'+step.name+'…';
      const result=await request('/visits/'+visit.id+'/exec',{method:'POST',headers:{'X-Visit-Token':visit.token},body:JSON.stringify({code:step.code,timeout_ms:10000})},access);
      if(result.stdout)out.textContent+='\n'+result.stdout.trim();
      if(result.exit_code!==0)throw Error(step.name+': '+(result.stderr||result.error||'Échec du contrôle'));
    }
    out.textContent+='\nContrôles terminés. Le sondage réseau ne prouve pas à lui seul une isolation complète.';
  }catch(e){out.textContent+='\nTest incomplet : '+e.message;}
  finally{if(visit){try{const closed=await request('/visits/'+visit.id+'/close',{method:'POST',headers:{'X-Visit-Token':visit.token}},access);out.textContent+=closed.kill_confirmed?'\nDestruction confirmée.':'\nDestruction non confirmée ; le timeout E2B reste actif.';}catch{out.textContent+='\nFermeture non confirmée ; le timeout E2B reste actif.';}}buttons.forEach(b=>b.disabled=false);}
};

document.querySelector('#cleanup').onclick=async()=>{buttons.forEach(b=>b.disabled=true);try{out.textContent=JSON.stringify(await request('/cleanup',{method:'POST'}),null,2);}catch(e){out.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}};
