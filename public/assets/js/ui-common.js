/* TONOSAMA ui-common.js (minimal shared utilities) */
export function showToast(type, msg, ms=2500){
  let box=document.getElementById('toast-box');
  if(!box){
    box=document.createElement('div');
    box.id='toast-box';
    box.style.cssText='position:fixed;right:12px;bottom:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(box);
  }
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText=`padding:10px 12px;border-radius:12px;color:#fff;font-size:14px;
    background:${type==='error'?'#e11d48':type==='warn'?'#f59e0b':'#10b981'};box-shadow:0 8px 20px rgba(0,0,0,.2);`;
  box.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}

export function setLoading(on, label="処理中…"){
  const el=document.getElementById('loading');
  if(!el) return;
  el.style.display = on ? 'flex' : 'none';
  el.querySelector('.label').textContent = label;
}

export function setFormBusy(form, busy){
  if(!form) return;
  form.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=busy);
}

export function getQueryParams(){
  return Object.fromEntries(new URLSearchParams(location.search));
}

export function PaymentBadge(status){
  // status: trial|paid|overdue|blocked
  const map={
    trial:{text:'TRIAL',cls:'badge trial'},
    paid:{text:'PAID',cls:'badge paid'},
    overdue:{text:'OVERDUE',cls:'badge overdue'},
    blocked:{text:'BLOCKED',cls:'badge blocked'}
  };
  const v=map[status]||{text:'UNKNOWN',cls:'badge'};
  return `<span class="${v.cls}">${v.text}</span>`;
}

export function JobProgressBadge(status, progress=0){
  const cls=status==='done'?'badge done':status==='failed'?'badge failed':'badge running';
  const text=status==='done'?'DONE':status==='failed'?'FAILED':`RUNNING ${progress}%`;
  return `<span class="${cls}">${text}</span>`;
}
