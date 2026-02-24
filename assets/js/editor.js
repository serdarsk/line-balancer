import { appState, applyAll } from "./main.js";

function renderEditor() {
  const host = document.getElementById("opsEditor");
  if (!host) return;
  let obj;
  try { obj = JSON.parse(document.getElementById("opsJson").value || "{}"); } catch { obj = {operations: []}; }
  const arr = Array.isArray(obj) ? obj : (obj.operations || []);

  const tbl = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>
    <th style="width:52px">ID</th>
    <th>Name</th>
    <th style="width:120px">Duration (sec)</th>
    <th style="width:160px">Predecessors</th>
    <th style="width:120px">Req. People</th>
    <th style="width:120px">Pref. Station</th>
    <th style="width:120px"></th>
  </tr>`;

  const tbody = document.createElement("tbody");

  arr.forEach((o,idx)=>{
    const tr = document.createElement("tr");

    function cellInput(val, placeholder, onChange, type="text") {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = type; inp.value = (val ?? ""); inp.placeholder = placeholder||"";
      inp.addEventListener("input", ()=> onChange(inp.value));
      td.appendChild(inp); return td;
    }
    // ID
    tr.appendChild(cellInput(o.id ?? (idx+1), "", v=> { o.id = parseInt(v)||undefined; }, "number"));
    // Name
    tr.appendChild(cellInput(o.name ?? `OP-${idx+1}`, "Name", v=> { o.name = v; }));
    // Duration
    tr.appendChild(cellInput(o.durationSec ?? 30, "sec", v=> { o.durationSec = parseInt(v)||0; }, "number"));
    // Predecessors
    tr.appendChild(cellInput((o.predecessors||[]).join(","), "e.g. 1,2", v=> {
      o.predecessors = (v||"").split(/[^0-9]+/).filter(x=>x).map(x=>parseInt(x));
    }));
    // Required People
    tr.appendChild(cellInput(o.requiredPeople ?? "", "", v=> { o.requiredPeople = v? parseInt(v): undefined; }, "number"));
    // Preferred Station
    tr.appendChild(cellInput(o.preferredStation ?? "", "", v=> { o.preferredStation = v? parseInt(v): undefined; }, "number"));

    const tdBtns = document.createElement("td");
    tdBtns.className = "rowBtns";
    const del = document.createElement("button"); del.textContent = "Delete"; del.className="mini";
    del.addEventListener("click", ()=> { arr.splice(idx,1); sync(); });
    tdBtns.appendChild(del);
    tr.appendChild(tdBtns);

    tbody.appendChild(tr);
  });

  tbl.appendChild(thead); tbl.appendChild(tbody);
  host.innerHTML = ""; host.appendChild(tbl);

  function sync() {
    document.getElementById("opsJson").value = JSON.stringify({operations: arr}, null, 2);
    renderEditor();
    applyAll();
  }
}

export function bindEditor() {
  const obs = new MutationObserver(()=> renderEditor());
  const area = document.getElementById("opsJson");
  if (area) { obs.observe(area, {characterData:true, subtree:true, childList:true}); }
  renderEditor();
}
