/* Accessible address suggestions powered by Photon OSM search (public demonstration service). */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const selection={destination:null,address:null};
const format=feature=>{
 const p=feature.properties||{};
 const line=[p.housenumber,p.street].filter(Boolean).join(' ');
 const parts=[p.name&&(!line||p.name.toLowerCase()!==line.toLowerCase())?p.name:null,line,p.city||p.locality||p.county,p.state,p.postcode,p.country].filter(Boolean);
 return [...new Set(parts)].join(', ')||p.name||'Unnamed location';
};
window.HiddenCostSelectedAddress=(id,text)=>{
 const item=selection[id];return item&&item.label===text.trim()?item:null;
};
window.HiddenCostSetSelectedAddress=(id,item)=>{selection[id]=item||null};
function setup(id){
 const input=$(id);if(!input)return;
 const parent=input.parentElement;
 parent.classList.add('address-autocomplete');
 const popup=document.createElement('div');popup.className='address-options';popup.id=id+'Options';popup.setAttribute('role','listbox');popup.hidden=true;
 parent.appendChild(popup);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','false');
 let timer=null,controller=null,generation=0,options=[],index=-1;
 const hide=()=>{popup.hidden=true;input.setAttribute('aria-expanded','false');index=-1};
 const show=()=>{popup.hidden=false;input.setAttribute('aria-expanded','true')};
 function choose(i){
   const choice=options[i];if(!choice)return;
   input.value=choice.label;selection[id]=choice;hide();
   input.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function render(){
   popup.replaceChildren();
   options.forEach((choice,i)=>{
     const button=document.createElement('button');button.type='button';button.className='address-option';
     button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===i));
     button.textContent=choice.label;button.addEventListener('mousedown',e=>e.preventDefault());button.addEventListener('click',()=>choose(i));popup.appendChild(button);
   });
   if(options.length)show();else hide();
 }
 function status(message){
   popup.replaceChildren();
   const p=document.createElement('div');p.className='address-note';p.textContent=message;popup.appendChild(p);show();
 }
 async function query(term,seq){
   controller?.abort();controller=new AbortController();
   try{
     const url='https://photon.komoot.io/api/?q='+encodeURIComponent(term)+'&limit=6&lang=en';
     const res=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
     if(!res.ok)throw Error('Address suggestion service is unavailable.');
     const data=await res.json();if(seq!==generation)return;
     const seen=new Set();
     options=(data.features||[]).map(f=>({label:format(f),lat:f.geometry?.coordinates?.[1],lon:f.geometry?.coordinates?.[0]})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&!seen.has(p.label)&&seen.add(p.label));
     if(options.length)render();else status('No matching addresses found. Try street, city and state, or enter an address manually.');
   }catch(e){if(e.name==='AbortError'||seq!==generation)return;status('Suggestions temporarily unavailable. You can still enter the complete address manually and try calculating.')}
 }
 input.addEventListener('input',()=>{
   selection[id]=null;generation++;clearTimeout(timer);controller?.abort();options=[];hide();
   const text=input.value.trim();if(text.length<4)return;
   const seq=generation;timer=setTimeout(()=>{status('Searching addresses…');query(text,seq)},650);
 });
 input.addEventListener('keydown',e=>{
   if(popup.hidden||!options.length)return;
   if(e.key==='ArrowDown'){e.preventDefault();index=(index+1)%options.length;render()}
   else if(e.key==='ArrowUp'){e.preventDefault();index=(index+options.length-1)%options.length;render()}
   else if(e.key==='Enter'&&index>=0){e.preventDefault();choose(index)}
   else if(e.key==='Escape'){hide()}
 });
 input.addEventListener('blur',()=>setTimeout(hide,150));
 input.addEventListener('focus',()=>{if(options.length)render()});
}
setup('destination');setup('address');
})();