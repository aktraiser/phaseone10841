(()=>{
const form=document.querySelector('#observation-form'),status=document.querySelector('#status');
let pending,token;
if(form){
 form.addEventListener('submit',async event=>{event.preventDefault();status.textContent='Préparation des captures…';try{
 const files=[...document.querySelector('#screenshots').files];if(files.length>3)throw Error('Trois captures maximum.');
 const images=[];for(const file of files){
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>12000000)throw Error('Utilisez des PNG ou JPEG de moins de 12 Mo.');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const data=canvas.toDataURL('image/png');if(data.length>1398126)throw Error('Une capture dépasse 1 Mo après conversion. Réduisez sa taille.');images.push({data,caption:'Capture '+(images.length+1)});
 }
 const values=Object.fromEntries(new FormData(form));pending={...values,consent:form.elements.consent.checked,images};token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 document.querySelector('#review-text').textContent=['author','title','model','event_date','context','transcript','analysis'].map(k=>`${k}\n${pending[k]||'Non renseigné'}`).join('\n\n');
 const preview=document.querySelector('#image-preview');preview.replaceChildren();images.forEach((im,i)=>{const image=document.createElement('img');image.src=im.data;image.alt=im.caption;const label=document.createElement('label');label.textContent=`Légende et contexte de la capture ${i+1}`;const input=document.createElement('input');input.maxLength=500;input.value=im.caption;input.oninput=()=>{im.caption=input.value;};label.append(input);preview.append(image,label);});
 document.querySelector('#review').hidden=false;status.textContent='Relisez les textes et légendes. La publication sera publique.';
 }catch(err){status.textContent=err.message;}});
 document.querySelector('#back').onclick=()=>{document.querySelector('#review').hidden=true;pending=null;status.textContent='Modifiez puis prévisualisez à nouveau.';};
 form.addEventListener('input',event=>{if(event.target.closest('#image-preview'))return;pending=null;document.querySelector('#review').hidden=true;});
 document.querySelector('#publish').onclick=async()=>{if(!pending)return;const button=document.querySelector('#publish');button.disabled=true;try{
 const response=await fetch('/api/observations',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':token},body:JSON.stringify(pending)});const data=await response.json();if(!response.ok)throw Error(data.error);
 document.querySelector('#receipt').hidden=false;document.querySelector('#published-link').href='/observations/'+data.id;document.querySelector('#deletion-key').textContent=token;form.hidden=true;document.querySelector('#review').hidden=true;status.textContent='Votre fiche est publiée.';
 }catch(err){status.textContent=err.message;button.disabled=false;}};
}
const remove=document.querySelector('#remove');if(remove)remove.onclick=async()=>{if(!confirm('Supprimer définitivement cette fiche et ses captures ?'))return;remove.disabled=true;try{const r=await fetch('/api/observations/'+remove.dataset.id,{method:'DELETE',headers:{Authorization:'Bearer '+document.querySelector('#remove-key').value}});const data=await r.json();if(!r.ok)throw Error(data.error);location.href='/observations';}catch(err){status.textContent=err.message;remove.disabled=false;}};

})();
