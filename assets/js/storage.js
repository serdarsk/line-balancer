export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
}

export async function loadSampleOps() {
  try {
    const res = await fetch("data/sample-ops.json", {cache:"no-store"});
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (e) {
    // Fallback inline sample
    return {
      operations: [
        { name:"Seat Frame Prep", durationSec: 65 },
        { name:"Back Frame Prep", durationSec: 70 },
        { name:"Cushion Fit", durationSec: 55 },
        { name:"Armrest Assy", durationSec: 90 },
        { name:"Trim & Cover", durationSec: 80 },
        { name:"Harness Routing", durationSec: 75 },
        { name:"Heater Pad", durationSec: 85 },
        { name:"QC & Torque", durationSec: 60 },
        { name:"Labeling", durationSec: 40 },
        { name:"Final Check", durationSec: 50 }
      ]
    };
  }
}
