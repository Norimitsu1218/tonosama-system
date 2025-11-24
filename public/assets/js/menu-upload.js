import { showToast, setLoading, PaymentBadge, JobProgressBadge } from "./ui-common.js";

const LS = {
  lastFiles: "tonosama.upload.lastFiles",
  job: "tonosama.ocr.job",
  candidates: "tonosama.menu.candidates",
  payment: "tonosama.payment.status"
};

const state = {
  payment_status: localStorage.getItem(LS.payment) || "trial",
  job: JSON.parse(localStorage.getItem(LS.job) || "null"),
  candidates: JSON.parse(localStorage.getItem(LS.candidates) || "[]"),
  timer: null,
  mockMode: (window.MOCK_MODE ?? "true") === "true"
};

const el = {
  paymentBadge: document.getElementById("paymentBadge"),
  jobBadge: document.getElementById("jobBadge"),
  progressText: document.getElementById("progressText"),
  steps: document.getElementById("steps"),
  candidates: document.getElementById("candidates"),
  fileInput: document.getElementById("fileInput"),
  btnUpload: document.getElementById("btnUpload"),
  btnReset: document.getElementById("btnReset"),
  btnNext: document.getElementById("btnNext")
};

function isBlocked(){
  return state.payment_status === "blocked" || state.payment_status === "overdue";
}

function render(){
  el.paymentBadge.innerHTML = PaymentBadge(state.payment_status);

  el.btnUpload.disabled = isBlocked();
  el.btnNext.disabled = isBlocked() || !state.candidates.length;

  if(!state.job){
    el.jobBadge.innerHTML = JobProgressBadge("idle", 0);
    el.progressText.textContent = "未開始";
    el.steps.textContent = "";
  }else{
    el.jobBadge.innerHTML = JobProgressBadge(state.job.status, state.job.progress);
    el.progressText.textContent = `${state.job.progress}%`;
    el.steps.textContent = (state.job.steps||[]).map(s=>`${s.done?"✅":"⬜️"} ${s.label}`).join(" / ");
  }

  el.candidates.innerHTML = state.candidates.map(c=>{
    const qc = c.qc_status ? ` / QC:${c.qc_status}${c.qc_reason?`(${c.qc_reason})`:""}` : "";
    return `
      <div class="item">
        <div><b>${c.name_ja}</b> ¥${c.price} <span class="muted">(${c.category})</span></div>
        <div class="muted" style="margin-top:4px">${c.ja18s_draft||"—"}${qc}</div>
        <div class="muted" style="margin-top:2px">status: ${c.status}</div>
      </div>`;
  }).join("") || `<div class="muted">まだ候補はありません</div>`;
}

function save(){
  localStorage.setItem(LS.job, JSON.stringify(state.job));
  localStorage.setItem(LS.candidates, JSON.stringify(state.candidates));
}

async function startJobMock(){
  state.job = {
    job_id: "ocr_dev_" + String(Date.now()),
    status: "running",
    progress: 0,
    steps: [
      { label:"OCR中", done:false },
      { label:"品目抽出中", done:false },
      { label:"18秒文候補生成中", done:false }
    ],
    error_code: null
  };
  save(); render();
  setLoading(true, "解析中…");

  state.timer = setInterval(()=>{
    if(!state.job) return;
    state.job.progress += 8;
    if(state.job.progress >= 30) state.job.steps[0].done = true;
    if(state.job.progress >= 60) state.job.steps[1].done = true;
    if(state.job.progress >= 90) state.job.steps[2].done = true;

    if(state.job.progress >= 100){
      state.job.progress = 100;
      state.job.status = "done";
      clearInterval(state.timer);
      state.timer = null;
      state.candidates = [
        {
          item_id:"draft_001",
          name_ja:"ねぎま",
          price:220,
          category:"焼き鳥",
          image_status:"none",
          ja18s_draft:"香ばしい鶏ももと長ねぎを炭火で焼き上げ、甘い脂とねぎの香りが広がります。",
          status:"needs_review",
          qc_status:"needs_review",
          qc_reason:"価格/部位の要確認"
        }
      ];
      save(); render();
      setLoading(false);
      showToast("success","解析が完了しました");
      return;
    }
    save(); render();
  }, 800);
}

async function startJobReal(){
  // TODO: Issue #3 Lane Cで実装（POST /jobs/ocr → polling）
  showToast("warn","実APIモードは未接続です（mockで動作）");
  return startJobMock();
}

el.btnUpload.addEventListener("click", async ()=>{
  const files = [...el.fileInput.files];
  if(!files.length){
    showToast("error","ファイルを選択してください");
    return;
  }
  if(isBlocked()){
    showToast("error","支払いが未完了のため解析できません");
    return;
  }
  localStorage.setItem(LS.lastFiles, files.map(f=>f.name).join(","));
  if(state.mockMode) await startJobMock();
  else await startJobReal();
});

el.btnReset.addEventListener("click", ()=>{
  state.job = null; state.candidates = [];
  save(); render();
});

el.btnNext.addEventListener("click", ()=>{
  location.href = "/owner-work.html";
});

render();
