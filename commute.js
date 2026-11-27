/* HiddenCost commute comparison: user-requested routing; no map and no tracking. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const all=()=>typeof window.HiddenCostGetEntries==='function'?window.HiddenCostGetEntries():[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const val=n=>n==null?0:Number(n)||0;
const effective=a=>typeof window.HiddenCostEffective==='function'?window.HiddenCostEffective(a):Math.max(0,(val(a.rent)+val(a.parking)+val(a.utilities)+val(a.internet)+val(a.fees))*Math.max(1,val(a.months))+val(a.once)-val(a.concession))/Math.max(1,val(a.months));
const leaseMonths=a=>typeof window.HiddenCostLeaseMonths==='function'?window.HiddenCostLeaseMonths(a):val(a.months);
const termTotal=a=>typeof window.HiddenCostTermTotal==='function'?window.HiddenCostTermTotal(a):effective(a)*leaseMonths(a);
const routeData=new Map(),geocodeCache=new Map();
let requestsAt=0,routeBusy=false,refreshing=false;let filters={budget:false,complete:false,commute:false};
function budget(){
 const text=$('monthlyBudget').value.trim();const amount=Number(text);
 return text&&Number.isFinite(amount)&&amount>0&&amount<1e8?amount:null;
}
function route(a){
 const found=routeData.get(a.id);
 return found&&found.address===String(a.address||'').trim()&&found.destination===$('destination').value.trim()?found:null;
}
function sortedRoutes(){
 return all().map(a=>({a,r:route(a)})).filter(x=>x.r&&x.r.car).sort((x,y)=>x.r.car.miles-y.r.car.miles);
}

function visibleApts(){
 const b=budget();
 return all().filter(a=>{
   if(filters.budget&&(b===null||effective(a)>b))return false;
   if(filters.complete&&['parking','utilities','internet','fees','once','deposit'].some(k=>a[k]===null||a[k]===undefined))return false;
   if(filters.commute&&!route(a)?.car)return false;
   return true;
 });
}
function renderFilteredView(){
 const selected=new Set(visibleApts().map(a=>a.id)),arr=all();
 const count=selected.size;
 $('filterCount').textContent='Showing '+count+' of '+arr.length+' apartments';
 $('clearFilters').hidden=!Object.values(filters).some(Boolean);
 const cards=$('cards');
 if(cards){
   cards.querySelectorAll('.compact-apt').forEach((el,i)=>{if(arr[i])el.hidden=!selected.has(arr[i].id)});
   let empty=cards.querySelector('#filterEmpty');
   if(empty)empty.remove();
   if(count===0&&arr.length){
     empty=document.createElement('div');empty.id='filterEmpty';empty.className='filter-no-match';
     empty.textContent='No apartments match these filters. Try clearing a filter or updating the apartment information.';
     cards.prepend(empty);
   }
 }
 const table=$('comparison')?.querySelector('table');
 if(table){
   const shown=arr.map(a=>selected.has(a.id));
   table.querySelectorAll('tr').forEach(row=>{
     Array.from(row.children).forEach((cell,i)=>{if(i>0)cell.hidden=!shown[i-1]});
   });
   const header=table.querySelector('thead tr');
   if(header){let note=$('filterTableNote');note?.remove();if(count===0){note=document.createElement('p');note.id='filterTableNote';note.className='subtle';note.textContent='No matching apartments — clear filters to see the comparison.';table.before(note)}}
 }
}
function setFilters(){
 if($('filterBudget').checked&&budget()===null){
   $('filterBudget').checked=false;
   $('filterCount').textContent='Enter a monthly housing budget before filtering by budget.';
   return;
 }
 filters={budget:$('filterBudget').checked,complete:$('filterComplete').checked,commute:$('filterCommute').checked};
 renderFilteredView();
}
function clearFilters(){
 filters={budget:false,complete:false,commute:false};
 ['filterBudget','filterComplete','filterCommute'].forEach(id=>$(id).checked=false);
 renderFilteredView();
}
function refreshTable(){
 const table=$('comparison')?.querySelector('table');
 if(!table)return;
 table.querySelectorAll('tr[data-commute-row]').forEach(el=>el.remove());
 const tbody=table.querySelector('tbody');
 if(!tbody)return;
 const arr=all(),winners={};
 for(const mode of ['carDistance','carTime','walkTime']){
   const amounts=arr.map(a=>route(a)).filter(Boolean).map(r=>mode==='carDistance'?r.car?.miles:mode==='carTime'?r.car?.minutes:r.walk?.minutes).filter(Number.isFinite);
   winners[mode]=amounts.length===arr.length&&amounts.length>0?Math.min(...amounts):null;
 }
 const rows=[
 ['Driving distance (miles)','carDistance',r=>r.car? r.car.miles.toFixed(1)+' mi':'Unavailable'],
 ['Driving time (minutes)','carTime',r=>r.car?Math.round(r.car.minutes)+' min':'Unavailable'],
 ['Walking time (minutes)','walkTime',r=>r.walk?Math.round(r.walk.minutes)+' min':'Unavailable']
 ];
 for(const [label,mode,format] of rows){
   const tr=document.createElement('tr');tr.dataset.commuteRow='true';
   const name=document.createElement('td');name.textContent=label;tr.appendChild(name);
   for(const a of arr){
     const td=document.createElement('td'),r=route(a);
     const amount=r?(mode==='carDistance'?r.car?.miles:mode==='carTime'?r.car?.minutes:r.walk?.minutes):null;
     td.textContent=r?format(r):'Not calculated';
     if(Number.isFinite(amount)&&winners[mode]!==null&&Math.abs(amount-winners[mode])<0.005)td.className='commute-best';
     tr.appendChild(td);
   }
   tbody.appendChild(tr);
 }
}
function refresh(){
 if(refreshing)return;refreshing=true;
 try{
   const arr=all(),b=budget();
   const annual=$('annualBudget');
   if(annual){
     const value=annual.querySelector('.annual-value');if(value)value.textContent=b===null?'—':usd(b*12);
   }
   $('budgetSummary').textContent=b==null?'Optional: enter a maximum estimated monthly housing cost.':arr.filter(a=>effective(a)<=b).length+' of '+arr.length+' apartments have estimated effective rent within '+usd(b)+'/month (unknown charges may change this).';
   // Show affordability in the main comparison itself, without excluding properties.
   const table=$('comparison')?.querySelector('table');
   if(table){
     const heads=Array.from(table.querySelectorAll('thead th')).slice(1);
     heads.forEach((head,i)=>{
       const apartment=arr[i];if(!apartment)return;
       head.classList.remove('budget-head-ok','budget-head-over');
       head.querySelector('.budget-table-label')?.remove();
       if(b!==null&&effective(apartment)>b){
         head.classList.add('budget-head-over');
         const tag=document.createElement('span');
         tag.className='budget-table-label';
         const uncertain=['parking','utilities','internet','fees','once'].some(k=>apartment[k]===null||apartment[k]===undefined);
         tag.textContent='⚠ Above budget'+(uncertain?' · excludes unknown costs':'');
         (head.querySelector('.apt-table-head')||head).appendChild(tag);
       }
     });
   }
   const cards=$('cards')?.querySelectorAll('.compact-apt')||[];
   cards.forEach((card,i)=>{
     const a=arr[i];if(!a)return;
     card.classList.remove('within-budget','over-budget');
     card.querySelectorAll('.budget-label,.commute-label').forEach(el=>el.remove());
     if(b!=null){
       if(effective(a)>b){card.classList.add('over-budget');const tag=document.createElement('span');tag.className='budget-label';tag.textContent=' · Above budget';tag.style.cssText='font-size:13px;font-weight:750;color:#b54734';card.querySelector('.compact-apt-meta')?.appendChild(tag)}
     }
     const r=route(a);
     if(r&&r.car){
       const tag=document.createElement('span');tag.className='commute-label';tag.textContent=' · '+r.car.miles.toFixed(1)+' mi by car';
       tag.style.cssText='font-size:11px;color:#087f79';
       card.querySelector('.compact-apt-meta')?.appendChild(tag);
     }
   });
   const ranked=sortedRoutes(),measured=ranked.length;
   const fastestDrive=ranked.filter(x=>x.r.car).sort((x,y)=>x.r.car.minutes-y.r.car.minutes)[0];
   const fastestWalk=ranked.filter(x=>x.r.walk).sort((x,y)=>x.r.walk.minutes-y.r.walk.minutes)[0];
   $('commuteInsight').innerHTML=ranked.length?
     '<strong>Commute insights:</strong> '+esc(ranked[0].a.name)+' has the shortest measured driving distance ('+ranked[0].r.car.miles.toFixed(1)+' mi). '+
     (fastestDrive?esc(fastestDrive.a.name)+' has the fastest estimated drive ('+Math.round(fastestDrive.r.car.minutes)+' min). ':'')+
     (fastestWalk?esc(fastestWalk.a.name)+' has the fastest estimated walk ('+Math.round(fastestWalk.r.walk.minutes)+' min). ':'')+
     '<small>Compared '+measured+' of '+arr.length+' apartments with current driving routes; missing results are excluded.</small>':
     '<strong>Commute insights:</strong> Enter a destination and calculate routes to see which apartment is closest.';
   refreshTable();renderFilteredView();
 }finally{refreshing=false}
}
async function requestPaced(){
 const d=Math.max(0,1150-(Date.now()-requestsAt));if(d)await new Promise(done=>setTimeout(done,d));
 requestsAt=Date.now();
}
async function geocode(address){
 const key=address.trim().toLowerCase();
 if(geocodeCache.has(key))return geocodeCache.get(key);
 await requestPaced();
 const res=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(address),{headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('Address lookup failed ('+res.status+').');
 const data=await res.json();
 if(!data?.length)throw Error('Address not found: '+address+'. Enter a complete street, city and state.');
 const point={lat:Number(data[0].lat),lon:Number(data[0].lon)};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon))throw Error('Location returned invalid coordinates.');
 geocodeCache.set(key,point);return point;
}
async function routing(from,to,mode){
 await requestPaced();
 // Routing engine is selected by the routed-car / routed-foot server prefix.
 const url='https://routing.openstreetmap.de/routed-'+mode+'/route/v1/driving/'+from.lon+','+from.lat+';'+to.lon+','+to.lat+'?overview=false';
 const res=await fetch(url,{headers:{Accept:'application/json'}});
 if(!res.ok)throw Error(mode+' routing unavailable ('+res.status+').');
 const data=await res.json();
 if(data.code!=='Ok'||!data.routes?.length)throw Error('No '+mode+' route found.');
 const r=data.routes[0];
 if(!Number.isFinite(r.distance)||!Number.isFinite(r.duration))throw Error('Invalid route measurements.');
 return{miles:r.distance/1609.344,minutes:r.duration/60};
}
async function calculateAll(){
 if(routeBusy)return;
 const dest=$('destination').value.trim();
 if(dest.length<8){$('commuteStatus').textContent='Enter a full workplace or college street address to compare routes.';return}
 const apartments=all(),valid=apartments.filter(a=>String(a.address||'').trim().length>=8);
 if(!valid.length){$('commuteStatus').textContent='Add a street address to an apartment using its Edit button first.';return}
 routeBusy=true;$('calculateCommute').disabled=true;
 let completed=0,failures=[];
 try{
   let destination;
   try{destination=await geocode(dest)}catch(e){$('commuteStatus').textContent='Destination lookup failed: '+e.message;return}
   for(const a of valid){
     $('commuteStatus').textContent='Calculating routes '+(completed+1)+' of '+valid.length+' — '+a.name+'…';
     try{
       const from=await geocode(a.address);
       let car=null,walk=null;
       try{car=await routing(from,destination,'car')}catch(e){failures.push(a.name+' (drive: '+e.message+')')}
       try{walk=await routing(from,destination,'foot')}catch(e){failures.push(a.name+' (walk: '+e.message+')')}
       if(car||walk)routeData.set(a.id,{address:a.address.trim(),destination:dest,car,walk});
     }catch(e){failures.push(a.name+': '+e.message)}
     completed++;refresh();
   }
   const good=all().filter(a=>route(a)).length;
   $('commuteStatus').textContent='Calculated at least one travel mode for '+good+' of '+apartments.length+' apartments.'+(failures.length?' Some routes were unavailable: '+failures.slice(0,3).join('; ')+'.':'')+(valid.length<apartments.length?' Add street addresses to the remaining apartments to include them.':'');
 }finally{routeBusy=false;$('calculateCommute').disabled=false;refresh()}
}
function sortList(){
 const mode=$('commuteSort').value;
 const data=all().slice();
 function metric(a){
   if(mode==='cost')return effective(a);
   const r=route(a);
   if(mode==='driveDistance')return r?.car?.miles??Number.POSITIVE_INFINITY;
   if(mode==='driveTime')return r?.car?.minutes??Number.POSITIVE_INFINITY;
   return r?.walk?.minutes??Number.POSITIVE_INFINITY;
 }
 data.sort((a,b)=>metric(a)-metric(b)||String(a.name).localeCompare(String(b.name)));
 if(window.HiddenCostSortEntries)window.HiddenCostSortEntries(data.map(a=>a.id));
 refresh();
}
function printReport(){
 const arr=all();if(!arr.length){alert('Add an apartment before exporting.');return}
 const b=budget(),dest=$('destination').value.trim();
 const labels=[
 ['Advertised monthly rent',a=>usd(val(a.rent))],
 ['Regular monthly housing cost',a=>usd(val(a.rent)+val(a.parking)+val(a.utilities)+val(a.internet)+val(a.fees))],
 ['Effective monthly rent',a=>usd(effective(a))],
 ['Compared lease term',a=>leaseMonths(a)+' months'+(leaseMonths(a)!==val(a.months)?' (hypothetical)':'')],
 ['Estimated cost for selected term',a=>usd(termTotal(a))],
 ['Approx. Annual Leasing Cost (annualized)',a=>usd(effective(a)*12)],
 ['Upfront cash',a=>usd(val(a.once)+val(a.deposit)+(a.firstMonth?val(a.rent)+val(a.parking)+val(a.utilities)+val(a.internet)+val(a.fees):0))],
 ['Driving distance',a=>route(a)?.car?route(a).car.miles.toFixed(1)+' miles':'Not calculated'],
 ['Driving time',a=>route(a)?.car?Math.round(route(a).car.minutes)+' min':'Not calculated'],
 ['Walking time',a=>route(a)?.walk?Math.round(route(a).walk.minutes)+' min':'Not calculated']
 ];
 const headers='<th>Metric</th>'+arr.map(a=>'<th>'+esc(a.name)+'</th>').join('');
 const rows=labels.map(([label,fn])=>'<tr><td>'+esc(label)+'</td>'+arr.map(a=>'<td>'+esc(fn(a))+'</td>').join('')+'</tr>').join('');
 $('printReport').innerHTML='<h1>HiddenCost Apartment Comparison</h1><p>'+new Date().toLocaleDateString('en-US')+' · Budget: '+(b?usd(b):'Not entered')+' · Destination: '+esc(dest||'Not entered')+'</p><table><thead><tr>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table><p class="report-notes">Annual leasing costs are annualized estimates calculated as twelve times estimated effective monthly cost, not official quotes. Changed lease durations are hypothetical and keep entered monthly prices, one-time fees and total concessions unchanged. Missing fees are excluded from totals, not verified as zero. Rent figures are estimates. Travel times are routing estimates without current traffic or service delays. Unmeasured routes are omitted from commute rankings.</p>';
 window.print();
}
function init(){
 const dest=$('destination');if(!dest)return;
 try{dest.value=localStorage.getItem('hiddencost-destination')||'';$('monthlyBudget').value=localStorage.getItem('hiddencost-budget')||''}catch{}
 $('calculateCommute').addEventListener('click',calculateAll);
 $('commuteSort').addEventListener('change',sortList);
 dest.addEventListener('change',()=>{try{localStorage.setItem('hiddencost-destination',dest.value.trim())}catch{}refresh()});
 $('monthlyBudget').addEventListener('input',()=>{try{localStorage.setItem('hiddencost-budget',$('monthlyBudget').value)}catch{}refresh()});
 $('exportReport').onclick=printReport;
 $('filterToggle').addEventListener('click',()=>{const panel=$('filterPanel');panel.hidden=!panel.hidden;$('filterToggle').setAttribute('aria-expanded',String(!panel.hidden))});
 $('applyFilters').addEventListener('click',setFilters);
 $('resetFilters').addEventListener('click',clearFilters);
 $('clearFilters').addEventListener('click',clearFilters);
 window.HiddenCostExtraRefresh=refresh;refresh();
}
init();
})();