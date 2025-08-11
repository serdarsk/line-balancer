"use strict";

/* =================== GLOBAL STATE =================== */
export const appState = {
  lineType: 7, people: 6, maxStationsPerPerson: 4, speed: 50, targetCycle: null,
  activeWorkSec: 0, shiftNotified: false,

  operations: [], stationBuckets: [], stationTimesSec: [], stationMsBase: [],
  personOfStation: [], personNames: [], personPrefs: [],

  // draw refs
  svg:null, stationsGeom:[], stationRects:[], progressRects:[], progressLabels:[],
  pillTop:[], pillBottom:[], progressRTL:[],

  // sim
  running:false, raf:null, lastTs:0, simClockSec:0, throughput:0,

  // packaging
  packCount:0, packColors:[], packIds:[], packTimesSec:[],

  // KPIs
  kpiBottleneck:"—", kpiBalance:"—",

  productSeq:0,
  stationBusyMs:[], stationIdleMs:[],

  baseline:null,

  // fan-out (20 station only)
  fanOut: 1
};

const $=(id)=>document.getElementById(id);

/* =================== UTILS =================== */
const COLORS=["#ffd166","#90caf9","#a5d6a7","#f48fb1","#ce93d8","#ffab91","#fff59d","#80cbc4","#ef9a9a","#b39ddb"];
const darker=(h,f=.78)=>{const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)||[];const I=s=>parseInt(s||"ff",16),H=n=>Math.max(0,Math.min(255,Math.floor(n*f))).toString(16).padStart(2,"0");return`#${H(I(m[1]))}${H(I(m[2]))}${H(I(m[3]))}`;};
const css=(name,f)=>{const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v?v.endsWith("px")?+v.replace("px",""):v:f;};
const setTxt=(id,v)=>{const e=$(id); if(e) e.textContent=String(v);};
const hm=(t)=>{const m=/^(\d{1,2}):(\d{2})$/.exec((t||"").trim()); if(!m) return 0; const h=Math.min(23,Math.max(0,+m[1]||0)), mi=Math.min(59,Math.max(0,+m[2]||0)); return h*3600+mi*60;};
const hms=(s)=>{s=Math.max(0,Math.floor(s||0));const H=Math.floor(s/3600),M=Math.floor((s%3600)/60),S=s%60;return`${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}:${String(S).padStart(2,"0")}`;};
const mmToHHMM=(mins)=>{mins=Math.max(0,Math.floor(mins||0));const H=Math.floor(mins/60),M=mins%60;return`${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}`;};
const HHMMtoMin=(txt)=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(txt||"").trim()); if(!m) return 0; const h=+m[1],mi=+m[2]; return (isFinite(h)&&isFinite(mi))? (h*60+mi) : 0;};
const debounce=(fn,ms=400)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}}; 

/* =================== SHIFT / BREAKS =================== */
/* Artık breaksTotal (HH:MM) üzerinden hesaplıyor */
function computeActiveWorkSec(){
  const start=hm($("shiftStart")?.value||"08:00");
  const end  =hm($("shiftEnd")?.value||"16:30");
  const dur  = Math.max(0,end-start);             // saniye
  const breaksMin = HHMMtoMin($("breaksTotal")?.value||"00:00");
  const breaksSec = breaksMin*60;

  const net = Math.max(0, dur - breaksSec);
  appState.activeWorkSec = net;

  setTxt("pillActive", `${hms(appState.activeWorkSec)} (${Math.floor(appState.activeWorkSec/60)} min)`);

  // ekrana net (HH:MM) yaz
  const $net = $("netWorkTime");
  if ($net) $net.value = mmToHHMM(Math.floor(net/60));
}

/* =================== INPUTS =================== */
function parsePref(txt,nS){
  if(!txt) return null;
  txt=String(txt).trim();
  if(!txt) return null;

  txt = txt.replace(/[Ss]/g,"")
           .replace(/[|]/g,",")
           .replace(/\s+/g,",")
           .replace(/;+/g,",")
           .replace(/,+/g,",");

  const set=new Set();
  for(const part of txt.split(",").map(s=>s.trim()).filter(Boolean)){
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if(m){
      let a=+m[1], b=+m[2];
      if(a>b){ const t=a; a=b; b=t; }
      for(let k=Math.max(1,a); k<=Math.min(nS,b); k++) set.add(k);
    }else{
      const k=Math.max(1,Math.min(nS,+part||0));
      if(k) set.add(k);
    }
  }
  return set.size? set : null;
}

function readInputs(){
  appState.lineType= +$("lineType").value||7;
  appState.people= +$("people").value||1;
  appState.maxStationsPerPerson= +$("maxStationsPerPerson").value||1;
  appState.speed= Math.max(1,+$("speed").value||1);
  appState.targetCycle= +$("targetCycle").value||null;
  appState.fanOut = Math.max(1, +($("fanOut")?.value||1));

  setTxt("pillLineVal",appState.lineType); setTxt("pillPeopleVal",appState.people); setTxt("pillSpeedVal",appState.speed); setTxt("pillTarget",appState.targetCycle||"—");

  // operations
  let obj={}; try{ obj=JSON.parse($("opsJson").value||"{}"); }catch{ obj={}; }
  const arr = Array.isArray(obj) ? obj : (obj.operations||[]);
  appState.operations = arr.map((o,i)=>({ id:o.id??(i+1), name:o.name??`OP-${i+1}`, durationSec:+o.durationSec||0, preferredStation:(o.preferredStation!=null? +o.preferredStation:null) }));

  // names & prefs
  appState.personNames=[]; appState.personPrefs=[];
  const nP=appState.people, nS=appState.lineType;
  for(let p=1;p<=nP;p++){
    const nm = ($(`p${p}name`)?.value||`Person ${p}`).trim();
    const pf = ($(`prefP${p}`)?.value||"").trim();
    appState.personNames.push(nm);
    appState.personPrefs[p]= parsePref(pf,nS) || null;
  }
}

/* =================== BALANCE =================== */
function balanceOperations(){
  const totalStations=appState.lineType;
  const maxActive=appState.people*appState.maxStationsPerPerson;
  const nStations=Math.max(1,Math.min(totalStations,maxActive));
  const buckets=Array.from({length:nStations},()=>[]), loads=new Array(nStations).fill(0);

  const fanOut = (totalStations===20 ? Math.max(1, appState.fanOut||1) : 1);
  const srcGroups = (fanOut>1 ? Math.ceil(nStations / fanOut) : nStations);

  // 1) pin'li ops
  appState.operations.forEach((op,idx)=>{
    const pref=op.preferredStation;
    if(pref!=null && pref>=1){
      if(fanOut>1 && pref<=srcGroups){
        const start=(pref-1)*fanOut;
        const end=Math.min(start+fanOut-1, nStations-1);
        let best=start, bestL=Infinity;
        for(let s=start;s<=end;s++){ if(loads[s]<bestL){ bestL=loads[s]; best=s; } }
        buckets[best].push(idx); loads[best]+=op.durationSec; op.__p=true;
      }else if(pref>=1 && pref<=nStations){
        const s=pref-1; buckets[s].push(idx); loads[s]+=op.durationSec; op.__p=true;
      }
    }
  });

  // 2) kalanlar
  appState.operations.forEach((op,idx)=>{
    if(op.__p){ delete op.__p; return; }
    if(fanOut>1 && op.preferredStation!=null && op.preferredStation>=1 && op.preferredStation<=srcGroups){
      const start=(op.preferredStation-1)*fanOut;
      const end=Math.min(start+fanOut-1, nStations-1);
      let best=start, bestL=Infinity;
      for(let s=start;s<=end;s++){ if(loads[s]<bestL){ bestL=loads[s]; best=s; } }
      buckets[best].push(idx); loads[best]+=op.durationSec;
    }else{
      let si=0,min=Infinity; for(let s=0;s<nStations;s++) if(loads[s]<min){min=loads[s]; si=s;}
      buckets[si].push(idx); loads[si]+=op.durationSec;
    }
  });

  appState.stationBuckets=buckets;
  appState.stationTimesSec=loads;
  appState.stationMsBase=loads.map(sec=>Math.max(0,sec)*1000);
  return { nStations, loads };
}

/* =================== PEOPLE ASSIGN =================== */
function assignPeople(nS, people, maxSpan){
  const useP = Math.max(1, Math.min(people, nS));
  const cap  = Math.max(1, maxSpan);
  const res  = new Array(nS).fill(null);

  const core = Array.from({length:useP+1},()=>({min:+Infinity,max:-Infinity,count:0}));

  for(let p=1;p<=useP;p++){
    const pref = appState.personPrefs?.[p];
    if(!pref) continue;
    const list = Array.from(pref).filter(s=>s>=1&&s<=nS).sort((a,b)=>a-b);
    for(const s of list){
      const i = s-1;
      if(res[i]!=null) continue;
      if(core[p].count>=cap) break;
      res[i]=p;
      core[p].count++;
      core[p].min=Math.min(core[p].min,i);
      core[p].max=Math.max(core[p].max,i);
    }
  }

  for(let i=0;i<nS;i++){
    if(res[i]!=null) continue;
    let bestP=-1, bestScore=Infinity;
    for(let p=1;p<=useP;p++){
      if(core[p].count>=cap) continue;
      const center = (core[p].count? (core[p].min+core[p].max)/2 : i);
      const dist   = Math.abs(i-center);
      const score  = dist*1000 + core[p].count;
      if(score<bestScore){ bestScore=score; bestP=p; }
    }
    if(bestP<0) bestP=((i%useP)+1);
    res[i]=bestP;
    core[bestP].count++;
    core[bestP].min=Math.min(core[bestP].min,i);
    core[bestP].max=Math.max(core[bestP].max,i);
  }

  return res;
}

/* =================== QC =================== */
function qcSet(nS){
  if(nS===7) return new Set([6]);
  if(nS===20) return new Set([15,16,17,18,19]);
  return new Set();
}

/* =================== DRAW =================== */
function el(tag,attrs,text){ const n=document.createElementNS("http://www.w3.org/2000/svg",tag); Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v))); if(text!=null) n.textContent=String(text); return n; }
function showStationPopup(i){
  const opsIdx=(appState.stationBuckets[i]||[]), total=(appState.stationTimesSec[i]||0);
  const p=appState.personOfStation[i]; const pname=(appState.personNames?.[p-1])||`P${p}`;
  const rows = opsIdx.map(idx=>{ const o=appState.operations[idx]||{}; return `<tr><td class="num">${o.id||""}</td><td>${o.name||""}</td><td class="num">${o.durationSec||0}</td></tr>`; }).join("");
  const wrap=document.createElement("div"); wrap.className="modal-backdrop";
  wrap.innerHTML=`<div class="modal"><h3>Station S${i+1} — Summary</h3>
    <div class="row" style="gap:8px;margin-bottom:8px"><span class="pill">Assigned: <b>${pname}</b></span><span class="pill">Total: <b>${Math.round(total)}s</b></span></div>
    <div style="max-height:50vh;overflow:auto"><table><thead><tr><th style="width:70px">ID</th><th>Operation</th><th style="width:120px">Time (s)</th></tr></thead><tbody>${rows||`<tr><td colspan="3" class="hint">No operations.</td></tr>`}</tbody></table></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="closeSt">Close</button></div></div>`;
  document.body.appendChild(wrap); wrap.querySelector("#closeSt").onclick=()=>wrap.remove();
}

function drawStations(nS, loads){
  const svg = $("lineCanvas"); svg.innerHTML=""; appState.svg = svg;

  const H        = css("--st-h",112);
  const GAP_MIN  = css("--st-gap",10);
  const ROWG     = css("--st-row-gap",78);
  const W_TARGET = (nS>10? css("--st-w-compact",98) : css("--st-w",120));
  const timeBottom = css("--st-time-bottom",18);
  const labelTop   = css("--st-label-top",14);

  let topN, bottomN;
  if (nS === 7){ topN = 3; bottomN = 4; }
  else if (nS > 10){ topN = 10; bottomN = nS - 10; }
  else { topN = nS; bottomN = 0; }
  const rows = bottomN>0 ? 2 : 1;

  const svgW = svg.clientWidth || svg.parentElement.clientWidth || 1000;

  function rowGeom(nInRow){
    if (nInRow<=0) return {boxW:W_TARGET, gap:GAP_MIN, startX:12};
    const maxTotal = svgW - 24;
    let gap = GAP_MIN;
    let boxW = Math.floor( (maxTotal - (nInRow-1)*gap) / nInRow );
    if (boxW > W_TARGET) boxW = W_TARGET;
    if (boxW < 72) {
      gap = Math.max(6, GAP_MIN - 4);
      boxW = Math.floor( (maxTotal - (nInRow-1)*gap) / nInRow );
      boxW = Math.max(64, boxW);
    }
    const total = nInRow*boxW + (nInRow-1)*gap;
    const startX = Math.max(12, (svgW - total)/2);
    return { boxW, gap, startX };
  }
  const topG = rowGeom(topN);
  const botG = rowGeom(bottomN);

  const yTop = 36 + labelTop;
  const yBot = yTop + H + ROWG;

  const maxLoad = Math.max(1, Math.max(...loads));
  const toGray = (x)=> Math.round(255 - 120*(x/maxLoad));

  const qc = qcSet(nS);

  appState.stationsGeom=[]; appState.stationRects=[];
  appState.progressRects=[]; appState.progressLabels=[];
  appState.pillTop=[]; appState.pillBottom=[]; appState.progressRTL=[];

  function pos(i){
    if (rows===1){
      const x = topG.startX + i*(topG.boxW + topG.gap);
      return {x, y:yTop, w:topG.boxW, row:"top", rtl:false};
    }
    if (i < topN){
      const c=i;
      const x = topG.startX + c*(topG.boxW + topG.gap);
      return {x, y:yTop, w:topG.boxW, row:"top", rtl:false};
    } else {
      const j = i - topN;
      const c = (bottomN - 1) - j;        // ALT SIRA: sağdan→sola (RTL)
      const x = botG.startX + c*(botG.boxW + botG.gap);
      return {x, y:yBot, w:botG.boxW, row:"bot", rtl:true};
    }
  }

  for (let i=0;i<nS;i++){
    const p = pos(i);
    appState.progressRTL[i] = !!p.rtl;

    const g = el("g",{"data-index":String(i)}); g.style.cursor="pointer";
    g.addEventListener("click",()=>showStationPopup(i));

    const pid = appState.personOfStation[i], pname=(appState.personNames?.[pid-1])||`Person ${pid}`;
    if (p.row==="top"){
      const topLbl = el("text",{x:p.x+p.w/2,y:p.y-labelTop,"text-anchor":"middle","font-size":12,fill:"#a9c1e8"},pname);
      g.appendChild(topLbl); appState.pillTop[i]=topLbl;
    }

    const rect = el("rect",{x:p.x,y:p.y,rx:12,ry:12,width:p.w,height:H,
      fill:`rgb(${toGray(loads[i])},${toGray(loads[i])},${toGray(loads[i])})`,
      stroke: qc.has(i)? "#a984e6" : "#223",
      "stroke-width": qc.has(i)? 2.2 : 1.2,
      "stroke-dasharray": qc.has(i)? "4 2" : "0"
    });
    const sLbl = el("text",{x:p.x+p.w/2,y:p.y+18,"text-anchor":"middle","font-size":13,fill:"#0b1a2a"},`S${i+1}`);
    const time = el("text",{x:p.x+p.w/2,y:p.y+H-timeBottom,"text-anchor":"middle","font-size":13,fill:"#0b1a2a"},`${Math.round(loads[i])}s`);
    const progX = p.rtl ? (p.x+p.w-6) : (p.x+6);
    const prog = el("rect",{x:progX,y:p.y+H-timeBottom-14,width:0,height:10,rx:5,ry:5,fill:"#ffd166",stroke:"#b68900","stroke-width":0.9});

    g.appendChild(rect); g.appendChild(sLbl); g.appendChild(prog); g.appendChild(time);

    if (qc.has(i)){
      const badge = el("text",{x:p.x+10,y:p.y+14,"text-anchor":"start","font-size":10,fill:"#a984e6"}, "QC");
      g.appendChild(badge);
    }

    if (p.row==="bot"){
      const bottomLbl = el("text",{x:p.x+p.w/2,y:p.y+H+14,"text-anchor":"middle","font-size":12,fill:"#a9c1e8"},pname);
      g.appendChild(bottomLbl); appState.pillBottom[i]=bottomLbl;
    }

    svg.appendChild(g);

    appState.stationsGeom[i]={x:p.x,y:p.y,w:p.w,h:H};
    appState.stationRects[i]=rect;
    appState.progressRects[i]=prog;
    appState.progressLabels[i]=time;
  }

  const bottomY = rows===2 ? (yBot+H+26) : (yTop+H+26);
  svg.setAttribute("height", String(bottomY));
  svg.style.height = bottomY+"px";
}

/* =================== PANELS / KPI =================== */
function renderPack(){ const g=$("packGrid"); if(!g) return; setTxt("packCount", appState.packCount||0);
  if(!appState.packCount){ g.innerHTML='<div class="pack-empty">No completed units yet</div>'; return; }
  const s=Math.max(0,appState.packIds.length-200);
  g.innerHTML=appState.packIds.slice(s).map((id,i)=>{const idx=s+i, col=appState.packColors[idx]||"#8ecae6"; return `<div class="pack-item" style="background:${col};border-color:${darker(col)}"><span>${id}</span></div>`;}).join("");
}
function updateKPIs(loads){
  const sum=appState.operations.reduce((a,b)=>a+(+b.durationSec||0),0), n=loads.length, cycle=Math.max(...loads,0), ideal=sum/n||0, bal=ideal?ideal/cycle:0, bn=loads.indexOf(cycle)+1;
  setTxt("kpiThroughput",appState.throughput); setTxt("kpiCycle",cycle?Math.round(cycle):"—"); setTxt("kpiBottleneck",cycle?`S${bn}`:"—"); setTxt("kpiBalance",cycle?(bal*100).toFixed(1)+"%":"—");
  const takt=$("taktHint"); if(takt){ if(appState.targetCycle&&cycle){ const d=cycle-appState.targetCycle; takt.textContent=`Takt: ${appState.targetCycle}s | Cycle: ${Math.round(cycle)}s (${d>0?"+":""}${Math.round(d)}s)`; } else takt.textContent=""; }
  const eta=$("etaHint"); if(eta){ eta.textContent = cycle ? `First unit completes around ${Math.ceil(cycle)}s (from sim start).` : ""; }
  appState.kpiBottleneck=cycle?`S${bn}`:"—"; appState.kpiBalance=cycle?(bal*100).toFixed(1)+"%":"—";
}
function renderOps(){
  const host=$("opsPanel"); if(!host) return;
  const rows=appState.operations.map((op,i)=>{ let st=op.preferredStation??null; if(st==null){ for(let s=0;s<appState.stationBuckets.length;s++) if(appState.stationBuckets[s].includes(i)){ st=s+1; break; } } return `<tr><td class="num">${op.id}</td><td>${op.name||""}</td><td class="num">${op.durationSec||0}</td><td class="num">${st??"—"}</td></tr>`; }).join("");
  host.innerHTML=`<div class="badge-soft" style="margin-bottom:8px">Operations → Stations</div>
  <div class="hint" style="margin-bottom:6px">Use <b>Edit Operations</b> to pin a <b>Station</b>.</div>
  <div style="max-height:260px;overflow:auto"><table><thead><tr><th style="width:70px">ID</th><th>Operation</th><th style="width:120px">Time (s)</th><th style="width:120px">Station</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderPeople(){
  const host=$("peoplePanel"); if(!host) return; const n=Math.max(1,appState.people);
  const onCh=debounce(()=>applyAll(),500);
  let html=`<div class="badge-soft" style="margin-bottom:6px">People Names & Preferences</div>
  <div class="hint" style="margin-bottom:6px">Examples: <b>1-3,5</b> or <b>1 3 5</b> or <b>S1 S2 S5</b>. Leave empty for auto-assign.</div>`;
  for(let p=1;p<=n;p++){
    const nm=appState.personNames?.[p-1]||`Person ${p}`;
    const txt=(appState.personPrefs?.[p] && Array.from(appState.personPrefs[p]).sort((a,b)=>a-b).join(","))||"";
    html+=`<div class="row">
      <div style="min-width:44px"><span class="badge-soft">P${p}</span></div>
      <div style="flex:1 1 auto"><input id="p${p}name" value="${nm}" placeholder="Person name"></div>
      <div style="width:220px"><input id="prefP${p}" value="${txt}" placeholder="Preferred (e.g. 1-3,5 or 1 3 5)"></div>
    </div>`;
  }
  host.innerHTML=html;
  for(let p=1;p<=n;p++){ $(`p${p}name`)?.addEventListener("input",onCh); $(`prefP${p}`)?.addEventListener("input",onCh); }
}
function renderSuggestions(){
  const host=$("suggestionsBody"); if(!host) return; const loads=appState.stationTimesSec||[]; if(!loads.length){host.textContent="No stations yet."; return;}
  const sum=appState.operations.reduce((a,b)=>a+(+b.durationSec||0),0), n=loads.length, cycle=Math.max(...loads), ideal=sum/n, bal=ideal?ideal/cycle:0, bn=loads.indexOf(cycle)+1;
  const under=loads.map((v,i)=>({i:i+1,u:v/cycle})).filter(o=>o.u<0.8).map(o=>`S${o.i}`).join(", ");
  const tips=[]; if(appState.targetCycle){ tips.push(cycle>appState.targetCycle?`Cycle ${Math.round(cycle)}s > takt ${appState.targetCycle}s → reduce ≈${Math.ceil(cycle-appState.targetCycle)}s (move small ops off S${bn}).`:`On takt ✅. Keep watching S${bn}.`);} else tips.push(`Set a takt target (e.g. ${Math.round(ideal*1.05)}s).`);
  tips.push(`Bottleneck: S${bn}. Consider shifting work to ${under||"neighbors"}.`); if(appState.people*appState.maxStationsPerPerson<n) tips.push(`People×Span < Stations. Increase people or span.`);
  if(bal<0.9) tips.push(`Balance Rate ${(bal*100).toFixed(1)}% — try re-grouping around S${bn}.`);
  host.innerHTML=`<ul style="margin:6px 0 0 18px">${tips.map(t=>`<li>${t}</li>`).join("")}</ul>`;
}

/* =================== APPLY =================== */
export function applyAll(){
  readInputs();
  const {nStations, loads}=balanceOperations();
  appState.personOfStation=assignPeople(nStations,appState.people,appState.maxStationsPerPerson);
  drawStations(nStations,loads);
  updateKPIs(loads);
  setupSim();
  renderPeople(); renderOps(); renderPack(); renderSuggestions();
  computeActiveWorkSec(); appState.shiftNotified=false;
}

/* =================== REPORT =================== */
function renderReport(){
  const old=document.getElementById("reportCard"); if(old) old.remove();

  const nS = (appState.stationBusyMs||[]).length;
  const totalMs = (appState.activeWorkSec||0)*1000;

  const stPct = Array.from({length:nS},(_,i)=>{
    const busy=appState.stationBusyMs?.[i]||0;
    return totalMs ? Math.max(0,Math.min(100,(busy/totalMs)*100)) : 0;
  });

  const useP=Math.max(0,...appState.personOfStation);
  const busyByP=new Array(useP+1).fill(0);
  for(let s=0;s<nS;s++){
    const p=appState.personOfStation[s]||0;
    busyByP[p]+=appState.stationBusyMs?.[s]||0;
  }
  const pPct = Array.from({length:useP},(_,i)=>{
    const busy=busyByP[i+1]||0;
    return totalMs? Math.max(0,Math.min(100,(busy/totalMs)*100)) : 0;
  });

  const card=document.createElement("div");
  card.id="reportCard"; card.className="card"; card.style.margin="12px 0"; card.style.padding="12px";
  card.style.gridColumn = "1 / -1";
  card.innerHTML=`<h3 style="margin:0 0 8px">Simulation Report</h3>
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 12px">
      <div class="pill"><strong>Produced:</strong> ${appState.throughput}</div>
      <div class="pill"><strong>Stations:</strong> ${appState.stationTimesSec.length}</div>
      <div class="pill"><strong>People:</strong> ${useP}</div>
      <div class="pill"><strong>Bottleneck:</strong> ${appState.kpiBottleneck}</div>
    </div>
    <div class="pill" style="margin-bottom:8px"><strong>Balance Rate:</strong> ${appState.kpiBalance}</div>

    <div class="badge-soft" style="margin:6px 0 8px">Station Utilization (%)</div>
    <div id="repStations" style="width:100%;"></div>

    <div class="badge-soft" style="margin:12px 0 8px">People Utilization (%)</div>
    <div id="repPeople" style="width:100%;"></div>

    <div class="row" style="gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn" id="btnPrintRep">Export Report (Print)</button>
      <button class="btn" id="btnSavePng">Download Charts (PNG)</button>
    </div>`;
  document.querySelector("main").appendChild(card);

  const makeBar=(hostId,labels,pcts)=>{
    const host = card.querySelector(hostId);
    const W = host.clientWidth || (document.querySelector("main")?.clientWidth||900) - 24;
    const H = 220, padL=40, padB=24, padT=10, padR=10;
    const innerW=W-padL-padR, innerH=H-padT-padB, gap=8, barW = pcts.length? (innerW-(pcts.length-1)*gap)/pcts.length : 0;
    const svgNS="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(svgNS,"svg");
    svg.setAttribute("width",String(W)); svg.setAttribute("height",String(H));
    svg.style.background="#0b1527"; svg.style.border="1px solid #0e213b"; svg.style.borderRadius="8px";
    const x0=padL, y0=padT+innerH;

    for(let i=0;i<=5;i++){
      const y=y0-(i*(innerH/5));
      const ln=document.createElementNS(svgNS,"line");
      ln.setAttribute("x1",String(x0)); ln.setAttribute("y1",String(y));
      ln.setAttribute("x2",String(x0+innerW)); ln.setAttribute("y2",String(y));
      ln.setAttribute("stroke","#12243e"); ln.setAttribute("stroke-dasharray","3 3"); svg.appendChild(ln);
      const tl=document.createElementNS(svgNS,"text");
      tl.setAttribute("x",String(x0-8)); tl.setAttribute("y",String(y+4));
      tl.setAttribute("text-anchor","end"); tl.setAttribute("font-size","10"); tl.setAttribute("fill","#7f9fc9");
      tl.textContent=`${i*20}`; svg.appendChild(tl);
    }

    let cx=x0;
    for(let i=0;i<pcts.length;i++){
      const h=(pcts[i]/100)*innerH, y=y0-h;
      const r=document.createElementNS(svgNS,"rect");
      r.setAttribute("x",String(cx)); r.setAttribute("y",String(y));
      r.setAttribute("width",String(Math.max(0,barW))); r.setAttribute("height",String(Math.max(0,h)));
      r.setAttribute("rx","4"); r.setAttribute("fill","#2ea8ff"); r.setAttribute("stroke","#0d6ea8"); r.setAttribute("stroke-width","0.8");
      svg.appendChild(r);
      const b=document.createElementNS(svgNS,"text");
      b.setAttribute("x",String(cx+barW/2)); b.setAttribute("y",String(y0+12));
      b.setAttribute("text-anchor","middle"); b.setAttribute("font-size","10"); b.setAttribute("fill","#a9b8d0"); b.textContent=labels[i];
      svg.appendChild(b);
      const pv=document.createElementNS(svgNS,"text");
      pv.setAttribute("x",String(cx+barW/2)); pv.setAttribute("y",String(y-4));
      pv.setAttribute("text-anchor","middle"); pv.setAttribute("font-size","10"); pv.setAttribute("fill","#cfe2ff"); pv.textContent=`${pcts[i].toFixed(0)}%`;
      svg.appendChild(pv);
      cx += barW + gap;
    }
    host.appendChild(svg);
    return svg;
  };

  const svg1 = makeBar("#repStations", Array.from({length:nS},(_,i)=>`S${i+1}`), stPct);
  const svg2 = makeBar("#repPeople",  Array.from({length:useP},(_,i)=>`P${i+1}`), pPct);

  card.querySelector("#btnPrintRep")?.addEventListener("click",()=>window.print());
  card.querySelector("#btnSavePng")?.addEventListener("click",()=>{
    const svgs=[svg1,svg2];
    const w = Math.max(svg1.width.baseVal.value, svg2.width.baseVal.value);
    const h = svg1.height.baseVal.value + svg2.height.baseVal.value + 12;
    const c=document.createElement("canvas"); c.width=w; c.height=h; const ctx=c.getContext("2d");

    const loadSvg=(node)=>new Promise(res=>{
      const ser=new XMLSerializer().serializeToString(node);
      const url=URL.createObjectURL(new Blob([ser],{type:"image/svg+xml;charset=utf-8"}));
      const img=new Image(); img.onload=()=>{res({img,url});}; img.src=url;
    });

    Promise.all(svgs.map(loadSvg)).then(([a,b])=>{
      const ySplit = svg1.height.baseVal.value+12;
      ctx.drawImage(a.img,0,0); URL.revokeObjectURL(a.url);
      ctx.drawImage(b.img,0,ySplit); URL.revokeObjectURL(b.url);
      const aTag=document.createElement("a");
      aTag.href=c.toDataURL("image/png");
      aTag.download=`report-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;
      aTag.click();
    });
  });
}

/* =================== SIM =================== */
let stBusy=[], stRemain=[], stTotal=[], queueNext=[], personBusy=[], personAt=[], stColor=[], stPid=[];
function setupSim(){
  const n=appState.stationMsBase.length;
  stBusy=new Array(n).fill(false); stRemain=new Array(n).fill(0); stTotal=appState.stationMsBase.slice();
  queueNext=Array.from({length:n},()=>[]); personBusy=[]; personAt=[]; stColor=new Array(n).fill(null); stPid=new Array(n).fill(null);
  appState.stationBusyMs=new Array(n).fill(0); appState.stationIdleMs=new Array(n).fill(0);

  const useP=Math.max(0,...appState.personOfStation); for(let p=1;p<=useP;p++){ personBusy[p]=false; personAt[p]=null; }

  appState.progressRects.forEach((r,i)=>{ if(!r) return; const g=appState.stationsGeom[i]; const rtl=!!appState.progressRTL[i]; r.setAttribute("width",0); r.setAttribute("x", rtl?(g.x+g.w-6):(g.x+6)); });
  appState.progressLabels.forEach((t,i)=>{ if(t) t.textContent=`${Math.round(appState.stationTimesSec[i]||0)}s`; });

  appState.productSeq=0; appState.packCount=0; appState.packColors=[]; appState.packIds=[]; appState.packTimesSec=[];
  appState.throughput=0; setTxt("kpiThroughput","0");
  appState.simClockSec=0; renderClock(); renderPack();
  const bar=$("simProgBar"); if(bar) bar.style.width="0%";
}
function clearStationsVisual(){
  appState.progressRects.forEach((r,i)=>{ if(!r) return; const g=appState.stationsGeom[i]; const rtl=!!appState.progressRTL[i]; r.setAttribute("width",0); r.setAttribute("x", rtl?(g.x+g.w-6):(g.x+6)); });
  appState.progressLabels.forEach((t,i)=>{ if(t) t.textContent=`${Math.round(appState.stationTimesSec[i]||0)}s`; });
  appState.stationRects.forEach((rc)=> rc && rc.setAttribute("stroke","#223"));
  const useP=Math.max(0,...appState.personOfStation); for(let p=1;p<=useP;p++){ personBusy[p]=false; personAt[p]=null; }
}
function renderClock(){ const s=Math.floor(appState.simClockSec); setTxt("pillClock", `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`); }

function pushNextFrom(s, tok){
  const n=stBusy.length;
  let k=s+1;
  while(k < n && appState.stationMsBase[k] <= 0){
    if(k === n-1){
      appState.throughput++; setTxt("kpiThroughput", appState.throughput);
      appState.packCount++; appState.packColors.push(tok.color||"#8ecae6"); appState.packIds.push(tok.id||"");
      appState.packTimesSec.push(appState.simClockSec); renderPack();
      return;
    }
    k++;
  }
  if(k >= n){
    appState.throughput++; setTxt("kpiThroughput", appState.throughput);
    appState.packCount++; appState.packColors.push(tok.color||"#8ecae6"); appState.packIds.push(tok.id||"");
    appState.packTimesSec.push(appState.simClockSec); renderPack();
    return;
  }
  queueNext[k].push(tok);
}

function scheduleIdlePeople(){
  const n = stBusy.length;
  const byP = {};
  for(let s=0;s<n;s++){ const p=appState.personOfStation[s]; (byP[p] ||= []).push(s); }
  const canStart = (s)=> (s===0) ? true : (queueNext[s].length>0);

  for(const key in byP){
    const p = +key;
    if(personBusy[p]) continue;
    const list = byP[p].slice().sort((a,b)=>a-b);
    let chosen=-1;
    for(let i=list.length-1;i>=0;i--){
      const s = list[i];
      if(!stBusy[s] && canStart(s)){ chosen = s; break; }
    }
    if(chosen<0) continue;
    let tok;
    if(chosen===0){
      const color = COLORS[ appState.productSeq % COLORS.length ];
      tok = { id: `Prd${++appState.productSeq}`, color };
    }else{
      tok = queueNext[chosen].shift();
      if(!tok) continue;
    }
    startStation(chosen, tok, p);
  }
}
function startStation(s,tok,p){
  stBusy[s]=true; stRemain[s]=appState.stationMsBase[s]; stTotal[s]=appState.stationMsBase[s];
  stColor[s]=tok.color; stPid[s]=tok.id;
  const prog=appState.progressRects[s], g=appState.stationsGeom[s], rtl=!!appState.progressRTL[s];
  if(prog){ prog.setAttribute("width",0); prog.setAttribute("fill",tok.color); prog.setAttribute("stroke",darker(tok.color)); prog.setAttribute("x", rtl?(g.x+g.w-6):(g.x+6)); }
  personBusy[p]=true; personAt[p]=s;
}

function loop(ts){
  if(!appState.running) return;
  if(!appState.lastTs) appState.lastTs = ts;
  const dt = ts - appState.lastTs;
  appState.lastTs = ts;

  const speed = Math.max(1, +$("speed").value || appState.speed);
  appState.simClockSec += (dt * speed) / 1000;
  renderClock();

  if (appState.activeWorkSec){
    const bar = $("simProgBar");
    if (bar){
      const pct = Math.max(0, Math.min(1, appState.simClockSec/appState.activeWorkSec)) * 100;
      bar.style.width = pct.toFixed(2) + "%";
    }
  }

  if (appState.activeWorkSec && appState.simClockSec >= appState.activeWorkSec){
    appState.simClockSec = appState.activeWorkSec;
    renderClock();
    clearStationsVisual();
    pause();
    renderReport();
    return;
  }

  const n = stBusy.length;

  scheduleIdlePeople();

  for (let s=0; s<n; s++){
    let done = 0;
    if (stBusy[s]){
      stRemain[s] -= dt * speed;
      appState.stationBusyMs[s] += dt * speed;
      const total = stTotal[s] || 1;
      done = Math.max(0, Math.min(1, 1 - (stRemain[s] / total)));
    } else {
      appState.stationIdleMs[s] += dt * speed;
      done = 0;
    }
    const geom = appState.stationsGeom[s], prog = appState.progressRects[s];
    if (geom && prog){
      const maxW = (geom.w - 12);
      let w = Math.max(0, maxW * done);
      if (stBusy[s] && w < 8) w = 8;
      if (appState.progressRTL[s]){
        prog.setAttribute("width", w);
        prog.setAttribute("x", geom.x + geom.w - 6 - w);
      } else {
        prog.setAttribute("width", w);
        prog.setAttribute("x", geom.x + 6);
      }
    }
  }

  for (let s=n-1; s>=0; s--){
    if (stBusy[s] && stRemain[s] <= 0){
      stBusy[s] = false; stRemain[s] = 0;

      const p    = appState.personOfStation[s];
      const col  = stColor[s];
      const pid  = stPid[s];

      const geom = appState.stationsGeom[s], prog = appState.progressRects[s];
      if (geom && prog){
        prog.setAttribute("width", 0);
        prog.setAttribute("x", appState.progressRTL[s] ? (geom.x + geom.w - 6) : (geom.x + 6));
      }

      const tok = { id: pid, color: col };

      if (s === n-1){
        appState.throughput++; setTxt("kpiThroughput", appState.throughput);
        appState.packCount++; appState.packColors.push(col||"#8ecae6"); appState.packIds.push(pid||"");
        appState.packTimesSec.push(appState.simClockSec); renderPack();
      } else {
        pushNextFrom(s, tok);
      }

      stColor[s] = null; stPid[s] = null;
      personBusy[p] = false; personAt[p] = null;

      scheduleIdlePeople();
    }
  }

  appState.raf = requestAnimationFrame(loop);
}

/* =================== CONTROLS =================== */
export function start(){ if(appState.running) return; appState.running=true; appState.lastTs=0; scheduleIdlePeople(); appState.raf=requestAnimationFrame(loop); }
export function pause(){ if(!appState.running) return; appState.running=false; if(appState.raf) cancelAnimationFrame(appState.raf); }
export function reset(){ pause(); setupSim(); renderPeople(); renderOps(); renderPack(); renderSuggestions(); computeActiveWorkSec(); }

/* =================== SCENARIO / EDITOR / EXPORT =================== */
function scenario(){ 
  return { 
    meta:{ts:Date.now()}, 
    inputs:{ 
      lineType:appState.lineType, people:appState.people, maxStationsPerPerson:appState.maxStationsPerPerson, 
      speed:appState.speed, targetCycle:appState.targetCycle,
      shiftStart:$("shiftStart")?.value||"", shiftEnd:$("shiftEnd")?.value||"",
      breaksTotal:$("breaksTotal")?.value||"", fanOut: appState.fanOut 
    }, 
    operations:appState.operations, personNames:appState.personNames, personPrefs:appState.personPrefs.map(s=>s?Array.from(s):null) 
  }; 
}
function applyScenario(sc){ 
  $("lineType").value=sc.inputs?.lineType??7; $("people").value=sc.inputs?.people??6; $("maxStationsPerPerson").value=sc.inputs?.maxStationsPerPerson??4; 
  $("speed").value=sc.inputs?.speed??50; $("targetCycle").value=sc.inputs?.targetCycle??""; 
  $("shiftStart").value=sc.inputs?.shiftStart??"08:00"; $("shiftEnd").value=sc.inputs?.shiftEnd??"16:30"; 
  $("breaksTotal").value=sc.inputs?.breaksTotal??"00:00"; 
  if($("fanOut")) $("fanOut").value=sc.inputs?.fanOut??1; 
  $("opsJson").value=JSON.stringify(sc.operations||[],null,2); 
  applyAll(); 
  setTimeout(()=>{ 
    (sc.personNames||[]).forEach((nm,i)=>{const e=$(`p${i+1}name`); if(e) e.value=nm;}); 
    (sc.personPrefs||[]).forEach((arr,i)=>{const e=$(`prefP${i+1}`); if(e) e.value=(arr||[]).join(",");}); 
  },0); 
}
function saveScenario(){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(scenario(),null,2)],{type:"application/json"})); a.download=`line-balance-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`; a.click(); URL.revokeObjectURL(a.href); }
function loadScenarioFromFile(f){ const fr=new FileReader(); fr.onload=()=>{ try{ applyScenario(JSON.parse(String(fr.result||"{}"))); }catch{ alert("Invalid scenario file"); } }; fr.readAsText(f); }
function csvEscape(s){s=String(s||"");return(s.includes(",")||s.includes('"')||s.includes("\n"))?`"${s.replace(/"/g,'""')}"`:s;}
function exportCSV(){ const n=appState.stationTimesSec.length, useP=Math.max(0,...appState.personOfStation), lines=[ 
  "Section,Key,Value", 
  `Inputs,LineType,${appState.lineType}`, `Inputs,People,${appState.people}`, `Inputs,MaxStationsPerPerson,${appState.maxStationsPerPerson}`, 
  `Inputs,Speed,${appState.speed}`, `Inputs,TargetCycle,${appState.targetCycle||""}`, `Inputs,FanOut,${appState.fanOut||1}`,
  `Inputs,ShiftStart,${$("shiftStart")?.value||""}`, `Inputs,ShiftEnd,${$("shiftEnd")?.value||""}`, `Inputs,TotalBreaks,${$("breaksTotal")?.value||""}`,
  `KPI,Throughput,${appState.throughput}`, `KPI,Bottleneck,${appState.kpiBottleneck}`, `KPI,BalanceRate,${appState.kpiBalance}`, 
  "", "Stations,Station,TotalSec,AssignedPerson" 
]; 
for(let s=0;s<n;s++) lines.push(`Station,S${s+1},${appState.stationTimesSec[s]||0},P${appState.personOfStation[s]||"-"}`);
lines.push("", "People,Person,Name,Pref,Stations"); 
for(let p=1;p<=useP;p++){ const name=appState.personNames?.[p-1]||`P${p}`, pref=(appState.personPrefs?.[p] && Array.from(appState.personPrefs[p]).sort((a,b)=>a-b).join(","))||"", stations=appState.personOfStation.map((pp,i)=>pp===p?`S${i+1}`:null).filter(Boolean).join(" "); lines.push(`Person,P${p},${csvEscape(name)},${csvEscape(pref)},${csvEscape(stations)}`);} 
const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"})); a.download=`line-balance-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`; a.click(); URL.revokeObjectURL(a.href); 
}

/* =================== INLINE PICKERS =================== */
/* Basit popup: time (AM/PM) ve duration için */
(function addPickerStyles(){
  const css = `.picker-pop{position:absolute;z-index:9999;background:#0c172b;border:1px solid #1b2a44;border-radius:10px;padding:8px;box-shadow:0 6px 22px rgba(0,0,0,.35)}
  .picker-pop .row{display:flex;gap:6px;align-items:center}
  .picker-pop select,.picker-pop button{background:#0f1b2d;color:#cfe2ff;border:1px solid #1b2a44;border-radius:8px;padding:6px}
  .picker-pop button{cursor:pointer}
  .picker-pop .ok{background:#163a63;border-color:#1f5b94}`;
  const st=document.createElement("style"); st.textContent=css; document.head.appendChild(st);
})();
function attachPickers(){
  const makePopup=(host,content,onOk)=>{
    const r=host.getBoundingClientRect();
    const pop=document.createElement("div"); pop.className="picker-pop";
    pop.style.left=(window.scrollX+r.left)+"px"; pop.style.top=(window.scrollY+r.bottom+6)+"px";
    pop.innerHTML=content;
    document.body.appendChild(pop);
    const close=()=>{ pop.remove(); document.removeEventListener("click",outside,true); };
    function outside(e){ if(!pop.contains(e.target) && e.target!==host){ close(); } }
    document.addEventListener("click",outside,true);
    pop.querySelector(".ok")?.addEventListener("click",()=>{ onOk(pop); close(); });
  };

  // TIME picker (AM/PM)
  document.querySelectorAll('input[data-picker="time"]').forEach(inp=>{
    inp.addEventListener("focus", ()=>{
      const val = inp.value.trim();
      let H = (/^(\d\d):/.exec(val)?.[1])|0, M = (/:([0-9]{2})$/.exec(val)?.[1])|0;
      let ampm = H>=12 ? "PM":"AM";
      let h12 = H%12; if(h12===0) h12=12;

      const hrs=[...Array(12)].map((_,i)=>i+1).map(n=>`<option ${n===h12?"selected":""}>${n}</option>`).join("");
      const mins=[0,5,10,15,20,25,30,35,40,45,50,55].map(n=>`<option ${n===M?"selected":""}>${String(n).padStart(2,"0")}</option>`).join("");
      const html=`<div class="row" style="gap:8px">
        <select class="h">${hrs}</select>
        <span>:</span>
        <select class="m">${mins}</select>
        <select class="ap"><option ${ampm==="AM"?"selected":""}>AM</option><option ${ampm==="PM"?"selected":""}>PM</option></select>
        <button class="ok">OK</button>
      </div>`;
      makePopup(inp, html, (pop)=>{
        const h = +pop.querySelector(".h").value;
        const m = +pop.querySelector(".m").value;
        const ap= pop.querySelector(".ap").value;
        let hh = (ap==="PM"? (h%12)+12 : (h%12));
        if(hh===24) hh=12;
        inp.value = `${String(hh).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
        computeActiveWorkSec();
      });
    });
  });

  // DURATION picker (HH:MM)
  document.querySelectorAll('input[data-picker="duration"]').forEach(inp=>{
    inp.addEventListener("focus", ()=>{
      const [h0,m0]=(inp.value||"00:00").split(":").map(x=>+x||0);
      const hrs=[...Array(13)].map((_,i)=>`<option ${i===h0?"selected":""}>${i}</option>`).join("");
      const mins=[0,5,10,15,20,25,30,35,40,45,50,55].map(n=>`<option ${n===m0?"selected":""}>${String(n).padStart(2,"0")}</option>`).join("");
      const html=`<div class="row" style="gap:8px">
        <select class="h">${hrs}</select>
        <span>:</span>
        <select class="m">${mins}</select>
        <button class="ok">OK</button>
      </div>`;
      makePopup(inp, html, (pop)=>{
        const h=+pop.querySelector(".h").value, m=+pop.querySelector(".m").value;
        inp.value = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
        computeActiveWorkSec();
      });
    });
  });
}

/* =================== EDITOR / EXPORT =================== */
function openOpsEditor(){
  const ops=appState.operations.slice();
  const wrap=document.createElement("div"); wrap.className="modal-backdrop";
  wrap.innerHTML=`<div class="modal"><h3>Operations Editor</h3><div class="hint">Double-click cells to edit. Use <b>Add Row</b> to append.</div>
  <table id="opsTbl" style="width:100%;margin-top:6px"><thead><tr><th style="width:70px">ID</th><th>Name</th><th style="width:120px">Time (s)</th><th style="width:120px">Station</th><th style="width:80px"></th></tr></thead>
  <tbody>${ops.map(o=>`<tr><td class="num">${o.id}</td><td contenteditable="true">${o.name||""}</td><td contenteditable="true" class="num">${o.durationSec||0}</td><td contenteditable="true" class="num">${o.preferredStation??""}</td><td><button class="btn warn btnDel">Del</button></td></tr>`).join("")}</tbody></table>
  <div class="row" style="gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn" id="btnAddRow">Add Row</button><button class="btn" id="btnClose">Cancel</button><button class="btn primary" id="btnSaveOps">Save & Apply</button></div></div>`;
  document.body.appendChild(wrap);
  const tb=wrap.querySelector("tbody");
  wrap.querySelector("#btnAddRow").onclick=()=>{ const next=(ops.length?Math.max(...ops.map(o=>+o.id||0)):0)+1; const tr=document.createElement("tr"); tr.innerHTML=`<td class="num">${next}</td><td contenteditable="true">OP-${next}</td><td contenteditable="true" class="num">30</td><td contenteditable="true" class="num"></td><td><button class="btn warn btnDel">Del</button></td>`; tb.appendChild(tr); };
  tb.addEventListener("click",(e)=>{ if(e.target.closest(".btnDel")) e.target.closest("tr").remove(); });
  wrap.querySelector("#btnClose").onclick=()=>wrap.remove();
  wrap.querySelector("#btnSaveOps").onclick=()=>{ const rows=Array.from(tb.querySelectorAll("tr")); const newOps=rows.map(r=>{const t=r.querySelectorAll("td"); const st=t[3].textContent.trim(); return { id:+t[0].textContent.trim(), name:t[1].textContent.trim(), durationSec:+t[2].textContent.trim()||0, preferredStation: st===""?null:(+st||null) };}); $("opsJson").value=JSON.stringify(newOps,null,2); wrap.remove(); applyAll(); };
}

/* =================== BIND / INIT =================== */
function bind(){
  $("btnApply")?.addEventListener("click",applyAll);
  $("btnStart")?.addEventListener("click",start);
  $("btnPause")?.addEventListener("click",pause);
  $("btnReset")?.addEventListener("click",reset);
  $("btnSave")?.addEventListener("click",saveScenario);
  $("btnLoad")?.addEventListener("click",()=>$("fileLoad")?.click());
  $("fileLoad")?.addEventListener("change",(e)=>{const f=e.target.files?.[0]; if(f) loadScenarioFromFile(f); e.target.value="";});
  $("btnSetBaseline")?.addEventListener("click",()=>appState.baseline=scenario());
  $("btnCompare")?.addEventListener("click",()=>alert("Baseline compare: use Export CSV or KPI deltas."));
  $("btnMC")?.addEventListener("click",()=>alert("Monte Carlo: run after you’re happy with flow."));
  $("btnExportCSV")?.addEventListener("click",exportCSV);
  $("btnPrint")?.addEventListener("click",()=>window.print());
  $("btnEditOps")?.addEventListener("click",openOpsEditor);

  // canlı hesaplama (start/end/total breaks)
  const recalcDeb = debounce(computeActiveWorkSec, 120);
  $("shiftStart")?.addEventListener("input", recalcDeb);
  $("shiftEnd")?.addEventListener("input", recalcDeb);
  $("breaksTotal")?.addEventListener("input", recalcDeb);

  attachPickers();
}
function init(){
  bind();
  const ta=$("opsJson"); if(ta && !ta.value.trim()){ const sample=Array.from({length:20},(_,i)=>({id:i+1,name:`OP-${i+1}`,durationSec:Math.round(30+Math.random()*80)})); ta.value=JSON.stringify(sample,null,2); }
  applyAll();
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
