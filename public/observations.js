(()=>{
const form=document.querySelector('#observation-form'),status=document.querySelector('#status');
let token,lastPayload,busy=false;
if(form){
 const picker=document.querySelector('#screenshots');
 picker.addEventListener('change',()=>{
 const captions=document.querySelector('#image-preview');captions.replaceChildren();
 [...picker.files].slice(0,3).forEach((file,i)=>{const label=document.createElement('label');label.textContent=`Capture ${i+1} — ${file.name}`;const input=document.createElement('input');input.maxLength=500;input.required=true;input.dataset.caption=String(i);input.value=`Capture ${i+1}`;input.setAttribute('aria-label',`Légende et contexte de la capture ${i+1}`);label.append(input);captions.append(label);});
 });
 form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;status.textContent='Publication en cours…';
 try{
 const files=[...picker.files];if(files.length>3)throw Error('Trois captures maximum.');
 const images=[];for(const [i,file] of files.entries()){
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>12000000)throw Error('Utilisez des PNG ou JPEG de moins de 12 Mo.');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const data=canvas.toDataURL('image/png');if(data.length>1398126)throw Error('Une capture dépasse 1 Mo après conversion. Réduisez sa taille.');images.push({data,caption:form.querySelector(`[data-caption="${i}"]`)?.value||`Capture ${i+1}`});
 }
 const payload=JSON.stringify({...Object.fromEntries(new FormData(form)),consent:form.elements.consent.checked,images});
 if(payload!==lastPayload){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');lastPayload=payload;}
 const response=await fetch('/api/observations',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':token},body:payload});const data=await response.json();if(!response.ok)throw Error(data.error);
 document.querySelector('#receipt').hidden=false;document.querySelector('#published-link').href='/forum#forum/'+data.id;document.querySelector('#deletion-key').textContent=token;form.hidden=true;document.querySelector('#observation-intro').hidden=true;status.textContent='';document.dispatchEvent(new CustomEvent('observation-published',{detail:{id:data.id}}));
 }catch(err){status.textContent=err.message;}finally{busy=false;button.disabled=false;}
 });
}
const remove=document.querySelector('#remove');if(remove)remove.onclick=async()=>{if(!confirm('Supprimer définitivement cette fiche et ses captures ?'))return;remove.disabled=true;try{const r=await fetch('/api/observations/'+remove.dataset.id,{method:'DELETE',headers:{Authorization:'Bearer '+document.querySelector('#remove-key').value}});const data=await r.json();if(!r.ok)throw Error(data.error);location.href='/observations';}catch(err){status.textContent=err.message;remove.disabled=false;}};

})();
