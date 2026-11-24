/* HiddenCost educational MVP commute features. User-triggered only. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const getEntries=()=>typeof window.HiddenCostGetEntries==='function'?window.HiddenCostGetEntries():[];
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
let map=null,routeLayer=null,markers=null,busy=false,geoLast=0,routeLast=0;
const geocache=new Map(),routes=new Map();
function budget(){
 const raw=$('monthlyBudget')?.value?.trim()||'';
 const val=raw?Number(raw):0;return Number.isFinite(val)&&val>0&&val<1e8?val:null;
}
function route(a){const r=routes.get(a.id);return r&&r.address===String(a.address||'').trim()&&r.destination===$('destination').value.trim()?r:null}
function shortest(){
 const completed=getEntries().map(a=>({a,r:route(a)})).filter(x=>x.r).sort((x,y)=>x.r.miles-y.r.miles);
 return completed;
}
function effective(a){const num=v=>Number.isFinite(Number(v))&&v!==null&&v!==undefined?Number(v):0;
 const m=num(a.months)||12;return Math.max(0,(num(a.rent)+num(a.parking)+num(a.utilities)+num(a.internet)+num(a.fees))*m+num(a.once)-num(a.concession))/m;
}
function refresh(){
 const apartments=getEntries(),sel=$('commuteApartment');if(!sel)return;
 const selected=sel.value;
 sel.innerHTML=apartments.length?apartments.map(a=>'<option value="'+escapeHTML(a.id)+'">'+escapeHTML(a.name)+(a.address?'':' (address needed)')+'</option>').join(''):'<option value="">No apartments</option>';
 sel.value=apartments.find(a=>a.id===selected)?.id||apartments[0]?.id||'';
 const b=budget(),affordable=apartments.filter(a=>effective(a)<=b);
 $('budgetSummary').textContent=b===null?'Optional: enter a maximum effective monthly housing cost.':affordable.length+' of '+apartments.length+' apartments have an estimated cost within '+currency(b)+'/month (unconfirmed charges can change this).';
 const cards=$('cards')?.querySelectorAll('.compact-apt')||[];
 cards.forEach((card,i)=>{
   const a=apartments[i];if(!a)return;
   card.classList.remove('within-budget','over-budget');
   const badge=card.querySelector('.budget-label');if(badge)badge.remove();
   if(b!==null){
     const fits=effective(a)<=b;card.classList.add(fits?'within-budget':'over-budget');
     const tag=document.createElement('span');tag.className='budget-label';tag.textContent=fits?' ✓ In budget':' Over budget';tag.style.cssText='font-size:11px;font-weight:750;color:'+(fits?'#087c70':'#b54734');
     card.querySelector('.compact-apt-meta')?.appendChild(tag);
   }
   const old=card.querySelector('.commute-label');if(old)old.remove();
   const current=route(a);if(current){
     const tag=document.createElement('span');tag.className='commute-label';tag.textContent=' · '+current.miles.toFixed(1)+' mi drive';tag.style.cssText='font-size:11px;color:#087f79';
     card.querySelector('.compact-apt-meta')?.appendChild(tag);
   }
 });
 const ranked=shortest();
 $('commuteRanking').innerHTML=ranked.length?'<strong>Shortest measured driving commutes:</strong><ol style="margin:5px 0;padding-left:21px">'+ranked.map(x=>'<li>'+escapeHTML(x.a.name)+': <strong>'+x.r.miles.toFixed(1)+' miles</strong> · '+Math.round(x.r.minutes)+' minutes</li>').join('')+'</ol><small>'+ranked.length+' of '+apartments.length+' routes measured. Unmeasured apartments are not ranked.</small>':'No commute routes measured yet. Calculate each apartment separately to build the ranking.';
 $('commuteInsight').innerHTML=ranked.length?'<strong>Shortest measured commute:</strong> '+escapeHTML(ranked[0].a.name)+' · '+ranked[0].r.miles.toFixed(1)+' miles. <small>Only calculated routes included.</small>':'<strong>Commute insight:</strong> Add street addresses and calculate driving routes to compare locations.';
}
function initMap(){
 if(map||!window.L)return;
 map=L.map('commuteMap').setView([39.5,-98.35],4);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map);
 markers=L.layerGroup().addTo(map);
}
async function throttle(kind){
 const now=Date.now(),old=kind==='geo'?geoLast:routeLast;
 const delay=Math.max(0,1100-(now-old));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 if(kind==='geo')geoLast=Date.now();else routeLast=Date.now();
}
async function geocode(address){
 const key=address.trim().toLowerCase();if(geocache.has(key))return geocache.get(key);
 await throttle('geo');
 const res=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(address),{headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('Address lookup unavailable ('+res.status+').');
 const list=await res.json();if(!list.length)throw Error('Address not found. Try the full street address, city and state.');
 const p={lat:Number(list[0].lat),lon:Number(list[0].lon)};if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))throw Error('Invalid map coordinates.');
 geocache.set(key,p);return p;
}
async function calculate(){
 if(busy)return;const a=getEntries().find(x=>x.id===$('commuteApartment').value),dest=$('destination').value.trim();
 if(!a||!a.address||a.address.trim().length<7){$('commuteStatus').textContent='Edit the apartment and add its full street address before calculating.';return}
 if(dest.length<7){$('commuteStatus').textContent='Enter the full workplace or college street address.';return}
 busy=true;$('calculateCommute').disabled=true;$('commuteStatus').textContent='Locating addresses and calculating a driving route…';
 try{
   const from=await geocode(a.address),to=await geocode(dest);await throttle('route');
   const url='https://routing.openstreetmap.de/routed-car/route/v1/driving/'+from.lon+','+from.lat+';'+to.lon+','+to.lat+'?overview=full&geometries=geojson';
   const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw Error('Routing service unavailable ('+response.status+').');
   const json=await response.json();if(json.code!=='Ok'||!json.routes?.length)throw Error('No driving route found.');
   const result=json.routes[0],miles=result.distance/1609.344,minutes=result.duration/60;
   routes.set(a.id,{address:a.address.trim(),destination:dest,miles,minutes});
   initMap();if(map){
     if(routeLayer)map.removeLayer(routeLayer);markers.clearLayers();
     L.marker([from.lat,from.lon]).addTo(markers).bindPopup(escapeHTML(a.name));
     L.marker([to.lat,to.lon]).addTo(markers).bindPopup('Workplace / college');
     routeLayer=L.geoJSON(result.geometry,{style:{color:'#087f79',weight:5}}).addTo(map);
     map.fitBounds(routeLayer.getBounds().pad(.16));
   }
   $('commuteStatus').textContent=a.name+': '+miles.toFixed(1)+' miles · about '+Math.round(minutes)+' minutes by car without traffic.';
   refresh();
 }catch(e){$('commuteStatus').textContent='Could not calculate commute: '+e.message+'. Rental comparison is still available.'}
 finally{busy=false;$('calculateCommute').disabled=false;}
}
function setup(){
 if(!$('commuteApartment'))return;
 try{$('monthlyBudget').value=localStorage.getItem('hiddencost-budget')||'';$('destination').value=localStorage.getItem('hiddencost-destination')||''}catch{}
 $('monthlyBudget').addEventListener('input',()=>{try{localStorage.setItem('hiddencost-budget',$('monthlyBudget').value)}catch{}refresh()});
 $('destination').addEventListener('change',()=>{try{localStorage.setItem('hiddencost-destination',$('destination').value.trim())}catch{}refresh()});
 $('calculateCommute').addEventListener('click',calculate);
 window.HiddenCostExtraRefresh=refresh;initMap();refresh();
}
setup();
})();