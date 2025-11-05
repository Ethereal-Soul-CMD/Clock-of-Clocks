// ===== DOM =====
const $offset = document.getElementById("offset");
const $toggleWrapper = document.getElementById("toggleWrapper");
const $toggleTrack   = document.getElementById("toggleTrack");
const $ampm  = document.getElementById("ampm");
const $app   = document.getElementById("app");
const $uiHide = document.getElementById("uiHide");
const $theme = document.getElementById("theme");

// ===== settings & persistence =====
const TZ_KEY = "clock.gmtOffset.v1";
const H12_KEY = "clock.use12h.v1";
const UIHIDE_KEY = "clock.uiHidden.v1";
const THEME_KEY = "clock.theme.v1";

function loadGMT(){ try{ const v=parseFloat(localStorage.getItem(TZ_KEY)); return Number.isFinite(v)?v:7; }catch{ return 7; } }
function saveGMT(v){ try{ localStorage.setItem(TZ_KEY,String(v)); }catch{} }
let gmtOffset = loadGMT();

function loadUse12h(){ try{ const r=localStorage.getItem(H12_KEY); return r==="true"; }catch{ return false; } }
function saveUse12h(v){ try{ localStorage.setItem(H12_KEY, v?"true":"false"); }catch{} }
let use12h = loadUse12h();

function loadUIHidden(){ try{ return localStorage.getItem(UIHIDE_KEY)==="1"; }catch{ return false; } }
function saveUIHidden(v){ try{ localStorage.setItem(UIHIDE_KEY, v?"1":"0"); }catch{} }
let uiHidden = loadUIHidden();

function loadTheme(){ try{ return localStorage.getItem(THEME_KEY) || "Black"; }catch{ return "Black"; } }
function saveTheme(v){ try{ localStorage.setItem(THEME_KEY, v); }catch{} }
let theme = loadTheme();

// URL share (?gmt=7&h12=1&theme=Black)
function readQueryOverrides(){
  const u = new URL(location.href);
  const g = u.searchParams.get("gmt");
  const h = u.searchParams.get("h12");
  const t = u.searchParams.get("theme");
  if (g !== null) {
    const gv = parseFloat(g);
    if (Number.isFinite(gv) && gv >= -12 && gv <= 14) { gmtOffset = gv; saveGMT(gmtOffset); }
  }
  if (h !== null) {
    const hv = h === "1" || (typeof h === "string" && h.toLowerCase() === "true");
    use12h = hv; saveUse12h(use12h);
  }
  if (t !== null) {
    theme = t; saveTheme(theme);
  }
}
function writeQueryState(){
  const u = new URL(location.href);
  u.searchParams.set("gmt", String(gmtOffset));
  u.searchParams.set("h12", use12h ? "1" : "0");
  u.searchParams.set("theme", theme);
  history.replaceState(null, "", u);
}
readQueryOverrides();

// ===== apply theme =====
function applyTheme(){
  document.body.setAttribute("data-theme", theme);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) {
    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#000';
    m.setAttribute('content', bg);
  }
}
applyTheme();

// ===== calibration state =====
let offsetMs=0, aligned=false, tickerId=null;

// ===== helpers =====
const nowCorrectedMs = () => Date.now()+offsetMs;

// AM/PM badge
function tick(){
  const ms = nowCorrectedMs();
  const t = new Date(ms + gmtOffset*3600_000);
  if (use12h) {
    $ampm.textContent = (t.getUTCHours() < 12) ? "AM" : "PM";
    $ampm.removeAttribute("data-hide");
  } else {
    $ampm.setAttribute("data-hide","");
  }
}

// Align ticks on the second boundary
function startAlignedTicker(){
  if(tickerId) clearInterval(tickerId);
  aligned=false;
  const delay = 1000 - (nowCorrectedMs()%1000);
  setTimeout(()=>{
    aligned=true;
    tick();
    tickerId=setInterval(()=>{ tick(); renderGrid(); },1000);
  },delay);
}

// ===== Calibration (two providers) =====
function halfRTT(serverMs,t0,t1){ return serverMs+(t1-t0)/2; }
async function tryHead(){
  const t0=performance.now();
  const res=await fetch(".",{method:"HEAD",cache:"no-store"});
  const t1=performance.now();
  const h=res.headers.get("Date");
  if(!h) throw 0;
  return halfRTT(new Date(h).getTime(),t0,t1)-Date.now();
}
async function sampleWorldAPI(){
  const t0=performance.now();
  const r=await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC",{cache:"no-store"});
  const t1=performance.now();
  const j=await r.json();
  return halfRTT(new Date(j.utc_datetime).getTime(),t0,t1)-Date.now();
}
async function calibrateOnce(){
  let offHead=null, offWTA=null;
  try{ offHead = await tryHead(); }catch{}
  try{ offWTA  = await sampleWorldAPI(); }catch{}
  const cands = [offHead,offWTA].filter(Number.isFinite).sort((a,b)=>Math.abs(a)-Math.abs(b));
  if (!cands.length) return offsetMs;
  offsetMs = cands[0];
  return offsetMs;
}

// ===== UI: GMT dropdown =====
function populateOffsets(){
  $offset.innerHTML="";
  for(let i=-12;i<=14;i++){
    const opt=document.createElement("option");
    opt.value=i; opt.textContent=`GMT${i>=0?"+":""}${i}`;
    if(i===gmtOffset) opt.selected=true;
    $offset.appendChild(opt);
  }
}
$offset.addEventListener("change",()=>{
  const v = parseFloat($offset.value);
  gmtOffset = Number.isFinite(v)?v:0;
  saveGMT(gmtOffset);
  writeQueryState();
  renderGrid();
  startAlignedTicker();
});

// ===== UI: toggle 12/24 =====
function applyToggleUI(){
  if(use12h){
    $toggleWrapper.classList.remove("right");
    $toggleWrapper.setAttribute("aria-pressed","true");
  } else {
    $toggleWrapper.classList.add("right");
    $toggleWrapper.setAttribute("aria-pressed","false");
  }
  writeQueryState();
}
function toggleMode(){
  use12h = !use12h;
  saveUse12h(use12h);
  applyToggleUI();
  renderGrid();
  startAlignedTicker();
}
$toggleTrack.addEventListener("click", toggleMode);
$toggleWrapper.addEventListener("keydown",(e)=>{
  if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggleMode(); }
});

// ===== UI: hide controls button =====
function applyUIHidden(){
  document.body.classList.toggle("controls-hidden", uiHidden);
  $uiHide.setAttribute("aria-pressed", uiHidden ? "true" : "false");
  $uiHide.title = uiHidden ? "Show controls" : "Hide controls";
}
$uiHide.addEventListener("click", ()=>{
  uiHidden = !uiHidden;
  saveUIHidden(uiHidden);
  applyUIHidden();
});
applyUIHidden();

// ===== UI: Theme selector =====
function populateTheme(){ $theme.value = theme; }
$theme.addEventListener("change", ()=>{
  theme = $theme.value;
  saveTheme(theme);
  applyTheme();
  writeQueryState();
});
populateTheme();

// ===== Visibility optimization =====
document.addEventListener("visibilitychange", ()=>{
  if (document.hidden) {
    if (tickerId) clearInterval(tickerId);
  } else {
    tick();
    calibrateOnce().finally(startAlignedTicker);
  }
});

// ===== Hyperplexed-style hand presets =====
const H  = { h:   0, m: 180 },
      V  = { h: 270, m:  90 },
      TL = { h: 180, m: 270 },
      TR = { h:   0, m: 270 },
      BL = { h: 180, m:  90 },
      BR = { h:   0, m:  90 },
      E  = { h: 135, m: 135 };

const digits = [
  [
    BR, H,  H,  BL,
    V,  BR, BL, V,
    V,  V,  V,  V,
    V,  V,  V,  V,
    V,  TR, TL, V,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  BL, E,
    TR, BL, V,  E,
    E,  V,  V,  E,
    E,  V,  V,  E,
    BR, TL, TR, BL,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  H,  BL,
    TR, H,  BL, V,
    BR, H,  TL, V,
    V,  BR, H,  TL,
    V,  TR, H,  BL,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  H,  BL,
    TR, H,  BL, V,
    E,  BR, TL, V,
    E,  TR, BL, V,
    BR, H,  TL, V,
    TR, H,  H,  TL,
  ],
  [
    BR, BL, BR, BL,
    V,  V,  V,  V,
    V,  TR, TL, V,
    TR, H,  BL, V,
    E,  E,  V,  V,
    E,  E,  TR, TL,
  ],
  [
    BR, H,  H,  BL,
    V,  BR, H,  TL,
    V,  TR, H,  BL,
    TR, H,  BL, V,
    BR, H,  TL, V,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  H,  BL,
    V,  BR, H,  TL,
    V,  TR, H,  BL,
    V,  BR, BL, V,
    V,  TR, TL, V,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  H,  BL,
    TR, H,  BL, V,
    E,  E,  V,  V,
    E,  E,  V,  V,
    E,  E,  V,  V,
    E,  E,  TR, TL,
  ],
  [
    BR, H,  H,  BL,
    V,  BR, BL, V,
    V,  TR, TL, V,
    V,  BR, BL, V,
    V,  TR, TL, V,
    TR, H,  H,  TL,
  ],
  [
    BR, H,  H,  BL,
    V,  BR, BL, V,
    V,  TR, TL, V,
    TR, H,  BL, V,
    BR, H,  TL, V,
    TR, H,  H,  TL,
  ],
];

// ===== Build the 6 digit segments (HH:MM:SS) =====
function makeClock(){
  const c = document.createElement('div');
  c.className = 'clock';
  c._prevH = 0;
  c._prevM = 0;
  return c;
}
function makeDigitGroup(){ return Array.from({length:24}, makeClock); }

const segments = Array.from({length:6}, ()=> {
  const s = document.createElement('div');
  s.className = 'segment';
  $app.appendChild(s);
  return s;
});
const digitClocks = segments.map(()=>makeDigitGroup());
digitClocks.forEach((group,i)=>{
  const host = segments[i];
  group.forEach(c=>host.appendChild(c));
});

// ===== Angle normalization =====
function normalizeAngle(next, prev){
  const delta = ((next - prev) % 360 + 360) % 360;
  return prev + delta;
}

// ===== Time digits from corrected time =====
function getTimeDigits(ms){
  const t = new Date(ms + gmtOffset*3600_000);
  let h = t.getUTCHours();
  const m = t.getUTCMinutes();
  const s = t.getUTCSeconds();
  if (use12h) h = (h%12)||12;
  return [
    Math.floor(h/10), h%10,
    Math.floor(m/10), m%10,
    Math.floor(s/10), s%10
  ];
}

// ===== Apply a digit pattern =====
function applyDigit(group, digitIndex){
  const pattern = digits[digitIndex];
  for (let i=0;i<24;i++){
    const clock = group[i];
    const {h,m} = pattern[i];
    clock._prevH = normalizeAngle(h, clock._prevH);
    clock._prevM = normalizeAngle(m, clock._prevM);
    clock.style.setProperty('--hour-angle',   String(clock._prevH));
    clock.style.setProperty('--minute-angle', String(clock._prevM));
  }
}

// ===== Render grid =====
function renderGrid(){
  const parts = getTimeDigits(nowCorrectedMs());
  for (let i=0;i<6;i++) applyDigit(digitClocks[i], parts[i]);
}

// ===== boot =====
populateOffsets();
applyToggleUI();
(function initTheme(){ $theme.value = theme; applyTheme(); })();
tick();
calibrateOnce().finally(()=>{
  renderGrid();
  startAlignedTicker();
});

// periodic re-calibration
setInterval(async()=>{
  const before=offsetMs;
  await calibrateOnce();
  if(Math.abs(offsetMs-before)>=5) startAlignedTicker();
}, 5*60_000);
