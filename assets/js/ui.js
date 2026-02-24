// assets/js/ui.js
"use strict";

// Tek import bloğu — tekrar yok
import { appState, applyAll, start, pause, reset } from "./main.js";
import { downloadJSON, loadSampleOps } from "./storage.js";
import { bindImporter } from "./importer.js";
import { bindEditor } from "./editor.js";

// ---- Helpers ----
const $ = (id) => document.getElementById(id);

function parseTextarea() {
  try {
    const raw = $("opsJson").value.trim();
    if (!raw) return { operations: [] };
    const obj = JSON.parse(raw);
    return Array.isArray(obj) ? { operations: obj } : (obj?.operations ? obj : { operations: [] });
  } catch (e) {
    console.warn("opsJson parse error:", e);
    return { operations: [] };
  }
}

function updatePills() {
  $("pillLine").textContent = $("lineType").value;
  $("pillPeople").textContent = $("people").value;
  $("pillSpeed").textContent = $("speed").value;
  $("pillTarget").textContent = $("targetCycle").value || "—";
}

// ---- UI bindings ----
function bindUI() {
  if (window.__lb_ui_bound) return;
  window.__lb_ui_bound = true;

  $("apply").addEventListener("click", () => {
    updatePills();
    applyAll();
  });

  $("exportJson").addEventListener("click", () => {
    const data = appState?.operations?.length ? { operations: appState.operations } : parseTextarea();
    downloadJSON(data, "operations.json");
  });

  $("loadSample").addEventListener("click", async () => {
    const sample = await loadSampleOps();
    $("opsJson").value = JSON.stringify(sample, null, 2);
    applyAll();
  });

  $("startBtn").addEventListener("click", start);
  $("pauseBtn").addEventListener("click", pause);
  $("resetBtn").addEventListener("click", reset);

  bindImporter();

  $("addOp").addEventListener("click", () => {
    const obj = parseTextarea();
    const arr = obj.operations;
    const id = arr.length ? ((arr[arr.length - 1].id ?? arr.length) + 1) : 1;
    arr.push({ id, name: `OP-${id}`, durationSec: 30, predecessors: [] });
    $("opsJson").value = JSON.stringify({ operations: arr }, null, 2);
    applyAll();
  });

  // Form değişince üstteki pill’leri güncelle
  ["lineType","people","speed","targetCycle"].forEach(id => {
    $(id).addEventListener("input", updatePills);
    $(id).addEventListener("change", updatePills);
  });

  // ---- Station modal ----
  document.addEventListener("station-click", (e) => {
    const idx = e?.detail?.index ?? 0;
    const bucket = appState?.stationBuckets?.[idx] || [];
    const ops = bucket.map(i => appState.operations[i]);

    $("modalTitle").textContent = `Station ${idx + 1} — ${ops.length} ops`;

    let cum = 0;
    let html = '<table class="table-compact"><thead><tr><th>#</th><th>Operation</th><th>Time (s)</th><th>Cumulative (s)</th></tr></thead><tbody>';
    ops.forEach((o, k) => {
      const t = Number(o?.durationSec || 0);
      cum += t;
      html += `<tr><td>${o?.id ?? (k + 1)}</td><td>${o?.name || ""}</td><td>${t}</td><td>${cum}</td></tr>`;
    });
    html += "</tbody></table>";

    $("modalBody").innerHTML = html;
    $("stationModal").classList.remove("hidden");
  });

  $("modalClose").addEventListener("click", () => {
    $("stationModal").classList.add("hidden");
  });
}

// ---- Init ----
(function init() {
  bindUI();

  // Textarea doluysa onu kullan; boşsa sample yükle
  const raw = $("opsJson")?.value?.trim() ?? "";
  if (!raw) {
    loadSampleOps().then(sample => {
      $("opsJson").value = JSON.stringify(sample, null, 2);
      updatePills();
      applyAll();
      bindEditor();
    });
  } else {
    updatePills();
    applyAll();
    bindEditor();
  }
})();
