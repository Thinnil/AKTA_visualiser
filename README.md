# ÄKTA & Wyatt SEC-MALS Chromatogram & Stoichiometry Suite

An interactive, high-precision single-page web application for visualizing, analyzing, integrating, and publishing chromatography and multi-angle light scattering (SEC-MALS) data from ÄKTA (UNICORN) and Wyatt (ASTRA `.afe7`, `.afs7`, CSV) instruments.

---

## 🌟 Key Features

### 1. Unified Multi-Instrument Data Engine
- **ÄKTA / UNICORN Support**: Ingests UTF-8, UTF-16 LE/BE, comma- or tab-delimited chromatograms. Automatically detects absorbance wavelengths (UV 280, 254), conductivity, pH, and buffer gradients (%B).
- **Wyatt ASTRA MALS Ingestion**: Supports direct parsing of raw 8-angle photodiode signals, dRI refractive index curves, laser monitor data, and extracted molar mass traces directly from `.afe7`, `.afs7`, and ASTRA CSV files.
- **Dynamic Multi-Y Scaling**: Intelligent auto-routing of absorbance curves to the primary axis, buffer/conductivity to secondary axes, and slice molar masses ($M_w$) to a logarithmic secondary axis (1 to 10,000+ kDa).

### 2. Segmented 3-Window Analysis Workflow
- **Window 1: Baseline Studio**:
  - Interactive multi-plan baseline tare and dark current correction (Single tare, 2-point linear baseline drift, multi-point polynomial).
  - Individual photodiode enable/disable checkboxes (e.g., masking noisy low-angle $32^\circ$ detectors).
  - Real-time live preview of baseline-subtracted Rayleigh ratios.
- **Window 2: Workspace & Peak Integration**:
  - Drag-to-zoom and click-boundary peak selection.
  - One-click **Auto-Fit MW** standardized molecular weight calculation.
  - Multi-run overlay alignment with auto-alignment and micro-nudge offsets (`±0.2 mL`).
  - SEC Column Calibration engine with presets (Superdex 200, Superose 6, Superdex 75, TSK4000, TSK6000, and customizable retention-time standards in minutes or mL).
- **Window 3: Figure Editor**:
  - Split-screen live publication styling editor.
  - Customizable typography, axis titles, labels, tick intervals, and legend geometry.
  - Vector and high-DPI export for journals and presentation slides.

---

## 🚀 How to Run

### Simplest (Direct in Browser)
1. Double-click `index.html` in any web browser (Chrome, Edge, Firefox, Safari).
2. No Node.js, compilation, or server setup required. All external rendering libraries (Chart.js, Lucide Icons, pako, sql.js) load via CDN.

### Local Python Server (Optional)
If running in a local environment:
```powershell
python -m http.server 8000
```
Then navigate to: `http://localhost:8000` in your browser.

---

## 📁 Repository Structure
- `index.html`: Complete single-page user interface and modal layout.
- `app.js`: High-performance mathematical engine, Debye/Zimm fits, LTTB decimation, and canvas rendering.
- `styles.css`: Dark/light scientific styling, responsive layout, and interactive modal styling.
- `verify_wyatt_mals.py`: Python validation script for Wyatt MALS calculations.
- `verify_auc.py`: Python validation script for trapezoidal peak integration.
- `verify_universal.py`: Python validation script for universal delimiter and encoding parsing.

---
*Maintained by Thinnil*
