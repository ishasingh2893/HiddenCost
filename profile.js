/* Optional production authentication requires Supabase configuration; no demo credentials are created. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const conf=window.HIDDENCOST_AUTH_CONFIG||{};
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(conf.url||'') && typeof conf.anonKey==='string'&&conf.anonKey.length>=16;
let client=null,email='',session=null;
function message(txt){$('authMessage').textContent=txt}
function starred(){
 const a=window.HiddenCostGetEntries?.()||[],favorites=a.filter(x=>x.starred),root=$('profileStarred');
 if(!root)return;
 if(!favorites.length){root.textContent='No starred apartments yet. Use ☆ beside any apartment name in the comparison table.';return}
 root.innerHTML=favorites.map(x=>'<div class="profile-star-row"><span><strong>'+escapeHTML(x.name)+'</strong><span style="color:#65758b;font-size:13px"> · '+(x.area?escapeHTML(x.area)+' sq ft · ':'')+'saved locally</span></span><button class="link" type="button" data-unstar="'+escapeHTML(x.id)+'">Unstar</button></div>').join('');
}
function status(){
 const authenticated=!!session?.user;
 $('authContent').hidden=authenticated;
 $('authSignout').hidden=!authenticated;
 $('authStatus').textContent=authenticated?'Signed in: '+(session.user.email||'Account verified')+'. Apartments and stars remain stored in this browser; cross-device syncing is not enabled.':configured?'Sign in with Google or request a one-time email code. Existing apartment data remains in this browser.':'Sign-in requires one-time provider setup. Starred apartments work without an account and remain stored in this browser.';
 $('authGoogle').disabled=!client;$('authEmailForm').querySelector('button').disabled=!client;
 if(!configured)message('Account creation is not active until the project owner connects Supabase and enables Google/email providers. No password or OTP is collected while unconfigured.');
}
async function initializeAuth(){
 if(!configured){status();return}
 try{
   const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
   client=mod.createClient(conf.url,conf.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   const data=await client.auth.getSession();session=data.data.session;
   client.auth.onAuthStateChange((_event,s)=>{session=s;status()});
   status();
 }catch(e){message('Unable to initialize secure authentication: '+e.message)}
}
async function google(){
 if(!client){message('Google sign-in is not configured yet.');return}
 try{
   const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
   if(error)throw error;
 }catch(e){message('Google login failed: '+e.message)}
}
async function sendEmail(e){
 e.preventDefault();if(!client){message('Email OTP sign-in is not configured yet.');return}
 email=$('authEmail').value.trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message('Enter a valid email address.');return}
 try{
   message('Requesting a secure email code…');
   const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
   if(error)throw error;
   $('authVerifyForm').hidden=false;message('Check your email for a six-digit verification code. The provider must be configured to send codes rather than magic links.');
 }catch(e){message('Unable to send verification code: '+e.message)}
}
async function verify(e){
 e.preventDefault();if(!client||!email)return;
 const token=$('authOtp').value.trim();if(!/^\d{6}$/.test(token)){message('Enter the six-digit code.');return}
 try{
   const {data,error}=await client.auth.verifyOtp({email,token,type:'email'});
   if(error)throw error;
   session=data.session;message('Email verified.');$('authOtp').value='';status();
 }catch(e){message('Code verification failed: '+e.message)}
}
async function signout(){if(!client)return;const {error}=await client.auth.signOut();if(error)message(error.message);else{session=null;status();message('Signed out.')}}
function init(){
 if(!$('profileOverlay'))return;
 window.HiddenCostRefreshProfile=starred;
 $('profileOpen').addEventListener('click',()=>{starred();$('profileOverlay').classList.add('open');$('profileClose').focus()});
 const close=()=>{$('profileOverlay').classList.remove('open')};
 $('profileClose').addEventListener('click',close);
 $('profileOverlay').addEventListener('click',e=>{if(e.target===$('profileOverlay'))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 $('profileStarred').addEventListener('click',e=>{const button=e.target.closest('button[data-unstar]');if(button){window.HiddenCostToggleStar?.(button.dataset.unstar);starred()}});
 $('authGoogle').addEventListener('click',google);
 $('authEmailForm').addEventListener('submit',sendEmail);
 $('authVerifyForm').addEventListener('submit',verify);
 $('authSignout').addEventListener('click',signout);
 starred();initializeAuth();
}
init();
})();