# Line Balancer SPA (MVP)
Single-page app for line balancing and accelerated simulation.

## Features
- 7 or 20 station line selection
- Parametric shift times and breaks (HH:MM–HH:MM)
- JSON operation input (ordered), auto balance via ordered linear partition
- KPIs: Throughput, Cycle Time, Bottleneck, Balance Rate
- Start / Pause / Reset simulation with speed multiplier
- Import sample ops, Export JSON

## Run
Open a static server in the project root and visit `index.html`:
- **VS Code**: Install *Live Server* extension → Right click `index.html` → *Open with Live Server*.
- **Python**: `python -m http.server 5500` → http://localhost:5500

## Data
- `data/sample-ops.json` contains a sample operation list.
- Paste or edit operations in the sidebar JSON textarea. Required fields:
```json
{ "operations":[ { "name": "Op A", "durationSec": 75 } ] }
```
Optional: `requiredPeople`, `preferredStation`.

## Next
- Manual drag & drop override per station
- Multi-person assignment visualization
- Support dependencies and station preferences in the balancer
- CSV import/export
