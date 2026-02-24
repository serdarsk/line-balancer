
// SVG rectangular layout with token animation
export function renderLayoutSVG(opts) {
  const { lineStations, stationTimes, activeIndex, tokens, packedCount } = opts;
  const svg = document.getElementById("lineCanvas");
  if (!svg) return;
  const W = svg.clientWidth || 1080;
  const H = 340;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  const padX = 24, padY = 24;
  const cols = Math.min(lineStations, 10);
  const rows = lineStations > 10 ? 2 : 1;
  const gapX = 12, gapY = 24;
  const cellW = (W - padX*2 - gapX*(cols-1)) / cols;
  const cellH = 64;

  // Station rects
  const names = Array.from({length: lineStations}, (_,i)=> `Station ${i+1}`);
  const loads = stationTimes || Array.from({length: lineStations}, ()=> 0);

  for (let i=0; i<lineStations; i++) {
    const r = rows===2 ? Math.floor(i/cols) : 0;
    const c = rows===2 ? (i%cols) : i;
    const x = padX + c*(cellW+gapX);
    const y = padY + r*(cellH+gapY) + 40;

    const g = el('g');
    const rect = el('rect', {x, y, width: cellW, height: cellH, class: 'station-node', 'data-station-idx': i});
    const ring = el('rect', {x:x-4, y:y-4, width: cellW+8, height: cellH+8, rx:10, ry:10, class:'active-ring-svg', opacity: (activeIndex===i ? 1:0)});
    const label = el('text', {x: x+cellW/2, y: y+cellH/2-6, class:'station-label'}, names[i]);
    const load = el('text', {x: x+cellW/2, y: y+cellH/2+12, class:'station-load'}, Math.round(loads[i]||0)+'s');
    g.append(rect, ring, label, load);
    svg.appendChild(g);
  }

  // Token lane: draw tokens as small squares above stations
  const tokenSize = 16;
  (tokens||[]).forEach(t => {
    const idx = t.station;
    const r = rows===2 ? Math.floor(idx/cols) : 0;
    const c = rows===2 ? (idx%cols) : idx;
    const x = padX + c*(cellW+gapX) + cellW/2 - tokenSize/2;
    const y = padY + r*(cellH+gapY) + 16; // above the station
    const tok = el('rect', {x, y, width: tokenSize, height: tokenSize, class:'token'});
    svg.appendChild(tok);
  });

  // Packaging counter box (right side)
  const packX = W - padX - 140, packY = 10;
  svg.appendChild(el('rect', {x: packX, y: packY, width: 140, height: 32, rx:8, ry:8, class:'packbox'}));
  svg.appendChild(el('text', {x: packX+70, y: packY+20, class:'packlabel'}, `Packed: ${packedCount||0}`));

  function el(tag, attrs={}, text) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text!=null) e.textContent = text;
    return e;
  }
}

// Click delegation
document.getElementById("lineCanvas").addEventListener("click", (e)=>{
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute("data-station-idx")!=null) {
    const idx = parseInt(t.getAttribute("data-station-idx"));
    const ev = new CustomEvent("station-click", { detail: { index: idx } });
    document.dispatchEvent(ev);
  }
});
