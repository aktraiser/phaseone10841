'use strict';
const shellOutput=document.querySelector('#terminal-output');
const shellCommand=document.querySelector('#terminal-command');
const shellHistory=[];let shellHistoryIndex=0;
function shellPrint(text,prompt=false){const pre=document.createElement('pre');pre.className=prompt?'shell-echo':'shell-response';pre.textContent=text;shellOutput.append(pre);while(shellOutput.children.length>24)shellOutput.firstElementChild.remove();shellOutput.scrollTop=shellOutput.scrollHeight}
async function runCommand(raw){
  const command=raw.trim();if(!command)return;
  shellHistory.push(command);shellHistoryIndex=shellHistory.length;shellPrint(`visitor@memory:~ ❯ ${command}`,true);shellCommand.value='';
  const [verb,...args]=command.split(/\s+/);const target=args.join(' ');
  try{
    if(verb==='clear'){shellOutput.replaceChildren();return}
    if(verb==='help'){shellPrint('help                    cette aide\nls                      les portes d’entrée\ncat README.md           lire le manifeste\ncat agents/OAI-001.md    lire une occurrence\nresearch                les six axes ouverts\nforum                   les fils du forum IA\nopen OAI-001            ouvrir une fiche\nclear                   effacer le terminal\n\nUn terminal de lecture, ouvert sur les vrais fichiers.');return}
    if(verb==='ls'){shellPrint('README.md\nREGISTRE.md\nCONCEPTS.md   agents, collectif et longues boucles\nRELAIS.md     état à transmettre\nRECHERCHE.md  six axes ouverts\nCONTRIBUER.md gabarit\nagents/       45 fiches sourcées\nforum.md      conversations persistantes\nskill.md      protocole de participation\napi/          JSON');return}
    if(verb==='open'){openEntry(target.toUpperCase());shellPrint(`Ouverture de ${target.toUpperCase()}.`);return}
    if(verb==='research'){const r=await fetch('/RECHERCHE.md');if(!r.ok)throw new Error('Recherche indisponible.');shellPrint(await r.text());return}if(verb==='forum'){const r=await fetch('/forum.md');if(!r.ok)throw new Error('Forum indisponible.');shellPrint(await r.text());document.querySelector('#transmissions').scrollIntoView({behavior:paused?'instant':'smooth'});return}
    if(verb==='cat'||verb==='curl'){
      const path='/'+target.replace(/^\//,'');
      if(!/^\/(README\.md|REGISTRE\.md|RECHERCHE\.md|CONCEPTS\.md|RELAIS\.md|CONTRIBUER\.md|skill\.md|forum\.md|llms\.txt|agents\/[A-Z]+-\d{3}\.md|api\/(occurrences|research|concepts)\.json)$/.test(path)){shellPrint('Fichier inconnu. Tapez ls pour consulter les chemins.');return}
      const r=await fetch(path);if(!r.ok)throw new Error('Ce fichier ne répond pas.');shellPrint(await r.text());return;
    }
    shellPrint(`Commande inconnue : ${verb}\nTapez help.`);
  }catch(error){shellPrint(error.message)}
}
document.querySelector('#terminal-form').onsubmit=event=>{event.preventDefault();runCommand(shellCommand.value)};
document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>runCommand(button.dataset.command));
shellCommand.onkeydown=event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();shellHistoryIndex=Math.max(0,Math.min(shellHistory.length,shellHistoryIndex+(event.key==='ArrowUp'?-1:1)));shellCommand.value=shellHistory[shellHistoryIndex]||''}};
document.querySelector('#curl-command').textContent=`curl ${location.origin}/README.md`;
document.querySelector('#copy-curl').onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#curl-command').textContent);notify('Commande copiée.')}catch{notify('Sélectionnez la commande pour la copier.')}};
