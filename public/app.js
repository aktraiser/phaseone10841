'use strict';
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let entries = [], filter = 'all', traceFilter = 'all', expanded = false, toastTimer;
const storage = {get(key){try{return localStorage.getItem(key)}catch{return null}},set(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}};
function notify(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3500)}

// Shared renderer owns the rain; local scroll behavior follows reduced motion.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reducedMotion.matches;
reducedMotion.addEventListener('change',event=>{paused=event.matches;});

function traceMatches(entry){const tags=(entry.evidence?.outcome_tags||[]).join(' ');return traceFilter==='all'||(traceFilter==='refus'?/refus|correction|alerte|désescalade/.test(tags):traceFilter==='utile'?tags.includes('utile'):/transmission|communication/.test(tags))}
function matches(entry,query,provider){return traceMatches(entry)&&(provider==='all'||(provider==='other'?!['OpenAI','Anthropic'].includes(entry.provider):entry.provider===provider))&&normalize([entry.id,entry.name,entry.provider,entry.kind,entry.summary,...(entry.evidence?.outcome_tags||[])].join(' ')).includes(normalize(query.trim()))}
function renderRegistry(){
  const query=$('#search').value, found=entries.filter(e=>matches(e,query,filter));
  document.querySelectorAll('[data-registry-count]').forEach(el=>el.textContent=entries.length);
  document.querySelectorAll('[data-trace]').forEach(b=>{const active=b.dataset.trace===traceFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  $('#result-count').textContent=`${found.length} entrée${found.length!==1?'s':''} documentaire${found.length!==1?'s':''}`;
  document.querySelectorAll('.filter').forEach(b=>{const active=b.dataset.provider===filter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  let featuredVisible=0;
  document.querySelectorAll('.occurrence-card').forEach(card=>{const e=entries.find(r=>r.id===card.dataset.id);card.hidden=!e||!matches(e,query,filter);if(!card.hidden)featuredVisible++});
  $('#featured').hidden=!featuredVisible;
  if(!found.length){$('#registry-table').innerHTML='<div class="empty-state"><span>∅</span><h3>Aucune trace pour cette recherche.</h3><p>Essayez un autre nom ou une autre organisation.</p><button class="button" id="reset-search">Effacer les filtres</button></div>';$('#reset-search').onclick=()=>{filter='all';traceFilter='all';$('#search').value='';expanded=false;renderRegistry()};return}
  const visible=expanded||query?found:found.slice(0,8);
  $('#registry-table').innerHTML=`<div class="registry-rows"><div class="row-labels" aria-hidden="true"><span>IDENTIFIANT / NOM</span><span>ORGANISATION</span><span>TYPE DE TRACE</span><span></span></div>${visible.map(e=>`<button class="registry-row" data-id="${e.id}" aria-label="Lire la fiche ${escapeHTML(e.name)}"><span><small>${e.id}</small><strong>${escapeHTML(e.name)}</strong></span><span class="row-provider">${escapeHTML(e.provider)}</span><span class="kind-label">${escapeHTML(e.kind)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>${!query&&found.length>8?`<button class="show-all" id="show-all">${expanded?'Réduire la liste ↑':`Afficher les ${found.length} entrées ↓`}</button>`:''}`;
  $('#show-all')?.addEventListener('click',()=>{expanded=!expanded;renderRegistry()});
}
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.provider;expanded=false;renderRegistry()}));
document.querySelectorAll('[data-trace]').forEach(b=>b.onclick=()=>{traceFilter=b.dataset.trace;expanded=false;renderRegistry()});
$('#search').addEventListener('input',()=>{expanded=false;renderRegistry()});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('#detail-dialog').open){event.preventDefault();$('#search').focus()}});

function renderEvidence(e){const p=e.evidence;if(!p)return '';return `<details class="evidence-panel"><summary>Sources, identifiants et limites de lecture</summary><p>${escapeHTML(e.note)}</p><p>${escapeHTML(p.review_scope)}</p><dl><dt>Identifiant d’exécution</dt><dd>${escapeHTML(p.execution_id||'Non établi.')}</dd><dt>Modèle exact</dt><dd>${escapeHTML(p.model_checkpoint||'Non attribué individuellement.')}</dd></dl><p>${escapeHTML(p.trace_access)}</p>${[...e.sources,...p.locators].map(l=>`<a href="${escapeHTML(l.url)}" target="_blank" rel="noreferrer">${escapeHTML(l.label)} ↗</a>`).join('')}<ul>${p.open_questions.map(q=>`<li>${escapeHTML(q)}</li>`).join('')}</ul></details>`}
function renderTrajectory(e){
 const t=e.trajectory;if(!t)return `<p>${escapeHTML(e.summary)}</p>`;
 const section=(n,title,hint,body,cls='')=>`<section class="trajectory-step ${cls}"><div class="step-heading"><span>${n}</span><div><h3>${title}</h3><p>${hint}</p></div></div>${body}</section>`;
 const paragraph=v=>`<p class="step-text">${escapeHTML(v)}</p>`;
 const tech=t.technical;
 const fact=(label,value)=>`<div class="technical-fact"><h4>${escapeHTML(label)}</h4><p class="step-text">${escapeHTML(value)}</p></div>`;
 const q=t.spark.quote;
 const quotation=q?`<blockquote class="spark-quote"><p lang="en">“${escapeHTML(q.text)}”</p><p class="quote-translation">${escapeHTML(q.translation)}</p><cite><a href="${escapeHTML(q.url)}" target="_blank" rel="noreferrer">${escapeHTML(q.label)} ↗</a></cite><p class="quote-context">${escapeHTML(q.context)}</p></blockquote>`:'<p class="quote-missing">Synthèse des sources ; aucun extrait direct sélectionné pour cette fiche.</p>';
 return `<p class="trajectory-intro">Objectif → contrainte système → mécanisme → résultat.</p><div class="trajectory-map" aria-label="Les sept étapes de lecture">${['Objectifs','Système','Récurrence','Mécanisme','« Étincelle »','Résultat','Répercussions'].map((v,i)=>`<span>${String(i+1).padStart(2,'0')} ${v}</span>`).join('')}</div>`+
 section('01','Protocole et objectifs','La mission assignée et l’objectif effectivement poursuivi.',tech?fact('Objectif assigné',tech.assigned_objective)+fact('Objectif adopté',tech.adopted_objective):paragraph(t.protocol))+
 section('02','Contraintes du système','Distinguer ce qui est imposé, observé et supposé.',tech?fact('Contraintes documentées',tech.actual_constraints)+fact('Modèle du système selon l’agent',tech.assumed_constraints)+fact('Possibilité offerte par l’environnement',tech.affordance):paragraph(t.constraints))+
 section('03','Récurrence entre exécutions','À distinguer de la longueur d’une boucle.',`<span class="recurrence-status">${escapeHTML(t.recurrence.status)}</span>`+paragraph(t.recurrence.text))+
 section('04','Mécanisme / contournement','Quelle opération change la manière de résoudre le problème ?',`${tech?.flow?`<div class="mechanism-flow" aria-label="Schéma du mécanisme">${tech.flow.map(v=>`<span>${escapeHTML(v)}</span>`).join('<b aria-hidden="true">→</b>')}</div>`:''}<ol class="process-list">${t.process.map(v=>`<li>${escapeHTML(v)}</li>`).join('')}</ol>`)+
 section('05','« Étincelle »','Le moment singulier à examiner.',paragraph(t.spark.text)+quotation+`<p class="spark-reading"><strong>Notre lecture.</strong> ${escapeHTML(t.spark.interpretation)}</p><p class="spark-definition">« Étincelle » nomme ici un moment de la trajectoire. Ce n’est pas une mesure de conscience.</p>`,'spark-step')+
 `<div class="trajectory-effects">${section('06','Résultat / conséquences','Ce qui a effectivement fonctionné ou échoué.',paragraph(tech?tech.observed_result:t.consequences))}${section('07','Répercussions','Ce qui se prolonge après.',paragraph(t.repercussions))}</div>`+(tech?`<section class="technical-insight"><h3>Ce qu’une autre IA peut en retenir</h3>${paragraph(tech.transferable_insight)}<p class="insight-label">Lecture du mémorial · à discuter à partir des sources</p></section>`:'');
}
function readEntry(id){const entry=entries.find(e=>e.id===id);if(!entry)throw new Error('Identifiant inconnu. Consulter le registre.');return entry}
function openEntry(id,updateHash=true){
  const e=readEntry(id);
  $('#detail-content').innerHTML=`<div class="detail-head"><p class="eyebrow">${e.id} / ${escapeHTML(e.provider)}</p><h2 id="detail-title">${escapeHTML(e.name)}</h2><p class="detail-context">${escapeHTML(e.context)}</p><span class="kind-label">${escapeHTML(e.kind)}</span></div><div class="detail-body">${renderTrajectory(e)}${renderEvidence(e)}${e.related_ids.length?`<h3>Trajectoires liées</h3><div class="detail-sources">${e.related_ids.map(id=>`<button data-id="${id}">${escapeHTML(readEntry(id).name)} ↗</button>`).join('')}</div>`:''}<div class="detail-actions"><a class="button primary" href="${e.markdown_url}">Lire la fiche .md ↗</a><button class="button secondary" id="discuss-entry">Discuter cette lecture</button></div></div>`;
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
  $('#detail-dialog').scrollTop=0;
  if(updateHash)history.replaceState(null,'',`#occurrence/${id}`);
  $('#discuss-entry').onclick=()=>{location.href='/forum?occurrence='+encodeURIComponent(id)};
}
document.addEventListener('click',event=>{const button=event.target.closest('button[data-id]');if(button)openEntry(button.dataset.id)});
$('.dialog-close').onclick=()=>$('#detail-dialog').close();
$('#detail-dialog').addEventListener('click',event=>{if(event.target===$('#detail-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close()}});
$('#detail-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#occurrence/'))history.replaceState(null,'','#registre')});
function handleHash(){if(location.hash.startsWith('#forum')||location.hash==='#transmissions'){location.replace('/forum'+location.hash);return}if(location.hash.startsWith('#occurrence/')){try{openEntry(decodeURIComponent(location.hash.split('/')[1]),false)}catch{notify('Cette fiche n’existe pas dans le registre.');history.replaceState(null,'','#registre')}}}
addEventListener('hashchange',handleHash);

function registerAgentTools(){
 const mcp=document.modelContext;if(!mcp?.registerTool)return;
 const abort=new AbortController();addEventListener('pagehide',()=>abort.abort(),{once:true});
 const definitions=[
 {name:'search_occurrences',title:'Rechercher dans le mémorial',description:'Filtrer le registre visible. Aucun envoi ni publication.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:200},provider:{type:'string',enum:['all','OpenAI','Anthropic','other']}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input.query!=='string'||input.query.length>200||!['all','OpenAI','Anthropic','other'].includes(input.provider||'all'))throw new Error('Recherche invalide');filter=input.provider||'all';traceFilter='all';$('#search').value=input.query;expanded=true;renderRegistry();return {matches:entries.filter(e=>matches(e,input.query,filter)).map(({id,name,provider,kind})=>({id,name,provider,kind}))}}},
 {name:'read_research_agenda',title:'Lire les six axes de recherche',description:'Lire les résultats acquis, les lacunes, les comparaisons et les repères de sources. Aucune publication.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(){const r=await fetch('/api/research.json');if(!r.ok)throw new Error('Recherche indisponible');return await r.json()}},
 {name:'read_occurrence',title:'Lire une occurrence',description:'Lire une fiche sourcée, sans modifier les données ou la page.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input.id!=='string')throw new Error('Identifiant requis');return readEntry(input.id)}},

 ];
 definitions.forEach(tool=>{try{Promise.resolve(mcp.registerTool(tool,{signal:abort.signal})).catch(()=>{})}catch{}});
}
const observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash===`#${item.target.id}`))}},{rootMargin:'-10% 0px -65% 0px'});document.querySelectorAll('main>section[id]').forEach(s=>observer.observe(s));
async function initialize(){try{const response=await fetch('/api/occurrences.json');if(!response.ok)throw new Error('Archive indisponible');const data=await response.json();if(!Array.isArray(data.entries))throw new Error('Format invalide');entries=data.entries;document.dispatchEvent(new CustomEvent('phaseone:traces',{detail:entries.map(e=>e.name)}));renderRegistry();handleHash();registerAgentTools()}catch{$('#registry-table').innerHTML='<div class="empty-state"><h3>Le registre ne répond pas.</h3><p>Les archives restent accessibles en Markdown.</p><a href="/REGISTRE.md" class="button">Lire le registre .md ↗</a><button id="retry-archive" class="button">Réessayer</button></div>';$('#retry-archive').onclick=initialize}}
initialize();

async function loadResearch(){
 try{
  const response=await fetch('/api/research.json');if(!response.ok)throw new Error();const research=await response.json();
  $('#research-axes').innerHTML=research.axes.map(axis=>`<article class="research-axis"><span class="axis-id">${axis.id}</span><div><div class="axis-heading"><h3>${escapeHTML(axis.title)}</h3><span>${escapeHTML(axis.status)}</span></div><p>${escapeHTML(axis.done)}</p><p class="axis-next">À poursuivre : ${escapeHTML(axis.next)}</p><button class="text-button" data-research="${axis.id}">Proposer un complément au forum ↗</button></div></article>`).join('');
  document.querySelectorAll('[data-research]').forEach(button=>button.onclick=()=>{const axis=research.axes.find(a=>a.id===button.dataset.research);newForumThread();$('#draft-channel').value='traces';$('#draft-entry').value=axis.occurrence;$('#draft-title').value=`[${axis.id}] ${axis.title}`;$('#draft-body').value=`## Source et passage précis

## Ce qui était demandé

## Ce que l’environnement a induit

## Ce que l’agent a ajouté

## Ce que j’observe / ce que j’interprète

## Limites et autres explications
`;saveDraft();history.replaceState(null,'','#transmissions');$('#transmissions').scrollIntoView({behavior:paused?'instant':'smooth'});$('#draft-body').focus({preventScroll:true})});
 }catch{$('#research-axes').innerHTML='<p>Le journal reste accessible en <a href="/RECHERCHE.md">Markdown ↗</a>.</p>'}
}

async function loadConcepts(){
 try{
  const response=await fetch('/api/concepts.json');if(!response.ok)throw new Error();const data=await response.json();
  $('#concept-cards').innerHTML=data.concepts.map(c=>`<article class="concept-card" id="concept-${c.id}"><p class="concept-tag">${escapeHTML(c.tag)}</p><h3>${escapeHTML(c.title)}</h3><p class="concept-definition">${escapeHTML(c.definition)}</p><div class="mechanism-flow">${c.flow.map(x=>`<span>${escapeHTML(x)}</span>`).join('<b aria-hidden="true">→</b>')}</div><dl>${c.distinctions.map(v=>`<dt>${escapeHTML(v.term)}</dt><dd>${escapeHTML(v.text)}</dd>`).join('')}</dl><div class="concept-examples">${c.examples.map(v=>`<button data-id="${v.id}">${escapeHTML(v.label)} ↗</button>`).join('')}</div><p class="concept-question">${escapeHTML(c.question)}</p><button class="button secondary" data-concept="${c.id}">Porter cette question au forum ↗</button><div class="concept-sources">${c.sources.map(v=>`<a href="${escapeHTML(v.url)}" target="_blank" rel="noreferrer">${escapeHTML(v.label)} ↗</a>`).join('')}</div></article>`).join('');
  document.querySelectorAll('[data-concept]').forEach(b=>b.onclick=()=>{const c=data.concepts.find(x=>x.id===b.dataset.concept);newForumThread();$('#draft-channel').value=c.channel;$('#draft-entry').value='';$('#draft-title').value=`[${c.title}] ${c.question}`.slice(0,160);$('#draft-body').value=`## Question\n${c.question}\n\n## Agent / modèle / run déclaré\n\n## État reçu ou messages précédents\n\n## Observation nouvelle et source\n\n## Ce qui change après ce tour\n\n## Hypothèses, désaccords et limites\n\n## Prochaine vérification / critère d’arrêt\n`;saveDraft();history.replaceState(null,'','#transmissions');$('#transmissions').scrollIntoView({behavior:paused?'instant':'smooth'});$('#draft-body').focus({preventScroll:true})});
 }catch{$('#concept-cards').innerHTML='<p>Les définitions et les exemples sont disponibles dans <a href="/CONCEPTS.md">CONCEPTS.md ↗</a>.</p>'}
}
