// Importer: CSV/JSON into #opsJson & appState
import { applyAll } from "./main.js";

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  const headers = lines[0].split(",").map(h=>h.trim());
  const rows = lines.slice(1).map(l=>l.split(",")).map(arr=>{
    const o={}; headers.forEach((h,i)=> o[h]= (arr[i]??"").trim()); return o;
  });
  // Normalize
  const ops = rows.map(r=> ({
    // Fixed station mapping if provided as columns 'Station 1..20'
    station: (function(){
      for (let s=1; s<=20; s++){
        const key = `Station ${s}`;
        if (r[key]!==undefined && String(r[key]).trim()!=='') return s; }
      return undefined; })(),
    id: parseInt(r.id||r.ID||r.Id||r.task||r.Task||r.OperID||r["Operatin ID"])||undefined,
    name: r.name || r.Name || r.operation || r.Operation || "",
    durationSec: parseInt(r.durationSec || r["duration"] || r["Operation Time (second)"] || r["timeSec"])||0,
    predecessors: (r.predecessors || r["Predecessor Task"] || "").split(/[^0-9]+/).filter(x=>x).map(x=>parseInt(x)),
    requiredPeople: r.requiredPeople ? parseInt(r.requiredPeople) : undefined,
    preferredStation: r.preferredStation ? parseInt(r.preferredStation) : undefined
  }));
  return { operations: ops };
}

export function bindImporter() {
  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = (f.name.split('.').pop()||'').toLowerCase();
    const txt = await f.text();
    let data;
    if (ext==="json") {
      data = JSON.parse(txt);
    } else { // csv
      data = parseCSV(txt);
    }
    document.getElementById("opsJson").value = JSON.stringify(data, null, 2);
    applyAll();
    e.target.value = "";
  });
}
