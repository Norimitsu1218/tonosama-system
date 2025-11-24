import { showToast, PaymentBadge } from "./ui-common.js";

const LS = {
  candidates:"tonosama.menu.candidates",
  items:"tonosama.owner.itemsDraft",
  selected:"tonosama.owner.selectedItem",
  payment:"tonosama.payment.status"
};

const state = {
  payment_status: localStorage.getItem(LS.payment) || "trial",
  items: [],
  selected_item_id: null,
  mockMode: (window.MOCK_MODE ?? "true") === "true"
};

const el = {
  paymentBadge: document.getElementById("paymentBadge"),
  list: document.getElementById("list"),
  detail: document.getElementById("detail"),
  btnSave: document.getElementById("btnSave"),
  btnApprove: document.getElementById("btnApprove"),
  btnTranslate: document.getElementById("btnTranslate"),
  hint: document.getElementById("hint")
};

function isBlocked(){
  return state.payment_status === "blocked" || state.payment_status === "overdue";
}

function loadInitial(){
  const fromUpload = JSON.parse(localStorage.getItem(LS.candidates) || "[]");
  const draft = JSON.parse(localStorage.getItem(LS.items) || "null");
  state.items = draft || fromUpload.map(c=>({
    item_id:c.item_id,
    name_ja:c.name_ja,
    price:c.price,
    category:c.category,
    ja18s_final:c.ja18s_draft,
    image_url:c.image_url||"",
    qc_status:c.qc_status||null,
    qc_reason:c.qc_reason||null,
    owner_approved:false,
    is_recommended:false,
    translation_status:"pending"
  }));
  state.selected_item_id = localStorage.getItem(LS.selected) || (state.items[0]?.item_id ?? null);
}

function save(){
  localStorage.setItem(LS.items, JSON.stringify(state.items));
  if(state.selected_item_id) localStorage.setItem(LS.selected, state.selected_item_id);
}

function renderList(){
  el.list.innerHTML = state.items.map(it=>{
    const active = it.item_id===state.selected_item_id ? "active":"";
    const qc = it.qc_status?`QC:${it.qc_status}${it.qc_reason?`(${it.qc_reason})`:""}`:"QC:—";
    const ap = it.owner_approved?"✅承認":"⬜️未承認";
    return `<div class="item ${active}" data-id="${it.item_id}">
      <div><b>${it.name_ja}</b> ¥${it.price}</div>
      <div class="muted">${qc} / ${ap}</div>
    </div>`;
  }).join("");
  [...el.list.querySelectorAll(".item")].forEach(d=>{
    d.onclick=()=>{ state.selected_item_id=d.dataset.id; save(); render(); };
  });
}

function renderDetail(){
  const it = state.items.find(x=>x.item_id===state.selected_item_id);
  if(!it){ el.detail.innerHTML="<div class='muted'>未選択</div>"; return; }

  el.detail.innerHTML = `
    <label>品名（日本語）</label>
    <input id="name" value="${it.name_ja||""}"/>

    <label>価格</label>
    <input id="price" type="number" value="${it.price||0}"/>

    <label>カテゴリ</label>
    <input id="cat" value="${it.category||""}"/>

    <label>18秒文（最終）</label>
    <textarea id="ja18s">${it.ja18s_final||""}</textarea>

    <label>画像URL（仮）</label>
    <input id="img" value="${it.image_url||""}"/>

    <label>おすすめの一品</label>
    <input id="rec" type="checkbox" ${it.is_recommended?"checked":""}/> この品目をおすすめにする

    <div class="muted" style="margin-top:6px">
      QC: ${it.qc_status||"—"} ${it.qc_reason?`(${it.qc_reason})`:""}
    </div>
  `;
}

function renderButtons(){
  const it = state.items.find(x=>x.item_id===state.selected_item_id);
  const allApproved = state.items.length>0 && state.items.every(x=>x.owner_approved && x.ja18s_final && x.qc_status!=="needs_review");
  el.btnSave.disabled = isBlocked();
  el.btnApprove.disabled = isBlocked() || !it;
  el.btnTranslate.disabled = isBlocked() || !allApproved;

  el.hint.textContent = isBlocked()
    ? "支払い未完了のため承認/発行ができません。"
    : allApproved
      ? "全品承認済み。14言語生成を発行できます。"
      : "needs_review解消＋全品承認で発行可能になります。";
}

function render(){
  el.paymentBadge.innerHTML = PaymentBadge(state.payment_status);
  renderList();
  renderDetail();
  renderButtons();
}

function updateSelectedFromForm(){
  const it = state.items.find(x=>x.item_id===state.selected_item_id);
  if(!it) return;
  const name=document.getElementById("name").value.trim();
  const price=Number(document.getElementById("price").value);
  const cat=document.getElementById("cat").value.trim();
  const ja18s=document.getElementById("ja18s").value.trim();
  const img=document.getElementById("img").value.trim();
  const rec=document.getElementById("rec").checked;

  it.name_ja=name;
  it.price=isFinite(price)?price:0;
  it.category=cat;
  it.ja18s_final=ja18s;
  it.image_url=img;

  if(rec){
    state.items.forEach(x=>x.is_recommended=false);
    it.is_recommended=true;
  }else{
    it.is_recommended=false;
  }

  // needs_review を店主が編集したら一旦解消扱い（実API版でGemini再QC）
  if(it.qc_status==="needs_review" && name && ja18s){
    it.qc_status="ok";
    it.qc_reason=null;
  }
}

el.btnSave.onclick=()=>{
  updateSelectedFromForm();
  save(); render();
  showToast("success","保存しました（mock）");
};

el.btnApprove.onclick=()=>{
  updateSelectedFromForm();
  const it = state.items.find(x=>x.item_id===state.selected_item_id);
  if(!it) return;
  if(!it.name_ja || !it.ja18s_final){
    showToast("error","品名と18秒文は必須です");
    return;
  }
  if(it.qc_status==="needs_review"){
    showToast("warn","QCの指摘が残っています");
    return;
  }
  it.owner_approved=true;
  save(); render();
  showToast("success","承認しました");
};

el.btnTranslate.onclick=()=>{
  if(isBlocked()){
    showToast("error","支払い未完了のため発行できません");
    return;
  }
  state.items.forEach(x=>x.translation_status="queued");
  save(); render();
  showToast("success","14言語生成ジョブを発行しました（mock）");
};

loadInitial();
render();
