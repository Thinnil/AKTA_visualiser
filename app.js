// ==========================================================================
// ÄKTA & Wyatt SEC-MALS Chromatogram Analyst & Stoichiometry Suite
// Complete WebAssembly SQLite + GZIP / UNICORN UTF-16LE & CSV Parser
// ==========================================================================

// Global Application State
let rawData = null; // { type: 'simple'|'unicorn'|'wyatt_astra', curves: { name: [{ml, val}] }, fractions: [], injections: [], mals: {...}, metadata: {...} }
let activeOverlays = []; // array of { file, name, rawRun, effectiveOffset }
let decimatedCurves = Object.create(null); // name -> [{ml, val}]
let curveColors = Object.create(null); // name -> hexColor
let curveVisibility = Object.create(null); // name -> boolean
let activeCurveForIntegration = null;
let showFractions = true;
let showMolarMassOverlay = true;

// Monochromatic LS Detectors State
let monoLsEnabled = false;
let monoLsBaseColor = '#6366f1';

// 3-Window View Switcher State
let currentView = 'main-workspace'; // 'baseline-studio' | 'main-workspace' | 'figure-editor'
let baselineChartInstance = null;
let figureEditorChartInstance = null;
// Interaction Mode State: 'zoom' (Box zoom drag) | 'peak' (Click peak boundaries)
let currentInteractionMode = 'zoom';
window.currentInteractionMode = 'zoom';

function setChartInteractionMode(mode) {
    currentInteractionMode = mode;
    window.currentInteractionMode = mode;
    const zoomBtn = document.getElementById('chart-mode-zoom-btn');
    const peakBtn = document.getElementById('chart-mode-peak-btn');
    if (zoomBtn && peakBtn) {
        if (mode === 'zoom') {
            zoomBtn.classList.add('active');
            zoomBtn.style.background = 'var(--accent)';
            zoomBtn.style.color = '#fff';
            peakBtn.classList.remove('active');
            peakBtn.style.background = 'transparent';
            peakBtn.style.color = 'var(--text-secondary)';
        } else {
            peakBtn.classList.add('active');
            peakBtn.style.background = 'var(--accent)';
            peakBtn.style.color = '#fff';
            zoomBtn.classList.remove('active');
            zoomBtn.style.background = 'transparent';
            zoomBtn.style.color = 'var(--text-secondary)';
        }
    }
    if (clickInstructions) {
        if (mode === 'zoom') {
            clickInstructions.innerHTML = `<i data-lucide="zoom-in" style="width:12px; height:12px; vertical-align:middle;"></i> <strong>Drag mouse across chart</strong> to zoom into region &bull; <strong>Double-click</strong> to reset`;
        } else {
            clickInstructions.innerHTML = `<i data-lucide="mouse-pointer" style="width:12px; height:12px; vertical-align:middle;"></i> <strong>Click chart twice</strong> to select peak boundaries &bull; Press <strong>Esc</strong> to cancel`;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: clickInstructions });
    }
    if (chartInstance && chartInstance.options && chartInstance.options.plugins && chartInstance.options.plugins.zoom && chartInstance.options.plugins.zoom.zoom && chartInstance.options.plugins.zoom.zoom.drag) {
        chartInstance.options.plugins.zoom.zoom.drag.enabled = (mode === 'zoom');
        chartInstance.update('none');
    }
}
window.setChartInteractionMode = setChartInteractionMode;

// Publication Normalization State
let normalizeCurves = false;

// SEC Column Calibration Presets & State
const COLUMN_CALIBRATION_PRESETS = {
    superdex200: {
        name: 'Cytiva Superdex 200 Increase 10/300 GL (10 - 600 kDa)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 8.0,
        vt: 24.0,
        minMw: 10,
        maxMw: 600,
        rhMin: 1.5,
        rhMax: 10.0,
        points: [
            { active: true, name: 'Thyroglobulin', mw: 669, volume: 8.65 },
            { active: true, name: 'Ferritin', mw: 440, volume: 10.40 },
            { active: true, name: 'Aldolase', mw: 158, volume: 12.25 },
            { active: true, name: 'Conalbumin', mw: 75, volume: 13.80 },
            { active: true, name: 'Ovalbumin', mw: 44, volume: 14.75 },
            { active: true, name: 'Carbonic Anhydrase', mw: 29, volume: 16.30 },
            { active: true, name: 'Ribonuclease A', mw: 13.7, volume: 17.70 },
            { active: true, name: 'Aprotinin', mw: 6.5, volume: 19.10 }
        ]
    },
    superose6: {
        name: 'Cytiva Superose 6 Increase 10/300 GL (5 - 5000 kDa)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 7.2,
        vt: 24.0,
        minMw: 5,
        maxMw: 5000,
        rhMin: 1.0,
        rhMax: 20.0,
        points: [
            { active: true, name: 'Thyroglobulin', mw: 669, volume: 12.20 },
            { active: true, name: 'Ferritin', mw: 440, volume: 14.10 },
            { active: true, name: 'Aldolase', mw: 158, volume: 15.50 },
            { active: true, name: 'Ovalbumin', mw: 44, volume: 17.10 },
            { active: true, name: 'Ribonuclease A', mw: 13.7, volume: 19.30 }
        ]
    },
    superdex75: {
        name: 'Cytiva Superdex 75 Increase 10/300 GL (3 - 70 kDa)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 8.5,
        vt: 24.0,
        minMw: 3,
        maxMw: 70,
        rhMin: 0.8,
        rhMax: 4.5,
        points: [
            { active: true, name: 'Conalbumin', mw: 75, volume: 8.70 },
            { active: true, name: 'Ovalbumin', mw: 44, volume: 9.90 },
            { active: true, name: 'Carbonic Anhydrase', mw: 29, volume: 11.50 },
            { active: true, name: 'Ribonuclease A', mw: 13.7, volume: 13.40 },
            { active: true, name: 'Aprotinin', mw: 6.5, volume: 16.20 }
        ]
    },
    tsk4000: {
        name: 'Tosoh TSKgel G4000SWxl (20 - 7000 kDa)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 5.5,
        vt: 14.3,
        minMw: 20,
        maxMw: 7000,
        rhMin: 2.0,
        rhMax: 25.0,
        points: [
            { active: true, name: 'Thyroglobulin', mw: 669, volume: 6.80 },
            { active: true, name: 'IgG', mw: 150, volume: 8.25 },
            { active: true, name: 'BSA', mw: 66, volume: 9.10 },
            { active: true, name: 'Ovalbumin', mw: 44, volume: 9.80 },
            { active: true, name: 'Ribonuclease A', mw: 13.7, volume: 11.20 }
        ]
    },
    tsk6000: {
        name: 'Tosoh TSKgel G6000PWxl (40 - 8000+ kDa)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 5.5,
        vt: 14.3,
        minMw: 40,
        maxMw: 10000,
        rhMin: 3.0,
        rhMax: 40.0,
        points: [
            { active: true, name: 'Dextran 5MDa', mw: 5000, volume: 5.60 },
            { active: true, name: 'Dextran 2MDa', mw: 2000, volume: 6.20 },
            { active: true, name: 'Thyroglobulin', mw: 669, volume: 7.60 },
            { active: true, name: 'IgG', mw: 150, volume: 8.90 },
            { active: true, name: 'BSA', mw: 66, volume: 9.60 }
        ]
    },
    custom: {
        name: 'Custom Standards (User Input)',
        flowRate: 0.5,
        unit: 'ml',
        v0: 8.0,
        vt: 24.0,
        minMw: 10,
        maxMw: 1000,
        rhMin: 1.0,
        rhMax: 15.0,
        points: [
            { active: true, name: 'Protein 1 (60 kDa)', mw: 60, volume: 10.0 },
            { active: true, name: 'Protein 2 (10 kDa)', mw: 10, volume: 15.0 }
        ]
    }
};

let columnCalibrationState = {
    enabled: false,
    preset: 'superdex200',
    unit: 'ml',
    flowRate: 0.5,
    points: JSON.parse(JSON.stringify(COLUMN_CALIBRATION_PRESETS.superdex200.points)),
    m: null,
    b: null,
    r2: null
};

function fitColumnCalibration() {
    const pts = columnCalibrationState.points.filter(p => p.active && p.mw > 0 && p.volume > 0);
    if (pts.length < 2) {
        columnCalibrationState.m = null;
        columnCalibrationState.b = null;
        columnCalibrationState.r2 = null;
        return;
    }

    const isMin = columnCalibrationState.unit === 'min';
    const fr = columnCalibrationState.flowRate || 0.5;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    const n = pts.length;

    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const x = isMin ? (p.volume * fr) : p.volume;
        const y = Math.log10(p.mw);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }

    const denom = (n * sumX2 - sumX * sumX);
    if (Math.abs(denom) < 1e-12) {
        columnCalibrationState.m = null;
        columnCalibrationState.b = null;
        columnCalibrationState.r2 = null;
        return;
    }

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const numR = (n * sumXY - sumX * sumY);
    const denR = Math.sqrt(Math.max(0, (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)));
    const r = denR > 0 ? (numR / denR) : 0;
    const r2 = r * r;

    columnCalibrationState.m = slope;
    columnCalibrationState.b = intercept;
    columnCalibrationState.r2 = r2;
}

function fitStandardPoints(points, flowRate = 0.5, unit = 'ml') {
    const pts = (points || []).filter(p => p.active && p.mw > 0 && p.volume > 0);
    if (pts.length < 2) return { m: null, b: null, r2: null };
    const isMin = unit === 'min';
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const p = pts[i];
        const x = isMin ? (p.volume * flowRate) : p.volume;
        const y = Math.log10(p.mw);
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }
    const denom = (n * sumX2 - sumX * sumX);
    if (Math.abs(denom) < 1e-12) return { m: null, b: null, r2: null };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const numR = (n * sumXY - sumX * sumY);
    const denR = Math.sqrt(Math.max(0, (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)));
    const r2 = denR > 0 ? Math.pow(numR / denR, 2) : 0;
    return { m: slope, b: intercept, r2: r2 };
}

function rhToMolecularWeightGlobular(rhNm) {
    if (!rhNm || rhNm <= 0 || isNaN(rhNm)) return null;
    // Wilkins/Uversky scaling law for folded globular proteins: Rh ≈ 0.066 * M^0.37 (nm)
    // M (Da) = (Rh / 0.066)^(1 / 0.37) = (Rh / 0.066)^2.7027
    const mwDa = Math.pow(rhNm / 0.066, 2.7027);
    return mwDa / 1000.0; // return in kDa
}

function rhToMolecularWeightDisordered(rhNm) {
    if (!rhNm || rhNm <= 0 || isNaN(rhNm)) return null;
    // Scaling law for intrinsically disordered / denatured proteins: Rh ≈ 0.228 * M^0.498 (nm)
    // M (Da) = (Rh / 0.228)^(1 / 0.498) = (Rh / 0.228)^2.008
    const mwDa = Math.pow(rhNm / 0.228, 2.008);
    return mwDa / 1000.0; // return in kDa
}

function calculateKav(elutionMl, presetKey = 'superdex200') {
    const col = COLUMN_CALIBRATION_PRESETS[presetKey] || COLUMN_CALIBRATION_PRESETS.superdex200;
    const v0 = col.v0 || 8.0;
    const vt = col.vt || 24.0;
    if (vt <= v0) return 0;
    return (elutionMl - v0) / (vt - v0);
}

function elutionToHydrodynamicRadius(elutionMl, presetKey = 'superdex200') {
    if (!elutionMl || isNaN(elutionMl) || elutionMl <= 0) return null;
    const col = COLUMN_CALIBRATION_PRESETS[presetKey] || COLUMN_CALIBRATION_PRESETS.superdex200;
    
    // First calculate apparent MW
    let mwKda = null;
    if (columnCalibrationState.enabled && columnCalibrationState.m !== null && columnCalibrationState.preset === presetKey) {
        mwKda = predictApparentSecMw(elutionMl);
    } else {
        const fit = fitStandardPoints(col.points, col.flowRate || 0.5, col.unit || 'ml');
        if (fit && fit.m !== null) {
            const logMw = fit.m * elutionMl + fit.b;
            if (!isNaN(logMw) && logMw >= -1 && logMw <= 7) mwKda = Math.pow(10, logMw);
        }
    }

    if (mwKda && mwKda > 0) {
        const rhNm = 0.066 * Math.pow(mwKda * 1000.0, 0.37);
        return {
            rhNm: Math.round(rhNm * 100) / 100,
            diamNm: Math.round(rhNm * 200) / 100,
            mwKda: Math.round(mwKda * 10) / 10
        };
    }

    const kav = calculateKav(elutionMl, presetKey);
    const clampedKav = Math.max(0.001, Math.min(0.999, kav));
    const scaleA = col.rhMax ? (col.rhMax * 0.45) : 3.5;
    const rhNm = scaleA * Math.sqrt(-Math.log(clampedKav));
    return {
        rhNm: Math.round(rhNm * 100) / 100,
        diamNm: Math.round(rhNm * 200) / 100,
        mwKda: null
    };
}

function predictApparentSecMw(elutionMl) {
    if (!elutionMl || isNaN(elutionMl) || elutionMl <= 0) return null;
    if (columnCalibrationState.enabled && columnCalibrationState.m !== null && columnCalibrationState.b !== null) {
        const logMw = columnCalibrationState.m * elutionMl + columnCalibrationState.b;
        if (isNaN(logMw) || logMw < -1 || logMw > 7) return null;
        const mwKda = Math.pow(10, logMw);
        return (!isNaN(mwKda) && isFinite(mwKda) && mwKda > 0) ? mwKda : null;
    }
    // Default fallback: automatically fit from active preset so user always gets helpful MW predictions
    const activePreset = COLUMN_CALIBRATION_PRESETS[columnCalibrationState.preset] || COLUMN_CALIBRATION_PRESETS.superdex200;
    const defaultFit = fitStandardPoints(activePreset.points, activePreset.flowRate, activePreset.unit);
    if (defaultFit && defaultFit.m !== null) {
        const logMw = defaultFit.m * elutionMl + defaultFit.b;
        if (!isNaN(logMw) && logMw >= -1 && logMw <= 7) {
            const mwKda = Math.pow(10, logMw);
            return (!isNaN(mwKda) && isFinite(mwKda) && mwKda > 0) ? mwKda : null;
        }
    }
    return null;
}

function syncColumnCalibrationUI() {
    fitColumnCalibration();
    const statusBadge = document.getElementById('sec-cal-status-badge');
    const controls = document.getElementById('column-calibration-controls');
    const formulaSpan = document.getElementById('sec-cal-formula');
    const modalSummary = document.getElementById('modal-regression-summary');
    const toggle = document.getElementById('toggle-column-calibration');

    if (toggle) toggle.checked = columnCalibrationState.enabled;
    if (controls) controls.style.display = columnCalibrationState.enabled ? 'flex' : 'none';

    let summaryText = 'Calibration requires ≥ 2 points';
    if (columnCalibrationState.m !== null && columnCalibrationState.b !== null) {
        const sign = columnCalibrationState.b >= 0 ? '+' : '-';
        summaryText = `log(Mw) = ${columnCalibrationState.m.toFixed(3)}·Ve ${sign} ${Math.abs(columnCalibrationState.b).toFixed(2)} (R² = ${(columnCalibrationState.r2 || 0).toFixed(3)})`;
    }

    if (formulaSpan) formulaSpan.textContent = summaryText;
    if (modalSummary) modalSummary.textContent = summaryText;

    if (statusBadge) {
        if (columnCalibrationState.enabled) {
            statusBadge.textContent = columnCalibrationState.r2 ? `Active (R² = ${columnCalibrationState.r2.toFixed(3)})` : 'Active';
            statusBadge.style.borderLeftColor = 'var(--success)';
            statusBadge.style.color = 'var(--success)';
        } else {
            statusBadge.textContent = 'Inactive';
            statusBadge.style.borderLeftColor = '#94a3b8';
            statusBadge.style.color = 'var(--text-muted)';
        }
    }

    updatePeaksTable();
}

function renderColumnCalModalTable() {
    const tbody = document.getElementById('modal-standards-tbody');
    const thVol = document.getElementById('th-modal-std-vol');
    if (thVol) {
        thVol.textContent = columnCalibrationState.unit === 'min' ? 'Retention Time (min)' : 'Elution Volume (mL)';
    }
    if (!tbody) return;
    tbody.innerHTML = '';

    columnCalibrationState.points.forEach((pt, idx) => {
        const tr = document.createElement('tr');

        const tdActive = document.createElement('td');
        tdActive.style.textAlign = 'center';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !!pt.active;
        chk.addEventListener('change', () => {
            pt.active = chk.checked;
            syncColumnCalibrationUI();
        });
        tdActive.appendChild(chk);

        const tdName = document.createElement('td');
        const inpName = document.createElement('input');
        inpName.type = 'text';
        inpName.className = 'input-control';
        inpName.style.fontSize = '0.75rem';
        inpName.style.padding = '0.25rem 0.4rem';
        inpName.value = pt.name;
        inpName.addEventListener('input', () => { pt.name = inpName.value; });
        tdName.appendChild(inpName);

        const tdMw = document.createElement('td');
        const inpMw = document.createElement('input');
        inpMw.type = 'number';
        inpMw.className = 'input-control';
        inpMw.style.fontSize = '0.75rem';
        inpMw.style.padding = '0.25rem 0.4rem';
        inpMw.value = pt.mw;
        inpMw.step = '0.1';
        inpMw.min = '0.1';
        inpMw.addEventListener('input', () => {
            pt.mw = parseFloat(inpMw.value) || 0;
            syncColumnCalibrationUI();
        });
        tdMw.appendChild(inpMw);

        const tdVol = document.createElement('td');
        const inpVol = document.createElement('input');
        inpVol.type = 'number';
        inpVol.className = 'input-control';
        inpVol.style.fontSize = '0.75rem';
        inpVol.style.padding = '0.25rem 0.4rem';
        inpVol.value = pt.volume;
        inpVol.step = '0.05';
        inpVol.min = '0.01';
        inpVol.addEventListener('input', () => {
            pt.volume = parseFloat(inpVol.value) || 0;
            syncColumnCalibrationUI();
        });
        tdVol.appendChild(inpVol);

        const tdAct = document.createElement('td');
        tdAct.style.textAlign = 'center';
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-table-action btn-delete';
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.addEventListener('click', () => {
            columnCalibrationState.points.splice(idx, 1);
            renderColumnCalModalTable();
            syncColumnCalibrationUI();
        });
        tdAct.appendChild(delBtn);

        tr.appendChild(tdActive);
        tr.appendChild(tdName);
        tr.appendChild(tdMw);
        tr.appendChild(tdVol);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: tbody });
}

window.COLUMN_CALIBRATION_PRESETS = COLUMN_CALIBRATION_PRESETS;
window.columnCalibrationState = columnCalibrationState;
window.fitColumnCalibration = fitColumnCalibration;
window.predictApparentSecMw = predictApparentSecMw;
window.syncColumnCalibrationUI = syncColumnCalibrationUI;
window.renderColumnCalModalTable = renderColumnCalModalTable;

let mwGatingSettings = {
    mode: 'peaks_only', // 'peaks_only' (recommended) | 'all' (raw diagnostic)
    snrThreshold: 2.0,
    concApexFraction: 0.01 // 1% of peak apex
};

// Interactive Plot Editor State
let plotSettings = {
    title: '',
    subtitle: '',
    xAxisTitle: 'Elution Volume (mL)',
    yPrimaryTitle: '',
    ySecondaryTitle: 'Secondary Curves (%B / Cond)',
    yMolarMassTitle: 'Molar Mass (kDa)',
    fontFamily: 'Plus Jakarta Sans',
    titleFontSize: 16,
    subtitleFontSize: 12,
    axisTitleFontSize: 12,
    ticksFontSize: 11,
    legendFontSize: 12,
    fontWeight: '600',
    legendPosition: 'top', // 'top' | 'bottom' | 'left' | 'right' | 'hidden'
    legendAlign: 'center', // 'center' | 'start' | 'end'
    legendPointStyle: 'circle', // 'circle' | 'line' | 'rectRounded' | 'rect' | 'triangle'
    aspectRatioPreset: 'responsive', // 'responsive' | '16:9' | '4:3' | '1:1' | 'custom'
    customWidth: 900,
    customHeight: 500,
    exportDpi: 300,
    exportFormat: 'png',
    exportBg: 'publication',
    aliases: Object.create(null), // rawName -> custom publication alias
    yPrimaryAutoscale: true,
    yPrimaryMin: null,
    yPrimaryMax: null,
    ySecondaryMin: null,
    ySecondaryMax: null
};

let chartInstance = null;
let peaks = [];
let nextPeakId = 1;
let currentSelection = { start: null, end: null };
let sqliteModule = null;

// Security Sanitization & Safe Key Utilities
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeFilename(str, fallback = 'SEC_MALS_Plot') {
    if (typeof str !== 'string' || !str.trim()) return fallback;
    let sanitized = str.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/\.+/g, '.').replace(/_+/g, '_');
    sanitized = sanitized.replace(/^[\.\-_]+|[\.\-_]+$/g, '');
    return sanitized || fallback;
}

function sanitizeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/\0/g, '');
    // Neutralize spreadsheet formula injection (=, +, -, @, \t, \r, |, %) even if preceded by whitespace or quotes
    if (/^[\s']*[\=\+\-\@\t\r\|\%]/.test(str)) {
        str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
}

function isSafeKey(key) {
    return typeof key === 'string' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function getSafeYAxisBounds(userMin, userMax, suggestedMax) {
    let min = (userMin !== null && userMin !== undefined && !isNaN(userMin) && isFinite(userMin)) ? Number(userMin) : undefined;
    let max = (userMax !== null && userMax !== undefined && !isNaN(userMax) && isFinite(userMax)) ? Number(userMax) : (suggestedMax !== undefined && !isNaN(suggestedMax) && isFinite(suggestedMax) ? Number(suggestedMax) : undefined);

    if (min !== undefined && max !== undefined && min >= max) {
        max = min + 1.0;
    }
    return { min, max };
}

function colorToHex(col) {
    if (!col || typeof col !== 'string') return '#6366f1';
    col = col.trim();
    if (col.startsWith('#')) {
        if (col.length === 7) return col;
        if (col.length === 4) return `#${col[1]}${col[1]}${col[2]}${col[2]}${col[3]}${col[3]}`;
        return '#6366f1';
    }
    const match = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
        const r = Math.max(0, Math.min(255, parseInt(match[1]))).toString(16).padStart(2, '0');
        const g = Math.max(0, Math.min(255, parseInt(match[2]))).toString(16).padStart(2, '0');
        const b = Math.max(0, Math.min(255, parseInt(match[3]))).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    return '#6366f1';
}

// Physical Constants
const AVOGADRO = 6.02214076e23; // mol^-1

// Curated palette for multi-channel SEC-MALS and ÄKTA runs
const COLOR_PALETTE = [
    '#38bdf8', // sky-400 (UV 280 / MALS 90°)
    '#34d399', // emerald-400 (Cond / dRI)
    '#fb7185', // rose-400 (Buffer %B / Conc B)
    '#fbbf24', // amber-400 (Concentration c(t))
    '#e879f9', // fuchsia-400 (Molar Mass Mw)
    '#a78bfa', // violet-400 (Secondary UV / Laser)
    '#22d3ee', // cyan-400 (LS Angle Det 3)
    '#f472b6', // pink-400 (LS Angle Det 7)
    '#818cf8', // indigo-400
    '#a3e635'  // lime-400
];

// Theme Colors
let colors = {
    peak: 'rgba(99, 102, 241, 0.18)',
    grid: 'rgba(255, 255, 255, 0.06)',
    text: '#94a3b8'
};

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('csv-file-input');
const overlayWyattInput = document.getElementById('overlay-wyatt-input');
const selectAktaInjection = document.getElementById('select-akta-injection');
const alignInjVol = document.getElementById('align-inj-vol');
const alignTubingDelay = document.getElementById('align-tubing-delay');
const nudgeLeftBtn = document.getElementById('nudge-left-btn');
const nudgeRightBtn = document.getElementById('nudge-right-btn');
const autoAlignPeakBtn = document.getElementById('auto-align-peak-btn');
const clickInstructions = document.getElementById('click-instructions');

const welcomeView = document.getElementById('welcome-view');
const analysisWorkspace = document.getElementById('analysis-workspace');
const peaksContainer = document.getElementById('peaks-container');
const loadedFileName = document.getElementById('loaded-file-name');
const loadedFileInfo = document.getElementById('loaded-file-info');

const curvesControlsContainer = document.getElementById('curves-controls-container');
const toggleFractions = document.getElementById('toggle-fractions');
const toggleDecimation = document.getElementById('toggle-decimation');
const toggleMolarMass = document.getElementById('toggle-molar-mass');
const colorPeakInput = document.getElementById('color-peak');
const valPeak = document.getElementById('val-peak');

const toggleMonoLs = document.getElementById('toggle-mono-ls');
const colorMonoLs = document.getElementById('color-mono-ls');
const valMonoLs = document.getElementById('val-mono-ls');
const monoLsColorContainer = document.getElementById('mono-ls-color-container');

const toggleLsScaling = document.getElementById('toggle-ls-scaling');
const lsScaleSliderContainer = document.getElementById('ls-scale-slider-container');
const lsHeightSlider = document.getElementById('ls-height-slider');
const lsHeightVal = document.getElementById('ls-height-val');
const toggleCompactLegend = document.getElementById('toggle-compact-legend');

const malsPreset = document.getElementById('mals-preset');
const malsDndc = document.getElementById('mals-dndc');
const malsFitModel = document.getElementById('mals-fit-model');
const malsWavelength = document.getElementById('mals-wavelength');
const malsN0 = document.getElementById('mals-n0');
const subunitAMw = document.getElementById('subunit-a-mw');
const subunitBMw = document.getElementById('subunit-b-mw');
const subunitTagMw = document.getElementById('subunit-tag-mw');

const targetCurveSelect = document.getElementById('target-curve');
const baselineMode = document.getElementById('baseline-mode');
const peakStartInput = document.getElementById('peak-start');
const peakEndInput = document.getElementById('peak-end');
const addPeakBtn = document.getElementById('add-peak-btn');
const clearPeaksBtn = document.getElementById('clear-peaks-btn');
const peaksTableBody = document.getElementById('peaks-table-body');
const exportPeaksCsvBtn = document.getElementById('export-peaks-csv');

const themeToggle = document.getElementById('theme-toggle');
const resetZoomBtn = document.getElementById('reset-zoom');
const chartResetZoomBtn = document.getElementById('chart-reset-zoom-btn');
const exportChartBtn = document.getElementById('export-chart-btn');
const chartExportBtn = document.getElementById('chart-export-btn');

function setResetZoomButtonsDisabled(disabled) {
    if (resetZoomBtn) resetZoomBtn.disabled = disabled;
    if (chartResetZoomBtn) chartResetZoomBtn.disabled = disabled;
    const v3ResetBtn = document.getElementById('v3-reset-zoom-btn');
    if (v3ResetBtn) v3ResetBtn.disabled = disabled;
}

// Guides Dropdown Elements
const guidesDropdown = document.getElementById('guides-dropdown');
const guidesDropdownBtn = document.getElementById('guides-dropdown-btn');
const guidesDropdownMenu = document.getElementById('guides-dropdown-menu');
const headerGuideModalBtn = document.getElementById('header-guide-modal-btn');
const headerBiophysicalGuideBtn = document.getElementById('header-biophysical-guide-btn');
const headerSecVsMalsGuideBtn = document.getElementById('header-sec-vs-mals-guide-btn');
const headerDetectorsGuideBtn = document.getElementById('header-detectors-guide-btn');

// Guide Modals Elements
const guideModalBtn = document.getElementById('guide-modal-btn');
const guideModal = document.getElementById('guide-modal');
const closeGuideModal = document.getElementById('close-guide-modal');
const closeGuideBtn = document.getElementById('close-guide-btn');

const biophysicalGuideBtn = document.getElementById('biophysical-guide-btn');
const biophysicalGuideModal = document.getElementById('biophysical-guide-modal');
const closeBiophysicalModal = document.getElementById('close-biophysical-modal');
const closeBiophysicalBtn = document.getElementById('close-biophysical-btn');

const detectorsGuideBtn = document.getElementById('detectors-guide-btn');
const detectorsModal = document.getElementById('detectors-modal');
const closeDetectorsModal = document.getElementById('close-detectors-modal');
const closeDetectorsBtn = document.getElementById('close-detectors-btn');

// Auto-Fit MW Buttons
const autoFitMwBtn = document.getElementById('auto-fit-mw-btn');
const sidebarAutoFitBtn = document.getElementById('sidebar-auto-fit-btn');
const chartAutoFitBtn = document.getElementById('chart-auto-fit-btn');
const tableAutoFitBtn = document.getElementById('table-auto-fit-btn');

// Plot Editor Elements
const openPlotEditorBtn = document.getElementById('open-plot-editor-btn');
const chartPlotEditorBtn = document.getElementById('chart-plot-editor-btn');
const plotEditorModal = document.getElementById('plot-editor-modal');
const closePlotEditorModal = document.getElementById('close-plot-editor-modal');
const closePlotEditorBtn = document.getElementById('close-plot-editor-btn');
const resetPlotSettingsBtn = document.getElementById('reset-plot-settings-btn');
const plotEditorDownloadBtn = document.getElementById('plot-editor-download-btn');
const editorAliasesTableBody = document.getElementById('editor-aliases-table-body');

const plotTitleInput = document.getElementById('plot-title-input');
const plotSubtitleInput = document.getElementById('plot-subtitle-input');
const plotXAxisTitle = document.getElementById('plot-xaxis-title');
const plotYPrimaryTitle = document.getElementById('plot-yprimary-title');
const plotYSecondaryTitle = document.getElementById('plot-ysecondary-title');
const plotYMolarMassTitle = document.getElementById('plot-ymolarmass-title');
const plotFontFamily = document.getElementById('plot-font-family');
const plotFontWeight = document.getElementById('plot-font-weight');
const plotTitleSize = document.getElementById('plot-title-size');
const plotAxisSize = document.getElementById('plot-axis-size');
const plotTicksSize = document.getElementById('plot-ticks-size');
const plotLegendSize = document.getElementById('plot-legend-size');
const plotLegendPos = document.getElementById('plot-legend-pos');
const plotLegendAlign = document.getElementById('plot-legend-align');
const plotPointStyle = document.getElementById('plot-point-style');
const plotAspectPreset = document.getElementById('plot-aspect-preset');
const plotCustomW = document.getElementById('plot-custom-w');
const plotCustomH = document.getElementById('plot-custom-h');
const customDimsRow = document.getElementById('custom-dims-row');
const plotExportDpi = document.getElementById('plot-export-dpi');
const plotExportFormat = document.getElementById('plot-export-format');
const plotExportBg = document.getElementById('plot-export-bg');

// --- Theme Management ---
function updateThemeUI() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const isLight = currentTheme === 'light';
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        // In light theme, show moon icon to switch to dark. In dark theme, show sun icon to switch to light.
        toggleBtn.innerHTML = isLight ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
        toggleBtn.setAttribute('title', isLight ? 'Switch to Dark Theme' : 'Switch to Light Theme');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: toggleBtn });
        }
    }
    
    if (isLight) {
        colors.grid = 'rgba(0, 0, 0, 0.08)';
        colors.text = '#475569';
    } else {
        colors.grid = 'rgba(255, 255, 255, 0.06)';
        colors.text = '#94a3b8';
    }
    
    if (chartInstance) {
        updateChartTheme();
    }
    if (baselineChartInstance) {
        renderBaselinePreviewChart();
    }
    if (figureEditorChartInstance) {
        renderFigureEditorChart();
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', newTheme);
    try {
        localStorage.setItem('sec_mals_theme', newTheme);
    } catch (e) {}
    updateThemeUI();
    showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} theme.`, "info");
}

function syncPeakColor() {
    if (!colorPeakInput) return;
    const hex = colorPeakInput.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    colors.peak = `rgba(${r}, ${g}, ${b}, 0.20)`;
    if (valPeak) valPeak.textContent = hex.toUpperCase();
    if (chartInstance) {
        updateChartColors();
    }
}

// --- Toast System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconWrapper = document.createElement('span');
    iconWrapper.style.display = 'inline-flex';
    iconWrapper.style.alignItems = 'center';
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    
    const iconElem = document.createElement('i');
    iconElem.setAttribute('data-lucide', iconName);
    iconWrapper.appendChild(iconElem);
    
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    
    toast.appendChild(iconWrapper);
    toast.appendChild(msgSpan);
    container.appendChild(toast);
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: toast });
    }
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================================================
// Robust Text Decoder & Number/Delimiter Utilities
// ==========================================================================

function parseSafeFloat(val) {
    if (val === null || val === undefined) return NaN;
    if (typeof val === 'number') return (isNaN(val) || !isFinite(val)) ? NaN : val;
    let s = (typeof val === 'string') ? val.trim() : String(val).trim();
    const len = s.length;
    if (len === 0) return NaN;
    
    // Fast unquote for spreadsheet cells without regex allocation
    if (s.charCodeAt(0) === 34 && s.charCodeAt(len - 1) === 34 && len >= 2) {
        s = s.slice(1, -1).trim();
        if (s.length === 0) return NaN;
    }
    
    // Fast path: direct unary float/int parsing (handles clean numbers & standard scientific notation)
    const directNum = +s;
    if (!isNaN(directNum) && isFinite(directNum)) return directNum;

    // Fallback: European comma decimals or formatted numbers
    const commaIdx = s.indexOf(',');
    if (commaIdx !== -1) {
        const dotIdx = s.indexOf('.');
        if (dotIdx === -1) {
            s = s.replace(',', '.');
        } else {
            if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
        }
        const num = parseFloat(s);
        return (isNaN(num) || !isFinite(num)) ? NaN : num;
    }
    const num = parseFloat(s);
    return (isNaN(num) || !isFinite(num)) ? NaN : num;
}

function detectCsvDelimiter(lines) {
    if (!lines) return ',';
    let sampleArr = lines;
    if (typeof lines === 'string') {
        sampleArr = lines.split(/\r?\n/);
    }
    if (!Array.isArray(sampleArr) || sampleArr.length === 0) return ',';
    
    let commaCount = 0;
    let tabCount = 0;
    let semicolonCount = 0;
    const sampleLimit = Math.min(sampleArr.length, 30);
    
    for (let i = 0; i < sampleLimit; i++) {
        const l = sampleArr[i];
        if (typeof l !== 'string') continue;
        const len = l.length;
        for (let j = 0; j < len; j++) {
            const c = l.charCodeAt(j);
            if (c === 44) commaCount++;        // ','
            else if (c === 9) tabCount++;     // '\t'
            else if (c === 59) semicolonCount++; // ';'
        }
    }
    
    if (tabCount > semicolonCount && tabCount > commaCount) return '\t';
    if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
    return ',';
}

function decodeTextBuffer(arrayBuf) {
    if (!arrayBuf || (!(arrayBuf instanceof ArrayBuffer) && !ArrayBuffer.isView(arrayBuf))) return '';
    const uint8 = (arrayBuf instanceof Uint8Array)
        ? arrayBuf
        : (arrayBuf instanceof ArrayBuffer
            ? new Uint8Array(arrayBuf)
            : new Uint8Array(arrayBuf.buffer, arrayBuf.byteOffset, arrayBuf.byteLength));
    if (uint8.byteLength > 100 * 1024 * 1024) {
        throw new Error("File exceeds maximum allowed text size (100MB).");
    }
    if (uint8.byteLength === 0) return '';

    // 1. BOM Detection
    if (uint8.length >= 2 && uint8[0] === 0xFF && uint8[1] === 0xFE) {
        const sub = uint8.subarray(2, uint8.length - ((uint8.length - 2) % 2));
        return new TextDecoder('utf-16le').decode(sub);
    }
    if (uint8.length >= 2 && uint8[0] === 0xFE && uint8[1] === 0xFF) {
        const sub = uint8.subarray(2, uint8.length - ((uint8.length - 2) % 2));
        return new TextDecoder('utf-16be').decode(sub);
    }
    if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(uint8.subarray(3));
    }

    // 2. BOM-less UTF-16 Detection via Null Byte Pattern Inspection
    if (uint8.length >= 8) {
        const sampleLen = Math.min(uint8.length, 128);
        let evenZeros = 0;
        let oddZeros = 0;
        const pairs = Math.floor(sampleLen / 2);
        for (let i = 0; i < pairs; i++) {
            if (uint8[i * 2] === 0) evenZeros++;
            if (uint8[i * 2 + 1] === 0) oddZeros++;
        }
        // If >60% of odd bytes are null and even bytes are non-null => UTF-16LE
        if (oddZeros >= pairs * 0.6 && evenZeros < pairs * 0.2) {
            const sub = uint8.subarray(0, uint8.length - (uint8.length % 2));
            return new TextDecoder('utf-16le').decode(sub);
        }
        // If >60% of even bytes are null and odd bytes are non-null => UTF-16BE
        if (evenZeros >= pairs * 0.6 && oddZeros < pairs * 0.2) {
            const sub = uint8.subarray(0, uint8.length - (uint8.length % 2));
            return new TextDecoder('utf-16be').decode(sub);
        }
    }

    // 3. Try UTF-8 Strict
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(uint8);
    } catch (utf8Err) {
        // 4. Fallback to windows-1252 / iso-8859-1 for European single-byte encodings (° = 0xB0, µ = 0xB5)
        try {
            return new TextDecoder('windows-1252').decode(uint8);
        } catch (wErr) {
            try {
                return new TextDecoder('iso-8859-1').decode(uint8);
            } catch (isoErr) {
                return new TextDecoder('utf-8').decode(uint8);
            }
        }
    }
}

// ==========================================================================
// SEC-MALS Physical Calculation & Stoichiometry Engine
// ==========================================================================

// Optical constants cache
let _cachedKStarKey = '';
let _cachedKStarVal = 0;

function calculateKStar(dndc, wavelengthNm, n0) {
    if (!dndc || !wavelengthNm || !n0 || dndc <= 0 || wavelengthNm <= 0 || n0 <= 0 || isNaN(dndc) || isNaN(wavelengthNm) || isNaN(n0)) return 0;
    const key = `${dndc}_${wavelengthNm}_${n0}`;
    if (key === _cachedKStarKey) return _cachedKStarVal;

    const lambdaCm = wavelengthNm * 1e-7; // cm
    const numerator = 4 * Math.PI * Math.PI * n0 * n0 * dndc * dndc;
    const denominator = AVOGADRO * Math.pow(lambdaCm, 4);
    if (denominator <= 0 || isNaN(denominator)) return 0;
    
    _cachedKStarVal = numerator / denominator;
    _cachedKStarKey = key;
    return _cachedKStarVal;
}

// Geometric trigonometric factors cache for detector angles
const _detectorAnglesCache = new Map();
function getPrecomputedSin2Thetas(anglesDeg) {
    if (!anglesDeg || anglesDeg.length === 0) return null;
    const key = anglesDeg.join(',');
    let cached = _detectorAnglesCache.get(key);
    if (!cached) {
        cached = new Float64Array(anglesDeg.length);
        for (let i = 0; i < anglesDeg.length; i++) {
            const thetaRad = (anglesDeg[i] || 90.0) * (Math.PI / 180.0);
            cached[i] = Math.pow(Math.sin(thetaRad * 0.5), 2);
        }
        _detectorAnglesCache.set(key, cached);
    }
    return cached;
}

function extrapolateMolarMass(rayleighAngles, anglesDeg, concGml, kStar, fitModel = 'zimm', precomputedSin2 = null) {
    if (!rayleighAngles || rayleighAngles.length === 0 || !concGml || concGml <= 1e-7 || !kStar || kStar <= 0 || isNaN(concGml) || isNaN(kStar)) {
        return null;
    }

    const len = rayleighAngles.length;
    if (fitModel === 'single' || len === 1) {
        const r90 = rayleighAngles[4] !== undefined ? rayleighAngles[4] : rayleighAngles[0];
        if (!r90 || r90 <= 0 || isNaN(r90)) return null;
        const mw = r90 / (kStar * concGml);
        return (!isNaN(mw) && isFinite(mw) && mw > 0) ? mw : null;
    }

    const sin2Arr = precomputedSin2 || getPrecomputedSin2Thetas(anglesDeg);
    const kStarConc = kStar * concGml;

    // Single-pass linear regression accumulators without array allocations
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, n = 0;

    for (let i = 0; i < len; i++) {
        const r = rayleighAngles[i];
        if (!r || r <= 0 || isNaN(r)) continue;

        const sin2 = sin2Arr ? sin2Arr[i] : Math.pow(Math.sin(((anglesDeg[i] || 90.0) * Math.PI / 180.0) * 0.5), 2);

        let y = 0;
        if (fitModel === 'debye') {
            y = r / kStarConc;
        } else if (fitModel === 'berry') {
            y = Math.sqrt(kStarConc / r);
        } else {
            // Zimm: y = K* c / R
            y = kStarConc / r;
        }

        if (!isNaN(y) && isFinite(y) && y > 0) {
            sumX += sin2;
            sumY += y;
            sumXY += sin2 * y;
            sumX2 += sin2 * sin2;
            n++;
        }
    }

    if (n < 2) {
        const r90 = rayleighAngles[4] !== undefined ? rayleighAngles[4] : rayleighAngles[0];
        if (!r90 || r90 <= 0) return null;
        const mw = r90 / kStarConc;
        return (!isNaN(mw) && isFinite(mw) && mw > 0) ? mw : null;
    }

    const denom = (n * sumX2 - sumX * sumX);
    if (Math.abs(denom) < 1e-12 || isNaN(denom)) return null;

    const intercept = (sumY * sumX2 - sumX * sumXY) / denom;
    if (intercept <= 0 || isNaN(intercept) || !isFinite(intercept)) return null;

    let result = null;
    if (fitModel === 'debye') result = intercept;
    else if (fitModel === 'berry') result = 1.0 / (intercept * intercept);
    else result = 1.0 / intercept; // Zimm

    return (!isNaN(result) && isFinite(result) && result > 0) ? result : null;
}

function predictStoichiometry(mwKda, mwA = null, mwB = null, mwTag = null) {
    if (!mwKda || isNaN(mwKda) || mwKda <= 0) return { desc: 'N/A', formula: '—', errorPct: null };
    
    if (mwA === null && subunitAMw) mwA = parseFloat(subunitAMw.value) || 0;
    if (mwB === null && subunitBMw) mwB = parseFloat(subunitBMw.value) || 0;
    if (mwTag === null && subunitTagMw) mwTag = parseFloat(subunitTagMw.value) || 0;

    if ((!mwA || mwA <= 0) && (!mwB || mwB <= 0)) {
        return { desc: 'Input theoretical mass in sidebar', formula: '—', errorPct: null };
    }

    let bestCandidate = null;
    let minError = Infinity;

    const maxA = mwA > 0 ? Math.min(Math.ceil((mwKda * 1.5) / mwA), 40) : 0;
    const maxB = mwB > 0 ? Math.min(Math.ceil((mwKda * 1.5) / mwB), 40) : 0;

    for (let na = 0; na <= Math.max(maxA, 1); na++) {
        for (let nb = 0; nb <= Math.max(maxB, 0); nb++) {
            if (na === 0 && nb === 0) continue;

            const possibleTags = mwTag > 0 ? [0, na, nb, na + nb] : [0];
            for (const nt of possibleTags) {
                const calcMw = (na * mwA) + (nb * mwB) + (nt * mwTag);
                if (calcMw <= 0) continue;

                const absErrorPct = Math.abs(mwKda - calcMw) / calcMw * 100.0;
                const relErrorPct = ((mwKda - calcMw) / calcMw) * 100.0;

                if (absErrorPct < minError) {
                    minError = absErrorPct;

                    let formula = '';
                    if (na > 0) formula += na === 1 ? 'A' : `A${na}`;
                    if (nb > 0) formula += nb === 1 ? 'B' : `B${nb}`;
                    if (nt > 0) formula += nt === 1 ? ` + Tag` : ` + ${nt}xTag`;

                    let desc = '';
                    if (nb === 0 && nt === 0) {
                        if (na === 1) desc = 'Monomer (1x)';
                        else if (na === 2) desc = 'Homodimer (2x)';
                        else if (na === 3) desc = 'Homotrimer (3x)';
                        else if (na === 4) desc = 'Homotetramer (4x)';
                        else if (na === 6) desc = 'Hexamer (6x)';
                        else if (na === 8) desc = 'Octamer (8x)';
                        else desc = `${na}-mer Complex`;
                    } else if (na === 1 && nb === 0 && nt > 0) {
                        desc = `Monomer + ${nt}x Tag`;
                    } else if (na === 2 && nb === 0 && nt > 0) {
                        desc = `Dimer + ${nt}x Tag`;
                    } else if (na === 1 && nb === 1 && nt === 0) {
                        desc = 'Heterodimer (AB)';
                    } else if (na === 2 && nb === 2 && nt === 0) {
                        desc = 'Heterotetramer (A₂B₂)';
                    } else {
                        desc = formula;
                    }

                    bestCandidate = {
                        formula,
                        desc,
                        calcMw,
                        errorPct: relErrorPct,
                        absErrorPct,
                        na, nb, nt
                    };
                }
            }
        }
    }

    return bestCandidate || { desc: 'Unresolved', formula: '—', errorPct: null };
}

function recalculateMalsData() {
    if (!rawData || !rawData.mals || !rawData.mals.rawGridMals) return;

    try {
        const dndc = (malsDndc && parseFloat(malsDndc.value) > 0) ? parseFloat(malsDndc.value) : 0.185;
        const wavelength = (malsWavelength && parseFloat(malsWavelength.value) > 0) ? parseFloat(malsWavelength.value) : 660.5;
        const n0 = (malsN0 && parseFloat(malsN0.value) > 0) ? parseFloat(malsN0.value) : 1.332;
        const fitModel = malsFitModel ? malsFitModel.value : 'single';

        const kStar = calculateKStar(dndc, wavelength, n0);
        if (kStar <= 0) return;

        const m = rawData.mals;
        const timeMals = m.timeMals;
        const gridMals = m.rawGridMals;
        const timeDri = m.timeDri;
        const valDri = m.valDri;
        const flowRate = (m.flowRate && m.flowRate > 0) ? m.flowRate : 0.5;
        const calConstant = m.calConstant || 3.4815e-5;
        const normCoeffs = m.normCoeffs || [1.545, 2.151, 0.858, 0.983, 1.0, 1.0, 0.812, 2.105];
        const detectorAngles = m.detectorAngles || [32, 44, 57, 72, 90, 108, 126, 141];

        if (!timeMals || !gridMals || !timeDri || !valDri || timeMals.length === 0 || timeDri.length === 0) return;

        const numSlices = Math.min(timeMals.length, gridMals.length);
        if (numSlices === 0) return;

        // Retrieve selected Baseline Correction Plan
        const studioPlanSelect = document.getElementById('studio-baseline-plan');
        const plan = studioPlanSelect ? studioPlanSelect.value : 'plan1'; // 'plan1' | 'plan2' | 'plan3'

        // Retrieve post-peak/drift window inputs (for Plan 2 & Plan 3)
        const studioPostStart = document.getElementById('studio-post-start');
        const studioPostEnd = document.getElementById('studio-post-end');
        let postStart = studioPostStart ? (parseFloat(studioPostStart.value) || 18.0) : 18.0;
        let postEnd = studioPostEnd ? (parseFloat(studioPostEnd.value) || 20.0) : 20.0;
        if (postStart > postEnd) {
            const tmp = postStart; postStart = postEnd; postEnd = tmp;
        }

        // Sync baseline start/end between main inputs and Studio inputs
        const malsBaselineStart = document.getElementById('mals-baseline-start');
        const malsBaselineEnd = document.getElementById('mals-baseline-end');
        const studioBaselineStart = document.getElementById('studio-baseline-start');
        const studioBaselineEnd = document.getElementById('studio-baseline-end');
        
        let bStart = 0.5;
        let bEnd = 2.5;
        if (studioBaselineStart && !isNaN(parseFloat(studioBaselineStart.value))) {
            bStart = parseFloat(studioBaselineStart.value);
        } else if (malsBaselineStart && !isNaN(parseFloat(malsBaselineStart.value))) {
            bStart = parseFloat(malsBaselineStart.value);
        }
        if (studioBaselineEnd && !isNaN(parseFloat(studioBaselineEnd.value))) {
            bEnd = parseFloat(studioBaselineEnd.value);
        } else if (malsBaselineEnd && !isNaN(parseFloat(malsBaselineEnd.value))) {
            bEnd = parseFloat(malsBaselineEnd.value);
        }
        if (bStart > bEnd) {
            const tmp = bStart; bStart = bEnd; bEnd = tmp;
        }

        // 1. Pre-Void Baseline Window (bStart - bEnd)
        const preMalsBases = new Float64Array(8);
        const preMalsBaseSqSum = new Float64Array(8);
        let preBaseCount = 0;
        for (let i = 0; i < numSlices; i++) {
            const ml = timeMals[i] * flowRate;
            if (ml >= bStart && ml <= bEnd) {
                for (let a = 0; a < 8; a++) {
                    const v = (gridMals[i] && a < gridMals[i].length && !isNaN(gridMals[i][a])) ? gridMals[i][a] : 0;
                    preMalsBases[a] += v;
                    preMalsBaseSqSum[a] += v * v;
                }
                preBaseCount++;
            }
        }

        const malsNoiseStd = new Float64Array(8);
        if (preBaseCount >= 5) {
            for (let a = 0; a < 8; a++) {
                const mean = preMalsBases[a] / preBaseCount;
                const variance = Math.max(0, (preMalsBaseSqSum[a] / preBaseCount) - (mean * mean));
                preMalsBases[a] = mean;
                malsNoiseStd[a] = Math.sqrt(variance);
            }
        } else {
            const fallbackLen = Math.max(1, Math.min(numSlices, Math.max(Math.floor(numSlices * 0.05), 10)));
            for (let a = 0; a < 8; a++) {
                let s = 0;
                for (let i = 0; i < fallbackLen; i++) {
                    if (gridMals[i]) s += (gridMals[i][a] || 0);
                }
                preMalsBases[a] = s / fallbackLen;
                malsNoiseStd[a] = 0.005;
            }
        }

        let preDriSum = 0, preDriCount = 0;
        for (let i = 0; i < timeDri.length; i++) {
            const ml = timeDri[i] * flowRate;
            if (ml >= bStart && ml <= bEnd) {
                preDriSum += valDri[i];
                preDriCount++;
            }
        }
        const fallbackLen = Math.max(1, Math.min(50, valDri.length));
        let preDriBase = 0;
        if (preDriCount >= 5) {
            preDriBase = preDriSum / preDriCount;
        } else {
            let s = 0;
            for (let i = 0; i < fallbackLen; i++) s += valDri[i];
            preDriBase = s / fallbackLen;
        }

        // 2. Post-Peak Window (postStart - postEnd) for Plan 2 & Plan 3
        const postMalsBases = new Float64Array(8);
        let postBaseCount = 0;
        let postDriBase = preDriBase;

        if (plan === 'plan2' || plan === 'plan3') {
            for (let i = 0; i < numSlices; i++) {
                const ml = timeMals[i] * flowRate;
                if (ml >= postStart && ml <= postEnd) {
                    for (let a = 0; a < 8; a++) {
                        const v = (gridMals[i] && a < gridMals[i].length && !isNaN(gridMals[i][a])) ? gridMals[i][a] : 0;
                        postMalsBases[a] += v;
                    }
                    postBaseCount++;
                }
            }
            if (postBaseCount >= 5) {
                for (let a = 0; a < 8; a++) {
                    postMalsBases[a] /= postBaseCount;
                }
            } else {
                for (let a = 0; a < 8; a++) {
                    postMalsBases[a] = preMalsBases[a];
                }
            }

            let postDriSum = 0, postDriCt = 0;
            for (let i = 0; i < timeDri.length; i++) {
                const ml = timeDri[i] * flowRate;
                if (ml >= postStart && ml <= postEnd) {
                    postDriSum += valDri[i];
                    postDriCt++;
                }
            }
            if (postDriCt >= 5) {
                postDriBase = postDriSum / postDriCt;
            } else {
                postDriBase = preDriBase;
            }
        }

        const midPre = (bStart + bEnd) * 0.5;
        const midPost = (postStart + postEnd) * 0.5;
        const driftSpan = midPost - midPre;

        const isPlan2 = (plan === 'plan2' && !isNaN(driftSpan) && driftSpan > 0.01);
        const isPlan3 = (plan === 'plan3');
        const invDriftSpan = isPlan2 ? (1.0 / driftSpan) : 0;

        // Effective overall static base for table / display and non-drift models
        const malsBases = new Float64Array(8);
        for (let a = 0; a < 8; a++) {
            malsBases[a] = isPlan3 ? (preMalsBases[a] + postMalsBases[a]) * 0.5 : preMalsBases[a];
        }
        const driBase = isPlan3 ? (preDriBase + postDriBase) * 0.5 : preDriBase;

        // Hoisted linear drift slope rates (delta per mL) - avoids recomputing slope ratios in slice loop
        const driSlope = isPlan2 ? (postDriBase - preDriBase) * invDriftSpan : 0;
        const malsSlopes = new Float64Array(8);
        if (isPlan2) {
            for (let a = 0; a < 8; a++) {
                malsSlopes[a] = (postMalsBases[a] - preMalsBases[a]) * invDriftSpan;
            }
        }

        // Precompute calibration * normalization coefficients across all 8 detectors
        const calNormCoeffs = new Float64Array(8);
        for (let a = 0; a < 8; a++) {
            const normA = (normCoeffs && a < normCoeffs.length) ? normCoeffs[a] : 1.0;
            calNormCoeffs[a] = calConstant * normA;
        }

        // Calculate peak maximum concentration without closure overhead or redundant divisions
        let maxConcGml = 0.0001;
        const invDndc = dndc > 0 ? (1.0 / dndc) : 0;
        const numDriPts = timeDri.length;
        if (!isPlan2) {
            for (let i = 0; i < numDriPts; i++) {
                const deltaN = valDri[i] - driBase;
                if (deltaN > 0) {
                    const c = deltaN * invDndc;
                    if (c > maxConcGml) maxConcGml = c;
                }
            }
        } else {
            for (let i = 0; i < numDriPts; i++) {
                const ml = timeDri[i] * flowRate;
                const curBase = preDriBase + (ml - midPre) * driSlope;
                const deltaN = valDri[i] - curBase;
                if (deltaN > 0) {
                    const c = deltaN * invDndc;
                    if (c > maxConcGml) maxConcGml = c;
                }
            }
        }

        // Peak Gating configuration - Adaptive high-sensitivity thresholds
        const concCutoffFraction = mwGatingSettings.concApexFraction !== undefined ? mwGatingSettings.concApexFraction : 0.01;
        const globalConcThreshold = Math.max(maxConcGml * concCutoffFraction, 0.000003); // 1% of apex or 3 ug/mL
        const isPeaksOnly = mwGatingSettings.mode === 'peaks_only';
        const snrThreshold = mwGatingSettings.snrThreshold || 2.0;
        const noise90 = (malsNoiseStd && malsNoiseStd.length > 4 && malsNoiseStd[4] > 0) ? malsNoiseStd[4] : 0.001;
        const globalMinExcessV90 = Math.max(noise90 * snrThreshold, 0.002); // 2 mV or SNR * noise floor

        // Precompute sorted disjoint peak intervals for O(1) amortized gating & early loop exit
        const peakIntervals = [];
        if (peaks && peaks.length > 0) {
            const validPeaks = [];
            for (let p = 0; p < peaks.length; p++) {
                const pk = peaks[p];
                if (pk && pk.start !== null && pk.end !== null && !isNaN(pk.start) && !isNaN(pk.end)) {
                    validPeaks.push({ start: Math.min(pk.start, pk.end), end: Math.max(pk.start, pk.end) });
                }
            }
            validPeaks.sort((a, b) => a.start - b.start);
            if (validPeaks.length > 0) {
                let curr = validPeaks[0];
                for (let k = 1; k < validPeaks.length; k++) {
                    if (validPeaks[k].start <= curr.end) {
                        curr.end = Math.max(curr.end, validPeaks[k].end);
                    } else {
                        peakIntervals.push(curr);
                        curr = validPeaks[k];
                    }
                }
                peakIntervals.push(curr);
            }
        }
        const numIntervals = peakIntervals.length;
        const minPeakStart = numIntervals > 0 ? peakIntervals[0].start : -Infinity;
        const maxPeakEnd = numIntervals > 0 ? peakIntervals[numIntervals - 1].end : Infinity;
        let peakIntervalPtr = 0;

        // Precompute geometry and pre-extract UV curve for O(1) amortized lookup
        const precomputedSin2 = getPrecomputedSin2Thetas(detectorAngles);
        const reusableRayleigh = new Float64Array(8);

        let uvPts = null;
        let uvIdx = 0;
        if (rawData && rawData.curves) {
            const uvKey = Object.keys(rawData.curves).find(k => k.toLowerCase().includes('uv') && !k.includes('['));
            if (uvKey && rawData.curves[uvKey]) {
                uvPts = rawData.curves[uvKey];
            }
        }

        const sliceMwPts = [];
        const lastDriTime = timeDri[timeDri.length - 1];
        const numDri = timeDri.length;
        const driScaleRatio = (lastDriTime > 0) ? (numDri / lastDriTime) : 0;
        const maxDriIdx = numDri - 1;

        const alignShift = (rawData.mals && rawData.mals.alignmentOffset) ? rawData.mals.alignmentOffset : 0;
        for (let i = 0; i < numSlices; i++) {
            const ml = Math.round((timeMals[i] * flowRate + alignShift) * 10000) / 10000;
            const t = timeMals[i];
            
            // Check if slice falls inside a user-defined peak
            let isInsideUserPeak = false;
            if (numIntervals > 0) {
                while (peakIntervalPtr < numIntervals && ml > peakIntervals[peakIntervalPtr].end) {
                    peakIntervalPtr++;
                }
                if (peakIntervalPtr < numIntervals && ml >= peakIntervals[peakIntervalPtr].start) {
                    isInsideUserPeak = true;
                }
                if (isPeaksOnly && !isInsideUserPeak) {
                    if (ml > maxPeakEnd) break;
                    continue;
                }
            }

            const driIdx = (driScaleRatio > 0) ? Math.max(0, Math.min(Math.floor(t * driScaleRatio), maxDriIdx)) : 0;
            const dMl = ml - midPre;
            const curDriBase = isPlan2 ? (preDriBase + dMl * driSlope) : driBase;
            const deltaN = valDri[driIdx] - curDriBase;
            let concGml = (deltaN > 0 && invDndc > 0) ? (deltaN * invDndc) : 0;

            // If dRI is low or in a buffer dip, use UV 280 absorbance for concentration
            if (concGml <= 1e-5 && uvPts && uvPts.length > 0) {
                while (uvIdx < uvPts.length - 1 && uvPts[uvIdx].ml < ml - 0.05) {
                    uvIdx++;
                }
                const closestUv = uvPts[uvIdx];
                if (closestUv && Math.abs(closestUv.ml - ml) <= 0.1 && closestUv.val > 0.5) {
                    concGml = (closestUv.val / 1000.0) / 1.0;
                }
            }

            const base90 = isPlan2 ? (preMalsBases[4] + dMl * malsSlopes[4]) : malsBases[4];
            const val90 = (gridMals[i] && gridMals[i].length > 4) ? gridMals[i][4] : 0;
            const excessV90 = Math.max(val90 - base90, 0);

            // Adaptive physical thresholds: inside user peaks, calculate down to physical limits (1 ug/mL)
            const effConcThreshold = isInsideUserPeak ? 0.000001 : globalConcThreshold;
            const effMinV90 = isInsideUserPeak ? Math.max(noise90 * 1.5, 0.0015) : globalMinExcessV90;

            if (concGml >= effConcThreshold && excessV90 >= effMinV90) {
                const gridRow = gridMals[i];
                if (isPlan2) {
                    for (let a = 0; a < 8; a++) {
                        const curBaseA = preMalsBases[a] + dMl * malsSlopes[a];
                        const valA = (gridRow && a < gridRow.length) ? gridRow[a] : 0;
                        const excessV = Math.max(valA - curBaseA, 0);
                        reusableRayleigh[a] = calNormCoeffs[a] * excessV;
                    }
                } else {
                    for (let a = 0; a < 8; a++) {
                        const valA = (gridRow && a < gridRow.length) ? gridRow[a] : 0;
                        const excessV = Math.max(valA - malsBases[a], 0);
                        reusableRayleigh[a] = calNormCoeffs[a] * excessV;
                    }
                }

                const mwDa = extrapolateMolarMass(reusableRayleigh, detectorAngles, concGml, kStar, fitModel, precomputedSin2);
                if (mwDa && mwDa >= 1000 && mwDa <= 5e7) {
                    const mwKda = mwDa / 1000.0;
                    sliceMwPts.push({ x: ml, y: mwKda, ml, val: mwKda, mw: mwKda, concGml });
                }
            }
        }

        rawData.mals.sliceMw = sliceMwPts;
        rawData.mals.malsBases = malsBases;
        rawData.mals.malsNoiseStd = malsNoiseStd;
        rawData.mals.driBase = driBase;

        // Calculate average molar mass per peak with early break on sorted slices
        const sLen = sliceMwPts.length;
        peaks.forEach(pk => {
            const pStart = Math.min(pk.start, pk.end);
            const pEnd = Math.max(pk.start, pk.end);
            let sumC = 0, sumCMw = 0, sumCInvMw = 0;
            for (let i = 0; i < sLen; i++) {
                const s = sliceMwPts[i];
                if (s.ml < pStart) continue;
                if (s.ml > pEnd) break; // sliceMwPts is sorted by elution volume
                if (s.mw > 0) {
                    const c = s.concGml || 1.0;
                    sumC += c;
                    sumCMw += c * s.mw;
                    sumCInvMw += c / s.mw;
                }
            }
            if (sumC > 0 && sumCInvMw > 0) {
                pk.mwKda = sumCMw / sumC;
                pk.mnKda = sumC / sumCInvMw;
                pk.pdi = pk.mnKda > 0 ? (pk.mwKda / pk.mnKda) : 1.0;
                pk.stoich = predictStoichiometry(pk.mwKda);
            } else {
                pk.mwKda = null;
                pk.mnKda = null;
                pk.pdi = null;
                pk.stoich = { desc: 'N/A', formula: '—', errorPct: null };
            }
        });

        // Find reference/primary peak for baseline comparison
        const validPeaksWithMw = peaks.filter(p => p.mwKda !== null && p.mwKda > 0);
        let primaryPeak = null;
        let refMw = null;
        if (validPeaksWithMw.length > 0) {
            primaryPeak = validPeaksWithMw.reduce((best, p) => (!best || p.auc > best.auc) ? p : best, null);
            refMw = primaryPeak.mwKda;
        } else if (sliceMwPts.length > 0) {
            let sumC = 0, sumCMw = 0;
            for (let i = 0; i < sliceMwPts.length; i++) {
                const s = sliceMwPts[i];
                if (s.concGml >= maxConcGml * 0.3) {
                    sumC += s.concGml;
                    sumCMw += s.concGml * s.mw;
                }
            }
            if (sumC > 0) {
                refMw = sumCMw / sumC;
            } else if (sliceMwPts.length > 0) {
                refMw = sliceMwPts[Math.floor(sliceMwPts.length / 2)].mw;
            }
        }

        const studioDeltaMwBadge = document.getElementById('studio-delta-mw-badge');
        if (refMw !== null && refMw > 0) {
            if (initialBaseMw === null) {
                initialBaseMw = refMw;
            }
            const deltaMw = refMw - initialBaseMw;
            const deltaPct = initialBaseMw > 0 ? (deltaMw / initialBaseMw) * 100 : 0;
            const sign = deltaMw >= 0 ? '+' : '';
            if (studioDeltaMwBadge) {
                studioDeltaMwBadge.style.display = 'inline-flex';
                studioDeltaMwBadge.textContent = `Mw: ${refMw.toFixed(1)} kDa (Δ: ${sign}${deltaMw.toFixed(1)} kDa, ${sign}${deltaPct.toFixed(1)}%)`;
                studioDeltaMwBadge.style.borderLeftColor = Math.abs(deltaPct) < 5 ? 'var(--success)' : (Math.abs(deltaPct) < 15 ? 'var(--warning)' : 'var(--danger)');
            }
        } else if (studioDeltaMwBadge) {
            studioDeltaMwBadge.style.display = 'none';
        }

        const studioTareBadge = document.getElementById('studio-tare-badge');
        if (studioTareBadge) {
            if (plan === 'plan2') {
                studioTareBadge.textContent = `Linear Drift Tare: ${bStart.toFixed(2)}-${bEnd.toFixed(2)} to ${postStart.toFixed(2)}-${postEnd.toFixed(2)} mL`;
            } else if (plan === 'plan3') {
                studioTareBadge.textContent = `2-Point Tare: ${bStart.toFixed(2)}-${bEnd.toFixed(2)} & ${postStart.toFixed(2)}-${postEnd.toFixed(2)} mL`;
            } else {
                studioTareBadge.textContent = `Tare Window: ${bStart.toFixed(2)} - ${bEnd.toFixed(2)} mL`;
            }
        }

        updatePeaksTable();
        updateStudioPhotodiodesTable();
        
        // Multi-Canvas view-aware rendering: only render the active view's chart
        if (currentView === 'baseline-studio') {
            renderBaselinePreviewChart();
        } else if (currentView === 'figure-editor') {
            renderFigureEditorChart();
        } else {
            renderChart(true);
        }
    } catch (err) {
        console.error("Error recalculating MALS data:", err);
    }
}

// ==========================================================================
// WebAssembly SQLite & Wyatt ASTRA Parser (.afe7 / .afs7)
// ==========================================================================

async function getSqlInstance() {
    if (sqliteModule) return sqliteModule;
    if (typeof initSqlJs !== 'function') {
        throw new Error("sql.js WebAssembly module is not loaded yet.");
    }
    sqliteModule = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    return sqliteModule;
}

function extractWyattFloatArray(blob) {
    if (!blob) return null;
    let uint8 = (blob instanceof Uint8Array)
        ? blob
        : (blob instanceof ArrayBuffer
            ? new Uint8Array(blob)
            : (ArrayBuffer.isView(blob)
                ? new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
                : null));
    if (!uint8 || uint8.length < 16 || uint8.length > 50 * 1024 * 1024) return null;

    let zlibOffset = -1;
    for (let i = 0; i < Math.min(uint8.length - 2, 64); i++) {
        if (uint8[i] === 0x78 && (uint8[i+1] === 0x9c || uint8[i+1] === 0xda || uint8[i+1] === 0x01 || uint8[i+1] === 0x5e)) {
            zlibOffset = i;
            break;
        }
    }

    let dataBytes = null;
    if (zlibOffset !== -1) {
        try {
            dataBytes = pako.inflate(uint8.subarray(zlibOffset));
        } catch (e) {}
    }
    if (!dataBytes) {
        dataBytes = uint8.subarray(16);
    }
    if (!dataBytes || dataBytes.byteLength > 50 * 1024 * 1024) {
        return null;
    }

    const byteLen = dataBytes.byteLength;
    if (byteLen >= 8 && byteLen % 8 === 0) {
        if (dataBytes.byteOffset % 8 === 0) {
            return new Float64Array(dataBytes.buffer, dataBytes.byteOffset, byteLen >> 3);
        } else {
            const copy = new ArrayBuffer(byteLen);
            new Uint8Array(copy).set(dataBytes);
            return new Float64Array(copy);
        }
    } else if (byteLen >= 4 && byteLen % 4 === 0) {
        if (dataBytes.byteOffset % 4 === 0) {
            const f32 = new Float32Array(dataBytes.buffer, dataBytes.byteOffset, byteLen >> 2);
            return Float64Array.from(f32);
        } else {
            const copy = new ArrayBuffer(byteLen);
            new Uint8Array(copy).set(dataBytes);
            const f32 = new Float32Array(copy);
            return Float64Array.from(f32);
        }
    }
    return null;
}

async function parseWyattAstraFile(arrayBuffer, filename) {
    if (!arrayBuffer || (!(arrayBuffer instanceof ArrayBuffer) && !ArrayBuffer.isView(arrayBuffer))) {
        throw new Error("Invalid file buffer.");
    }
    let bytes = (arrayBuffer instanceof Uint8Array) ? arrayBuffer : new Uint8Array(arrayBuffer);
    
    if (bytes.length >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B) {
        try {
            bytes = pako.ungzip(bytes);
            if (!bytes || bytes.length > 100 * 1024 * 1024) {
                throw new Error("Decompressed archive exceeds maximum allowed size (100MB).");
            }
        } catch (gzErr) {
            throw new Error(`Failed to decompress GZIP archive: ${gzErr.message}`);
        }
    }

    const SQL = await getSqlInstance();
    let db = null;
    try {
        db = new SQL.Database(bytes);

        let sampleName = filename.replace(/\.(afe7|afs7)$/i, '');
        let flowRate = 0.5;
        let dndc = 0.185;
        let laserWavelength = 660.5;
        let calConstant = 3.4815e-5;
        let detectorAngles = [32.0, 44.0, 57.0, 72.0, 90.0, 108.0, 126.0, 141.0];
        let normCoeffs = [1.545, 2.151, 0.858, 0.983, 1.0, 1.0, 0.812, 2.105];

        try {
            const sampleStmt = db.exec("SELECT m_ExperimentName, flowRate, m_dConcentration, m_dInjectedVolume, m_dDndc FROM WSampleSetSampleDetails LIMIT 1;");
            if (sampleStmt[0] && sampleStmt[0].values[0]) {
                const sRow = sampleStmt[0].values[0];
                if (sRow[0]) sampleName = String(sRow[0]);
                if (sRow[1] && parseFloat(sRow[1]) > 0) flowRate = parseFloat(sRow[1]);
                if (sRow[4] && parseFloat(sRow[4]) > 0) dndc = parseFloat(sRow[4]);
            }
        } catch (e) {}

        try {
            const heleosStmt = db.exec("SELECT m_dWavelength, m_dCalibrationConstant, m_vDetectorAngles, m_vNormalizationCoefficients FROM WHeleos8Profile LIMIT 1;");
            if (heleosStmt[0] && heleosStmt[0].values[0]) {
                const hRow = heleosStmt[0].values[0];
                if (hRow[0] && parseFloat(hRow[0]) > 0) laserWavelength = parseFloat(hRow[0]);
                if (hRow[1] && parseFloat(hRow[1]) > 0) calConstant = parseFloat(hRow[1]);
                const angArr = extractWyattFloatArray(hRow[2]);
                if (angArr && angArr.length >= 8) detectorAngles = Array.from(angArr.slice(0, 8));
                const normArr = extractWyattFloatArray(hRow[3]);
                if (normArr && normArr.length >= 8) normCoeffs = Array.from(normArr.slice(0, 8));
            }
        } catch (e) {}

        if (malsWavelength) malsWavelength.value = laserWavelength.toFixed(1);
        if (malsDndc) malsDndc.value = dndc.toFixed(3);

        const curveMap = Object.create(null);
        let timeMals = null;
        let gridMals = null;
        let timeDri = null;
        let valDri = null;

        try {
            const mStmt = db.prepare("SELECT m_vIndex, m_vColumnIndex, m_vvValue FROM WMatrixData WHERE m_sInstrumentClassName='WHeleos8Profile' AND m_nDataName=12022;");
            if (mStmt.step()) {
                const mRow = mStmt.getAsObject();
                const tArr = extractWyattFloatArray(mRow.m_vIndex);
                const cArr = extractWyattFloatArray(mRow.m_vColumnIndex);
                const vArr = extractWyattFloatArray(mRow.m_vvValue);
                if (tArr && vArr && cArr && vArr.length === tArr.length * cArr.length) {
                    timeMals = tArr;
                    const numSlices = tArr.length;
                    const numCols = cArr.length;
                    gridMals = new Array(numSlices);
                    for (let s = 0; s < numSlices; s++) {
                        gridMals[s] = vArr.subarray(s * numCols, (s + 1) * numCols);
                    }
                }
            }
            mStmt.free();
        } catch (e) {}

        try {
            const driStmt = db.prepare("SELECT m_vIndex, m_vValue FROM WVectorData WHERE m_sInstrumentClassName='WNGOInstrumentProfile' AND m_nDataName=12025;");
            if (driStmt.step()) {
                const dRow = driStmt.getAsObject();
                timeDri = extractWyattFloatArray(dRow.m_vIndex);
                valDri = extractWyattFloatArray(dRow.m_vValue);
            }
            driStmt.free();
        } catch (e) {}

        if (timeMals && gridMals) {
            const numSlices = timeMals.length;
            const det5Pts = new Array(numSlices);
            const rawDet5 = new Float64Array(numSlices);
            for (let i = 0; i < numSlices; i++) rawDet5[i] = gridMals[i][4] || 0;

            const baseLen = Math.max(Math.floor(numSlices * 0.05), 10);
            let baseSum = 0;
            for (let i = 0; i < baseLen; i++) baseSum += rawDet5[i];
            const base90 = baseSum / baseLen;

            for (let i = 0; i < numSlices; i++) {
                const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
                const val = Math.max(rawDet5[i] - base90, 0);
                det5Pts[i] = { x: ml, y: val, ml, val, rawVal: rawDet5[i] };
            }
            curveMap['Light Scattering 90° (MALS Det 5)'] = det5Pts;

            const angleNames = ['32°', '44°', '57°', '72°', '90°', '108°', '126°', '141°'];
            for (let a = 0; a < 8; a++) {
                if (a === 4) continue;
                const angPts = new Array(numSlices);
                let aBase = 0;
                for (let i = 0; i < baseLen; i++) aBase += gridMals[i][a];
                aBase /= baseLen;

                for (let i = 0; i < numSlices; i++) {
                    const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
                    const val = Math.max(gridMals[i][a] - aBase, 0);
                    angPts[i] = { x: ml, y: val, ml, val };
                }
                curveMap[`LS Det ${a + 1} (${angleNames[a]})`] = angPts;
            }
        }

        let maxConc = 0;
        if (timeDri && valDri) {
            const numDri = timeDri.length;
            const driBaseLen = Math.max(Math.floor(numDri * 0.05), 10);
            let driBase = 0;
            for (let i = 0; i < driBaseLen; i++) driBase += valDri[i];
            driBase /= driBaseLen;

            const driExcessPts = new Array(numDri);
            const concPts = new Array(numDri);

            for (let i = 0; i < numDri; i++) {
                const ml = Math.round(timeDri[i] * flowRate * 10000) / 10000;
                const deltaN = valDri[i] - driBase;
                const deltaNMicro = deltaN * 1e6;
                const concMgMl = Math.max((deltaN / dndc) * 1000.0, 0);
                if (concMgMl > maxConc) maxConc = concMgMl;

                driExcessPts[i] = { x: ml, y: deltaNMicro, ml, val: deltaNMicro };
                concPts[i] = { x: ml, y: concMgMl, ml, val: concMgMl };
            }

            curveMap['Refractive Index dRI (Optilab)'] = driExcessPts;
            curveMap['Concentration Profile c(t)'] = concPts;
        }

        const sliceMwPts = [];
        if (timeMals && gridMals && timeDri && valDri) {
            const numSlices = timeMals.length;
            const kStar = calculateKStar(dndc, laserWavelength, 1.332);

            const baseLen = Math.max(Math.floor(numSlices * 0.05), 10);
            const malsBases = new Float64Array(8);
            for (let a = 0; a < 8; a++) {
                let s = 0;
                for (let i = 0; i < baseLen; i++) s += gridMals[i][a];
                malsBases[a] = s / baseLen;
            }

            const driBaseLen = Math.max(Math.floor(timeDri.length * 0.05), 10);
            let driBase = 0;
            for (let i = 0; i < driBaseLen; i++) driBase += valDri[i];
            let maxConcGml = 0.0001;
            for (let i = 0; i < timeDri.length; i++) {
                const deltaN = Math.max(valDri[i] - driBase, 0);
                const c = deltaN / dndc;
                if (c > maxConcGml) maxConcGml = c;
            }
            const concThreshold = Math.max(maxConcGml * 0.08, 0.00003);

            const rayleighAngles = new Float64Array(8);
            const numDri = timeDri.length;
            const lastDriTime = timeDri[numDri - 1];

            for (let i = 0; i < numSlices; i++) {
                const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
                const t = timeMals[i];
                
                const driIdx = (lastDriTime > 0) ? Math.max(0, Math.min(Math.floor((t / lastDriTime) * numDri), numDri - 1)) : 0;
                const deltaN = valDri[driIdx] - driBase;
                const concGml = dndc > 0 ? (deltaN / dndc) : 0;
                const val90 = (gridMals[i] && gridMals[i].length > 4) ? gridMals[i][4] : 0;
                const excessV90 = Math.max(val90 - malsBases[4], 0);

                if (concGml >= concThreshold && excessV90 > 0.02) {
                    for (let a = 0; a < 8; a++) {
                        const valA = (gridMals[i] && a < gridMals[i].length) ? gridMals[i][a] : 0;
                        const excessV = Math.max(valA - malsBases[a], 0);
                        const normA = (normCoeffs && a < normCoeffs.length) ? normCoeffs[a] : 1.0;
                        rayleighAngles[a] = calConstant * normA * excessV;
                    }

                    const mwDa = extrapolateMolarMass(rayleighAngles, detectorAngles, concGml, kStar, 'single');
                    if (mwDa && mwDa >= 1000 && mwDa <= 5e7) {
                        const mwKda = mwDa / 1000.0;
                        sliceMwPts.push({ x: ml, y: mwKda, ml, val: mwKda, mw: mwKda, concGml });
                    }
                }
            }
        }

        return {
            type: 'wyatt_astra',
            curves: curveMap,
            fractions: [],
            injections: [],
            mals: {
                hasMals: true,
                sliceMw: sliceMwPts,
                rawGridMals: gridMals,
                timeMals: timeMals,
                timeDri: timeDri,
                valDri: valDri,
                flowRate,
                laserWavelength,
                calConstant,
                dndc,
                detectorAngles,
                normCoeffs
            },
            metadata: {
                sampleName,
                flowRate,
                maxConc,
                calConstant,
                laserWavelength
            }
        };
    } finally {
        if (db) {
            try { db.close(); } catch (e) {}
        }
    }
}

// ==========================================================================
// Universal Wyatt ASTRA Multi-Section & Wide CSV Parser
// ==========================================================================

function isWyattAstraCSV(text) {
    if (!text || typeof text !== 'string') return false;
    const l = text.toLowerCase();
    return l.includes('differential refractive index') ||
           l.includes('detector 1:') ||
           l.includes('detector 2:') ||
           (l.includes('optilab') && (l.includes('detector') || l.includes('ls'))) ||
           (l.includes('ls det') && l.includes('90°')) ||
           (l.includes('ls 1') && (l.includes('ls 5') || l.includes('90°'))) ||
           (l.includes('detector 5') && l.includes('detector 1'));
}

function parseWyattAstraCSV(text, filename = 'Wyatt_ASTRA_Run') {
    if (!text || typeof text !== 'string') throw new Error("File is empty or contains no data.");
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) throw new Error("File is empty or contains no data lines.");

    const delim = detectCsvDelimiter(lines);

    let flowRate = 0.5;
    let dndc = 0.185;
    if (malsDndc && parseFloat(malsDndc.value) > 0) dndc = parseFloat(malsDndc.value);
    let laserWavelength = 660.5;
    if (malsWavelength && parseFloat(malsWavelength.value) > 0) laserWavelength = parseFloat(malsWavelength.value);
    let calConstant = 3.4815e-5;
    let detectorAngles = [32.0, 44.0, 57.0, 72.0, 90.0, 108.0, 126.0, 141.0];
    let normCoeffs = [1.545, 2.151, 0.858, 0.983, 1.0, 1.0, 0.812, 2.105];

    // Detect multi-section format from first 100 lines
    let isMultiSection = false;
    const scanLimit = Math.min(lines.length, 100);
    for (let i = 0; i < scanLimit; i++) {
        const l = lines[i];
        if (!l) continue;
        const ll = l.toLowerCase();
        if (ll.includes('refractive index data:') || ll.includes('detector 1:') || ll.includes('differential refractive index') || (ll.endsWith(':') && (ll.includes('detector') || ll.includes('data')))) {
            isMultiSection = true;
            break;
        }
    }

    const curveMap = Object.create(null);
    let timeMals = null;
    let timeDri = null;
    let valDri = null;
    let gridMals = null;
    let directMwPts = [];

    if (isMultiSection) {
        let currentSection = null;
        const sectionFlatData = Object.create(null);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const ll = line.toLowerCase();
            if (line.endsWith(':') || ll.includes('data:') || ll.startsWith('detector ') || ll.startsWith('differential refractive index')) {
                const sec = line.replace(/:$/, '').trim().toLowerCase();
                if (isSafeKey(sec)) {
                    currentSection = sec;
                    if (!sectionFlatData[currentSection]) sectionFlatData[currentSection] = [];
                }
                continue;
            }

            if (!currentSection || !sectionFlatData[currentSection]) continue;

            const parts = line.split(delim);
            if (parts.length >= 2) {
                const p0 = parseSafeFloat(parts[0]);
                const p1 = parseSafeFloat(parts[1]);
                if (!isNaN(p0) && !isNaN(p1)) {
                    sectionFlatData[currentSection].push(p0, p1);
                }
            }
        }

        // 1. Process dRI
        const driKey = Object.keys(sectionFlatData).find(k => k.includes('refractive index') || k.includes('dri'));
        if (driKey && sectionFlatData[driKey].length > 0) {
            const flat = sectionFlatData[driKey];
            const count = flat.length >> 1;
            timeDri = new Float64Array(count);
            valDri = new Float64Array(count);
            for (let j = 0; j < count; j++) {
                const idx = j << 1;
                timeDri[j] = flat[idx];
                valDri[j] = flat[idx + 1];
            }
        }

        // 2. Process Detectors
        const detKeys = Object.keys(sectionFlatData).filter(k => k.includes('detector') || k.includes('det') || k.includes('ls'));
        if (detKeys.length > 0) {
            const refFlat = sectionFlatData[detKeys[0]];
            const numSlices = refFlat.length >> 1;
            timeMals = new Float64Array(numSlices);
            for (let j = 0; j < numSlices; j++) timeMals[j] = refFlat[j << 1];

            gridMals = new Array(numSlices);
            for (let s = 0; s < numSlices; s++) gridMals[s] = new Float64Array(8);

            for (let a = 0; a < 8; a++) {
                const targetDetNum = a + 1;
                const matchKey = detKeys.find(k => {
                    const numMatch = k.match(/\d+/);
                    return numMatch && parseInt(numMatch[0]) === targetDetNum;
                }) || detKeys[Math.min(a, detKeys.length - 1)];

                if (matchKey && sectionFlatData[matchKey]) {
                    const flat = sectionFlatData[matchKey];
                    const limit = Math.min(numSlices, flat.length >> 1);
                    for (let s = 0; s < limit; s++) {
                        gridMals[s][a] = flat[(s << 1) + 1];
                    }
                }
            }
        }

        if (!timeDri && timeMals) {
            timeDri = timeMals;
            valDri = new Float64Array(timeMals.length);
        }
    } else {
        // Wide-Table Single-Header CSV
        let headerIdx = 0;
        for (let i = 0; i < scanLimit; i++) {
            const l = lines[i];
            if (!l) continue;
            const ll = l.toLowerCase();
            if (ll.includes('time') || ll.includes('volume') || ll.includes('detector') || ll.includes('ls') || ll.includes('dri')) {
                headerIdx = i;
                break;
            }
        }

        const headerParts = lines[headerIdx].split(delim).map(p => p.trim().replace(/^"|"$/g, ''));
        const timeCol = headerParts.findIndex(p => p.toLowerCase().includes('time') || p.toLowerCase().includes('min'));
        const volCol = headerParts.findIndex(p => p.toLowerCase().includes('volume') || p.toLowerCase().includes('ml'));
        const driCol = headerParts.findIndex(p => p.toLowerCase().includes('dri') || p.toLowerCase().includes('refractive index') || p.toLowerCase().includes('riu'));
        const uvCol = headerParts.findIndex(p => p.toLowerCase().includes('uv') || p.toLowerCase().includes('mau') || p.toLowerCase().includes('280'));
        const mwCol = headerParts.findIndex(p => p.toLowerCase().includes('molar mass') || p.toLowerCase().includes('mw') || p.toLowerCase().includes('molecular weight'));

        const detCols = new Array(8).fill(-1);
        for (let a = 0; a < 8; a++) {
            const detNum = a + 1;
            detCols[a] = headerParts.findIndex(p => {
                const pl = p.toLowerCase();
                return pl.includes(`detector ${detNum}`) || pl.includes(`det ${detNum}`) || pl.includes(`ls ${detNum}`) || pl.includes(`ls det ${detNum}`);
            });
        }
        if (detCols[4] === -1) {
            detCols[4] = headerParts.findIndex(p => p.toLowerCase().includes('90') || p.toLowerCase().includes('ls') || p.toLowerCase().includes('light scattering'));
        }

        const numPotentialRows = Math.max(0, lines.length - headerIdx - 1);
        timeMals = new Float64Array(numPotentialRows);
        timeDri = new Float64Array(numPotentialRows);
        valDri = new Float64Array(numPotentialRows);
        gridMals = new Array(numPotentialRows);

        let validCount = 0;
        for (let r = headerIdx + 1; r < lines.length; r++) {
            const line = lines[r];
            if (!line) continue;
            const parts = line.split(delim);
            if (parts.length < 2) continue;

            const p0 = parseSafeFloat(parts[0]);
            if (isNaN(p0)) continue;

            let t = 0;
            if (timeCol !== -1 && parts.length > timeCol) {
                const val = parseSafeFloat(parts[timeCol]);
                if (!isNaN(val)) t = val;
            } else if (volCol !== -1 && parts.length > volCol) {
                const val = parseSafeFloat(parts[volCol]);
                if (!isNaN(val)) t = val / flowRate;
            } else {
                t = validCount * 0.01;
            }

            timeMals[validCount] = t;
            timeDri[validCount] = t;

            if (driCol !== -1 && parts.length > driCol) {
                const val = parseSafeFloat(parts[driCol]);
                valDri[validCount] = isNaN(val) ? 0 : val;
            } else {
                valDri[validCount] = 0;
            }

            const detVals = new Float64Array(8);
            for (let a = 0; a < 8; a++) {
                const c = detCols[a];
                if (c !== -1 && parts.length > c) {
                    const val = parseSafeFloat(parts[c]);
                    if (!isNaN(val)) detVals[a] = val;
                } else if (detCols[4] !== -1 && parts.length > detCols[4]) {
                    const val = parseSafeFloat(parts[detCols[4]]);
                    if (!isNaN(val)) detVals[a] = val;
                }
            }
            gridMals[validCount] = detVals;

            if (uvCol !== -1 && parts.length > uvCol) {
                const val = parseSafeFloat(parts[uvCol]);
                if (!isNaN(val)) {
                    if (!curveMap['UV 280 (mAU)']) curveMap['UV 280 (mAU)'] = [];
                    const ml = Math.round(t * flowRate * 10000) / 10000;
                    curveMap['UV 280 (mAU)'].push({ x: ml, y: val, ml, val });
                }
            }

            if (mwCol !== -1 && parts.length > mwCol) {
                let val = parseSafeFloat(parts[mwCol]);
                if (!isNaN(val) && val > 0) {
                    const ml = Math.round(t * flowRate * 10000) / 10000;
                    if (val > 1000) val /= 1000.0;
                    directMwPts.push({ x: ml, y: val, ml, val, mw: val, concGml: 0.001 });
                }
            }

            validCount++;
        }

        if (validCount < numPotentialRows) {
            timeMals = timeMals.subarray(0, validCount);
            timeDri = timeDri.subarray(0, validCount);
            valDri = valDri.subarray(0, validCount);
            gridMals.length = validCount;
        }
    }

    if (!timeMals || !gridMals || timeMals.length === 0) {
        throw new Error("Could not extract Light Scattering channels from this Wyatt ASTRA CSV.");
    }

    const numSlices = timeMals.length;
    const baseLen = Math.max(1, Math.min(numSlices, Math.max(Math.floor(numSlices * 0.05), 10)));
    const rawDet5 = new Float64Array(numSlices);
    for (let i = 0; i < numSlices; i++) rawDet5[i] = (gridMals[i] && gridMals[i].length > 4) ? gridMals[i][4] : 0;

    let baseSum = 0;
    for (let i = 0; i < baseLen; i++) baseSum += rawDet5[i];
    const base90 = baseSum / baseLen;

    const det5Pts = new Array(numSlices);
    for (let i = 0; i < numSlices; i++) {
        const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
        const val = Math.max(rawDet5[i] - base90, 0);
        det5Pts[i] = { x: ml, y: val, ml, val, rawVal: rawDet5[i] };
    }
    curveMap['Light Scattering 90° (MALS Det 5)'] = det5Pts;

    const angleNames = ['32°', '44°', '57°', '72°', '90°', '108°', '126°', '141°'];
    for (let a = 0; a < 8; a++) {
        if (a === 4) continue;
        const angPts = new Array(numSlices);
        let aBase = 0;
        for (let i = 0; i < baseLen; i++) aBase += (gridMals[i] && a < gridMals[i].length ? gridMals[i][a] : 0);
        aBase /= baseLen;

        for (let i = 0; i < numSlices; i++) {
            const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
            const val = Math.max((gridMals[i] && a < gridMals[i].length ? gridMals[i][a] : 0) - aBase, 0);
            angPts[i] = { x: ml, y: val, ml, val };
        }
        curveMap[`LS Det ${a + 1} (${angleNames[a]})`] = angPts;
    }

    let maxConc = 0;
    if (timeDri && valDri && timeDri.length > 0) {
        const numDri = timeDri.length;
        const driBaseLen = Math.max(1, Math.min(numDri, Math.max(Math.floor(numDri * 0.05), 10)));
        let driBase = 0;
        for (let i = 0; i < driBaseLen; i++) driBase += valDri[i];
        driBase /= driBaseLen;

        const driExcessPts = new Array(numDri);
        const concPts = new Array(numDri);

        for (let i = 0; i < numDri; i++) {
            const ml = Math.round(timeDri[i] * flowRate * 10000) / 10000;
            const deltaN = valDri[i] - driBase;
            const deltaNMicro = deltaN * 1e6;
            const concMgMl = Math.max(dndc > 0 ? ((deltaN / dndc) * 1000.0) : 0, 0);
            if (concMgMl > maxConc) maxConc = concMgMl;

            driExcessPts[i] = { x: ml, y: deltaNMicro, ml, val: deltaNMicro };
            concPts[i] = { x: ml, y: concMgMl, ml, val: concMgMl };
        }

        curveMap['Refractive Index dRI (Optilab)'] = driExcessPts;
        curveMap['Concentration Profile c(t)'] = concPts;
    }

    let sliceMwPts = directMwPts.length > 0 ? directMwPts : [];
    if (sliceMwPts.length === 0 && timeMals && gridMals && timeDri && valDri && timeDri.length > 0) {
        const kStar = calculateKStar(dndc, laserWavelength, 1.332);
        const malsBases = new Float64Array(8);
        for (let a = 0; a < 8; a++) {
            let s = 0;
            for (let i = 0; i < baseLen; i++) s += (gridMals[i] && a < gridMals[i].length ? gridMals[i][a] : 0);
            malsBases[a] = s / baseLen;
        }

        const driBaseLen = Math.max(1, Math.min(timeDri.length, Math.max(Math.floor(timeDri.length * 0.05), 10)));
        let driBase = 0;
        for (let i = 0; i < driBaseLen; i++) driBase += valDri[i];
        driBase /= driBaseLen;

        let maxConcGml = 0.0001;
        for (let i = 0; i < timeDri.length; i++) {
            const deltaN = Math.max(valDri[i] - driBase, 0);
            const c = dndc > 0 ? (deltaN / dndc) : 0;
            if (c > maxConcGml) maxConcGml = c;
        }
        const concThreshold = Math.max(maxConcGml * 0.08, 0.00003);
        const lastDriTime = timeDri[timeDri.length - 1];
        const numDri = timeDri.length;
        const rayleighAngles = new Float64Array(8);

        for (let i = 0; i < numSlices; i++) {
            const ml = Math.round(timeMals[i] * flowRate * 10000) / 10000;
            const t = timeMals[i];
            const driIdx = (lastDriTime > 0) ? Math.max(0, Math.min(Math.floor((t / lastDriTime) * numDri), numDri - 1)) : 0;
            const deltaN = valDri[driIdx] - driBase;
            const concGml = dndc > 0 ? (deltaN / dndc) : 0;
            const val90 = (gridMals[i] && gridMals[i].length > 4) ? gridMals[i][4] : 0;
            const excessV90 = Math.max(val90 - malsBases[4], 0);

            if (concGml >= concThreshold && excessV90 > 0.02) {
                for (let a = 0; a < 8; a++) {
                    const valA = (gridMals[i] && a < gridMals[i].length) ? gridMals[i][a] : 0;
                    const excessV = Math.max(valA - malsBases[a], 0);
                    const normA = (normCoeffs && a < normCoeffs.length) ? normCoeffs[a] : 1.0;
                    rayleighAngles[a] = calConstant * normA * excessV;
                }

                const mwDa = extrapolateMolarMass(rayleighAngles, detectorAngles, concGml, kStar, 'single');
                if (mwDa && mwDa >= 1000 && mwDa <= 5e7) {
                    const mwKda = mwDa / 1000.0;
                    sliceMwPts.push({ x: ml, y: mwKda, ml, val: mwKda, mw: mwKda, concGml });
                }
            }
        }
    }

    const sampleName = (typeof filename === 'string' && filename) ? filename.replace(/\.(csv|txt|afe7|afs7)$/i, '') : 'Wyatt_ASTRA_Run';

    return {
        type: 'wyatt_astra',
        curves: curveMap,
        fractions: [],
        injections: [],
        mals: {
            hasMals: true,
            sliceMw: sliceMwPts,
            rawGridMals: gridMals,
            timeMals: timeMals,
            timeDri: timeDri,
            valDri: valDri,
            flowRate,
            laserWavelength,
            calConstant,
            dndc,
            detectorAngles,
            normCoeffs
        },
        metadata: {
            sampleName,
            flowRate,
            maxConc,
            calConstant,
            laserWavelength
        }
    };
}

// ==========================================================================
// Universal ÄKTA UNICORN CSV & UTF-16 Parser
// ==========================================================================

function parseUniversalCSV(text) {
    if (!text || typeof text !== 'string') {
        throw new Error("File is empty or contains no data.");
    }
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
        throw new Error("File is empty or contains no data lines.");
    }
    
    const delim = detectCsvDelimiter(lines);

    // 1. Scan up to 100 lines for UNICORN Unit Row
    let unitRowIdx = -1;
    const scanLimit = Math.min(lines.length, 100);
    for (let i = 0; i < scanLimit; i++) {
        const l = lines[i];
        if (!l) continue;
        const parts = l.split(delim).map(p => p.trim().toLowerCase().replace(/^"|"$/g, ''));
        const hasMl = parts.some(p => p === 'ml' || p.includes('ml') || p === 'min' || p.includes('min') || p === 'vol' || p.includes('volume'));
        const hasSignal = parts.some(p => p.includes('mau') || p.includes('au') || p.includes('ms/cm') || p.includes('fraction') || p.includes('injection') || p === '%' || p.includes('%') || p.includes('cond') || p.includes('uv') || p.includes('abs'));
        if (hasMl && hasSignal) {
            unitRowIdx = i;
            break;
        }
    }

    // 2. If no UNICORN unit row, check for Generic / Multi-Wavelength Header or Raw 2-Column Table
    if (unitRowIdx === -1) {
        let headerIdx = -1;
        for (let i = 0; i < scanLimit; i++) {
            const l = lines[i];
            if (!l) continue;
            const parts = l.split(delim).map(p => p.trim().toLowerCase().replace(/^"|"$/g, ''));
            if (parts.length >= 2) {
                const hasHeaderKeyword = parts.some(p => 
                    p.includes('ml') || p.includes('vol') || p.includes('time') || p.includes('min') ||
                    p.includes('uv') || p.includes('mau') || p.includes('abs') || p.includes('280') ||
                    p.includes('254') || p.includes('215') || p.includes('cond') || p.includes('%') ||
                    p.includes('dri') || p.includes('ls') || p.includes('signal')
                );
                if (hasHeaderKeyword) {
                    headerIdx = i;
                    break;
                }
            }
        }

        if (headerIdx !== -1) {
            const headerParts = lines[headerIdx].split(delim).map(p => p.trim().replace(/^"|"$/g, ''));
            const headerLower = headerParts.map(p => p.toLowerCase());
            let mlCol = headerLower.findIndex(p => p.includes('ml') || p.includes('vol') || p.includes('time') || p.includes('min'));
            if (mlCol === -1) mlCol = 0;

            const curves = Object.create(null);
            const colMap = [];

            for (let c = 0; c < headerParts.length; c++) {
                if (c === mlCol) continue;
                let cName = headerParts[c] || `Channel_${c}`;
                const cl = cName.toLowerCase();
                if (cl.includes('280') || cl === 'uv' || cl === 'absorbance' || cl === 'mau') {
                    cName = 'UV 280 (mAU)';
                } else if (cl.includes('254')) {
                    cName = 'UV 254 (mAU)';
                } else if (cl.includes('215')) {
                    cName = 'UV 215 (mAU)';
                } else if (cl.includes('cond') || cl.includes('ms/cm')) {
                    cName = 'Conductivity (mS/cm)';
                } else if (cl.includes('%b') || cl.includes('conc b') || cl.includes('buffer %')) {
                    cName = 'Buffer %B';
                }
                if (!isSafeKey(cName)) cName = `Channel_${c}`;
                curves[cName] = [];
                colMap.push({ col: c, name: cName });
            }

            for (let r = headerIdx + 1; r < lines.length; r++) {
                const line = lines[r];
                if (!line) continue;
                const row = line.split(delim);
                if (row.length <= mlCol) continue;
                const ml = parseSafeFloat(row[mlCol]);
                if (isNaN(ml)) continue;

                colMap.forEach(cm => {
                    if (row.length > cm.col) {
                        const val = parseSafeFloat(row[cm.col]);
                        if (!isNaN(val)) {
                            curves[cm.name].push({ x: ml, y: val, ml, val });
                        }
                    }
                });
            }

            const validCurveKeys = Object.keys(curves).filter(k => curves[k].length > 0);
            if (validCurveKeys.length > 0) {
                return {
                    type: 'simple',
                    curves,
                    fractions: [],
                    injections: [],
                    mals: { hasMals: false, sliceMw: [] }
                };
            }
        }

        // 3. Fallback: Pure Headerless 2-Column or Multi-Column Numeric Table
        if (lines.length > 0 && lines[0]) {
            const firstParts = lines[0].split(delim);
            if (firstParts.length >= 2) {
                const v0 = parseSafeFloat(firstParts[0]);
                const v1 = parseSafeFloat(firstParts[1]);
                if (!isNaN(v0) && !isNaN(v1)) {
                    const uvPts = [];
                    for (let r = 0; r < lines.length; r++) {
                        const line = lines[r];
                        if (!line) continue;
                        const row = line.split(delim);
                        if (row.length >= 2) {
                            const ml = parseSafeFloat(row[0]);
                            const val = parseSafeFloat(row[1]);
                            if (!isNaN(ml) && !isNaN(val)) {
                                uvPts.push({ x: ml, y: val, ml, val });
                            }
                        }
                    }
                    if (uvPts.length > 0) {
                        return {
                            type: 'simple',
                            curves: { 'UV 280 (mAU)': uvPts },
                            fractions: [],
                            injections: [],
                            mals: { hasMals: false, sliceMw: [] }
                        };
                    }
                }
            }
        }

        throw new Error("Could not find volume ('ml') and detector signal columns in this CSV/TSV file.");
    }

    // 4. Parse UNICORN Paired Columns
    const nameRow = unitRowIdx > 0 ? lines[unitRowIdx - 1].split(delim).map(p => p.trim().replace(/^"|"$/g, '')) : [];
    const unitRow = lines[unitRowIdx].split(delim).map(p => p.trim().replace(/^"|"$/g, ''));

    const curveDefs = [];
    let fracPair = null;
    let injPair = null;

    let c = 0;
    while (c < unitRow.length) {
        const u1 = (unitRow[c] || '').toLowerCase();
        const u2 = (unitRow[c + 1] || '').toLowerCase();
        
        let curveName = nameRow[c] || '';
        if (!curveName && nameRow[c + 1]) curveName = nameRow[c + 1];
        if (!curveName && unitRow[c + 1]) curveName = unitRow[c + 1];
        if (!curveName || !isSafeKey(curveName)) {
            curveName = `Curve_${Math.floor(c / 2) + 1}`;
        }

        if (curveName.toLowerCase().includes('fraction') || u2.includes('fraction')) {
            fracPair = { mlCol: c, textCol: c + 1 };
            c += 2;
        } else if (curveName.toLowerCase().includes('injection') || u2.includes('injection') || curveName.toLowerCase().includes('logbook')) {
            injPair = { mlCol: c, textCol: c + 1 };
            c += 2;
        } else if ((u1.includes('ml') || u1.includes('min') || u1.includes('vol')) && c + 1 < unitRow.length) {
            curveDefs.push({ mlCol: c, valCol: c + 1, name: curveName });
            c += 2;
        } else {
            c += 1;
        }
    }

    if (curveDefs.length === 0 && unitRow.length >= 2) {
        for (let col = 1; col < unitRow.length; col++) {
            let curveName = (nameRow[col] || unitRow[col] || `Channel_${col}`).trim();
            if (!isSafeKey(curveName)) curveName = `Channel_${col}`;
            curveDefs.push({ mlCol: 0, valCol: col, name: curveName });
        }
    }

    const curves = Object.create(null);
    curveDefs.forEach(def => { curves[def.name] = []; });
    const rawFractions = [];
    const rawInjections = [];

    for (let r = unitRowIdx + 1; r < lines.length; r++) {
        const line = lines[r];
        if (!line) continue;
        const parts = line.split(delim);
        
        for (let i = 0; i < curveDefs.length; i++) {
            const def = curveDefs[i];
            if (parts.length > def.valCol && parts[def.mlCol] !== undefined && parts[def.valCol] !== undefined) {
                const ml = parseSafeFloat(parts[def.mlCol]);
                const val = parseSafeFloat(parts[def.valCol]);
                if (!isNaN(ml) && !isNaN(val)) {
                    curves[def.name].push({ x: ml, y: val, ml, val });
                }
            }
        }

        if (fracPair && parts.length > fracPair.textCol && parts[fracPair.mlCol] !== undefined) {
            const fml = parseSafeFloat(parts[fracPair.mlCol]);
            const ftxt = parts[fracPair.textCol].trim().replace(/^"|"$/g, '');
            if (!isNaN(fml) && ftxt && ftxt !== '0' && ftxt !== '-') {
                rawFractions.push({ ml: fml, text: ftxt });
            }
        }

        if (injPair && parts.length > injPair.textCol && parts[injPair.mlCol] !== undefined) {
            const iml = parseSafeFloat(parts[injPair.mlCol]);
            const itxt = parts[injPair.textCol].trim().replace(/^"|"$/g, '');
            if (!isNaN(iml) && (!rawInjections.some(inj => Math.abs(inj.ml - iml) < 0.1))) {
                rawInjections.push({ ml: iml, text: itxt || `Injection at ${iml.toFixed(2)} mL` });
            }
        }
    }

    const fractions = [];
    rawFractions.sort((a, b) => a.ml - b.ml);
    for (let i = 0; i < rawFractions.length; i++) {
        const curr = rawFractions[i];
        const nextMl = (i + 1 < rawFractions.length) ? rawFractions[i + 1].ml : (curr.ml + 1.5);
        fractions.push({ name: curr.text, startMl: curr.ml, endMl: nextMl });
    }

    rawInjections.sort((a, b) => a.ml - b.ml);

    return {
        type: 'unicorn',
        curves,
        fractions,
        injections: rawInjections,
        mals: { hasMals: false, sliceMw: [] }
    };
}

// ==========================================================================
// Point Decimation & Performance Engine
// ==========================================================================

function decimateCurve(points, targetCount = 3000) {
    if (!points || points.length <= targetCount) return points;
    
    const len = points.length;
    const bucketSize = Math.floor(len / (targetCount / 2));
    if (bucketSize <= 1) return points;

    const estimatedSize = Math.min(len, Math.ceil(len / bucketSize) * 2 + 2);
    const decimated = new Array(estimatedSize);
    decimated[0] = points[0];
    let outIdx = 1;
    
    for (let i = 1; i < len - 1; i += bucketSize) {
        const end = Math.min(i + bucketSize, len - 1);
        let minPt = points[i];
        let maxPt = points[i];
        let minIdx = i;
        let maxIdx = i;
        let minVal = minPt.val;
        let maxVal = maxPt.val;
        
        for (let j = i + 1; j < end; j++) {
            const p = points[j];
            const v = p.val;
            if (v < minVal) { minVal = v; minPt = p; minIdx = j; }
            if (v > maxVal) { maxVal = v; maxPt = p; maxIdx = j; }
        }
        
        if (minIdx < maxIdx) {
            decimated[outIdx++] = minPt;
            decimated[outIdx++] = maxPt;
        } else {
            decimated[outIdx++] = maxPt;
            decimated[outIdx++] = minPt;
        }
    }
    
    decimated[outIdx++] = points[len - 1];
    decimated.length = outIdx;
    return decimated;
}

// ==========================================================================
// Chart.js Multi-Axis Rendering & Overlay Engine
// ==========================================================================

// Scaled LS Curves Memory Cache to prevent repeated point object allocations during zoom/pan
const _scaledLsCache = new Map();

function clearScaledLsCache() {
    _scaledLsCache.clear();
}

function getLsScaleFraction() {
    if (!toggleLsScaling || !toggleLsScaling.checked) return null;
    const pct = lsHeightSlider ? (parseFloat(lsHeightSlider.value) || 50) : 50;
    return pct / 100.0;
}

function formatCompactLabel(name) {
    if (!name || typeof name !== 'string') return '';
    if (plotSettings && plotSettings.aliases && isSafeKey(name) && typeof plotSettings.aliases[name] === 'string' && plotSettings.aliases[name]) {
        return plotSettings.aliases[name];
    }
    let s = name;
    s = s.replace(/Light Scattering 90° \(MALS Det 5\)/gi, 'LS 90°');
    s = s.replace(/Refractive Index dRI \(Optilab\)/gi, 'dRI');
    s = s.replace(/Concentration Profile c\(t\)/gi, 'Conc c(t)');
    s = s.replace(/LS Det (\d+) \((\d+°)\)/gi, 'LS $2');
    s = s.replace(/\[([^\]]+)\]/g, (m, p1) => `[${p1.slice(0, 8)}]`);
    return s;
}

function applyMonoLsColors() {
    if (!monoLsEnabled) return;
    try {
        let hex = monoLsBaseColor || '#6366f1';
        if (!hex.startsWith('#')) hex = '#' + hex;
        let r = 99, g = 102, b = 241;
        if (hex.length === 7) {
            const parsedR = parseInt(hex.slice(1, 3), 16);
            const parsedG = parseInt(hex.slice(3, 5), 16);
            const parsedB = parseInt(hex.slice(5, 7), 16);
            if (!isNaN(parsedR)) r = parsedR;
            if (!isNaN(parsedG)) g = parsedG;
            if (!isNaN(parsedB)) b = parsedB;
        } else if (hex.length === 4) {
            const parsedR = parseInt(hex[1] + hex[1], 16);
            const parsedG = parseInt(hex[2] + hex[2], 16);
            const parsedB = parseInt(hex[3] + hex[3], 16);
            if (!isNaN(parsedR)) r = parsedR;
            if (!isNaN(parsedG)) g = parsedG;
            if (!isNaN(parsedB)) b = parsedB;
        }

        const alphas = [0.25, 0.33, 0.42, 0.52, 1.0, 0.62, 0.72, 0.82];

        if (rawData && rawData.curves) {
            Object.keys(rawData.curves).forEach(name => {
                if (!isSafeKey(name)) return;
                const nl = name.toLowerCase();
                if (nl.includes('90°') || nl.includes('det 5')) {
                    curveColors[name] = hex;
                } else if (nl.startsWith('ls det') || nl.includes('light scattering')) {
                    const match = nl.match(/det\s*(\d+)/i);
                    if (match) {
                        const idx = parseInt(match[1]) - 1;
                        const a = alphas[Math.max(0, Math.min(idx, alphas.length - 1))];
                        curveColors[name] = `rgba(${r}, ${g}, ${b}, ${a})`;
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Error applying monochromatic LS colors:", e);
    }
}

function applyChartAspectRatio() {
    const wrappers = [
        document.getElementById('chart-canvas-wrapper'),
        document.getElementById('v3-chart-canvas-wrapper')
    ];

    wrappers.forEach(wrapper => {
        if (!wrapper) return;
        wrapper.classList.remove('aspect-16-9', 'aspect-4-3', 'aspect-1-1', 'aspect-custom');
        wrapper.style.width = '';
        wrapper.style.height = '';

        if (plotSettings.aspectRatioPreset === '16:9') {
            wrapper.classList.add('aspect-16-9');
        } else if (plotSettings.aspectRatioPreset === '4:3') {
            wrapper.classList.add('aspect-4-3');
        } else if (plotSettings.aspectRatioPreset === '1:1') {
            wrapper.classList.add('aspect-1-1');
        } else if (plotSettings.aspectRatioPreset === 'custom') {
            wrapper.classList.add('aspect-custom');
            wrapper.style.width = `${plotSettings.customWidth}px`;
            wrapper.style.height = `${plotSettings.customHeight}px`;
        }
    });

    if (chartInstance) {
        chartInstance.resize();
    }
    if (figureEditorChartInstance) {
        figureEditorChartInstance.resize();
    }
}

function buildChartDatasets() {
    if (!rawData || !rawData.curves) return [];
    
    if (monoLsEnabled) {
        applyMonoLsColors();
    }

    const useDecimation = toggleDecimation && toggleDecimation.checked;
    const lsFraction = getLsScaleFraction();
    const activeCurves = useDecimation ? decimatedCurves : rawData.curves;
    const datasets = [];

    // Unified single pass for primary Y-axis max and Light Scattering max
    let primaryYMax = 100.0;
    let foundNonLs = false;
    let lsMax = 1.0;

    const curveNames = Object.keys(activeCurves);
    for (let c = 0; c < curveNames.length; c++) {
        const name = curveNames[c];
        if (!isSafeKey(name)) continue;
        const nl = name.toLowerCase();
        const isLs = nl.includes('90°') || nl.startsWith('ls det') || nl.includes('light scattering');
        const arr = activeCurves[name];
        if (!arr || arr.length === 0) continue;

        if (isLs) {
            for (let i = 0; i < arr.length; i++) {
                const v = arr[i].val;
                if (v > lsMax) lsMax = v;
            }
        } else if (curveVisibility[name] !== false) {
            for (let i = 0; i < arr.length; i++) {
                const v = arr[i].val;
                if (v > primaryYMax || !foundNonLs) {
                    if (v > 0) { primaryYMax = Math.max(primaryYMax, v); foundNonLs = true; }
                }
            }
        }
    }

    // Cap _scaledLsCache to prevent unbounded memory growth during continuous slider movements
    if (_scaledLsCache.size > 40) {
        _scaledLsCache.clear();
    }

    for (let c = 0; c < curveNames.length; c++) {
        const name = curveNames[c];
        if (!isSafeKey(name) || curveVisibility[name] === false) continue;
        
        let pts = activeCurves[name];
        const color = curveColors[name] || '#38bdf8';
        const nameLower = name.toLowerCase();
        const isLs = nameLower.includes('90°') || nameLower.startsWith('ls det') || nameLower.includes('light scattering');
        
        let yAxisID = 'y';
        if (nameLower.includes('buffer') || nameLower.includes('%b') || nameLower.includes('conc b') || nameLower.includes('cond') || nameLower.includes('ph')) {
            yAxisID = 'yBuffer';
        }

        // Apply 0-100% Peak Apex Normalization
        if (normalizeCurves && !isLs && yAxisID === 'y' && pts && pts.length > 0) {
            let minV = Infinity, maxV = -Infinity;
            for (let i = 0; i < pts.length; i++) {
                const v = pts[i].val;
                if (v < minV) minV = v;
                if (v > maxV) maxV = v;
            }
            const span = maxV - minV;
            if (span > 1e-4) {
                const normPts = new Array(pts.length);
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    const normVal = ((p.val - minV) / span) * 100.0;
                    normPts[i] = { x: p.ml, y: normVal, ml: p.ml, val: normVal, rawVal: p.val };
                }
                pts = normPts;
            }
        }

        if (lsFraction !== null && isLs && lsMax > 1e-4) {
            // Scale LS with caching to avoid re-allocating 30,000 objects per render/zoom frame
            const targetHeight = primaryYMax * lsFraction;
            const factor = targetHeight / lsMax;
            const cacheKey = `${name}_${useDecimation ? 'd' : 'f'}_${factor.toFixed(5)}`;
            let cachedScaled = _scaledLsCache.get(cacheKey);
            if (!cachedScaled) {
                cachedScaled = new Array(pts.length);
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    cachedScaled[i] = {
                        x: p.ml,
                        y: p.val * factor,
                        ml: p.ml,
                        val: p.val,
                        rawVal: p.val
                    };
                }
                _scaledLsCache.set(cacheKey, cachedScaled);
            }
            pts = cachedScaled;
        }
        
        const displayLabel = formatCompactLabel(name);
        
        datasets.push({
            type: 'line',
            label: displayLabel,
            rawName: name,
            data: pts,
            borderColor: color,
            backgroundColor: color,
            borderWidth: nameLower.includes('90°') || nameLower.includes('280') ? 2.5 : 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHitRadius: 4,
            spanGaps: true,
            fill: false,
            tension: 0.05,
            yAxisID: yAxisID,
            parsing: false,
            normalized: true
        });
    }

    if (showMolarMassOverlay && rawData.mals && rawData.mals.sliceMw && rawData.mals.sliceMw.length > 0) {
        const validMwData = rawData.mals.sliceMw.filter(p => p.y >= 1.0 && p.y <= 50000 && !isNaN(p.y) && isFinite(p.y));
        if (validMwData.length > 0) {
            datasets.push({
                type: 'scatter',
                label: plotSettings.aliases['Molar Mass Mw (kDa)'] || 'Molar Mass Mw (kDa)',
                rawName: 'Molar Mass Mw (kDa)',
                data: validMwData,
                borderColor: '#e879f9',
                backgroundColor: '#e879f9',
                pointRadius: 2.5,
                pointHoverRadius: 6,
                pointHitRadius: 6,
                showLine: true,
                borderWidth: 1.5,
                yAxisID: 'yMolarMass',
                parsing: false,
                normalized: true
            });
        }
    }
    
    return datasets;
}

// RequestAnimationFrame Debounce Scheduler for 60fps multi-canvas chart updates
let _rafRenderId = null;
let _rafPreserveZoom = true;

function queueChartRender(preserveZoom = true) {
    _rafPreserveZoom = _rafPreserveZoom && preserveZoom;
    if (_rafRenderId !== null) return;
    _rafRenderId = requestAnimationFrame(() => {
        _rafRenderId = null;
        if (currentView === 'baseline-studio') {
            renderBaselinePreviewChart();
        } else if (currentView === 'figure-editor') {
            renderFigureEditorChart();
        } else {
            renderChart(_rafPreserveZoom);
        }
        _rafPreserveZoom = true;
    });
}

function renderChart(preserveZoom = true) {
    const canvas = document.getElementById('chromatogram-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!rawData || !rawData.curves || Object.keys(rawData.curves).length === 0) {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        return;
    }
    
    applyChartAspectRatio();
    const datasets = buildChartDatasets();
    const hasRightAxis = Object.keys(rawData ? rawData.curves : {}).some(k => {
        const kl = k.toLowerCase();
        return kl.includes('buffer') || kl.includes('%b') || kl.includes('conc b') || kl.includes('cond') || kl.includes('ph');
    });
    const hasMolarMass = showMolarMassOverlay && rawData && rawData.mals && rawData.mals.sliceMw && rawData.mals.sliceMw.length > 0;
    let leftAxisTitle = rawData && rawData.type === 'wyatt_astra' ? 'Light Scattering (V) / Refractive Index (μRIU)' : 'Absorbance (mAU)';

    // Dynamic peak-aware headroom for primary Y-axis
    let yPeakMax = 0;
    if (rawData && rawData.curves) {
        Object.keys(rawData.curves).forEach(name => {
            if (!isSafeKey(name)) return;
            const nl = name.toLowerCase();
            const isSec = nl.includes('buffer') || nl.includes('%b') || nl.includes('cond') || nl.includes('ph');
            if (!isSec && curveVisibility[name] !== false) {
                const arr = rawData.curves[name];
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i].val > yPeakMax) yPeakMax = arr[i].val;
                }
            }
        });
    }
    const ySuggestedMax = (plotSettings.yPrimaryAutoscale && yPeakMax > 0) ? (yPeakMax * 1.15) : undefined;

    if (chartInstance) {
        chartInstance.data.datasets = datasets;
        
        // Update Titles & Typography
        chartInstance.options.plugins.title = {
            display: !!plotSettings.title,
            text: plotSettings.title,
            color: colors.text,
            font: {
                family: plotSettings.fontFamily,
                size: plotSettings.titleFontSize,
                weight: plotSettings.fontWeight
            },
            padding: { bottom: 6 }
        };

        chartInstance.options.plugins.subtitle = {
            display: !!plotSettings.subtitle,
            text: plotSettings.subtitle,
            color: colors.text,
            font: {
                family: plotSettings.fontFamily,
                size: plotSettings.subtitleFontSize,
                weight: '400'
            },
            padding: { bottom: 10 }
        };

        // Update Legend
        chartInstance.options.plugins.legend.display = plotSettings.legendPosition !== 'hidden';
        chartInstance.options.plugins.legend.position = plotSettings.legendPosition === 'hidden' ? 'top' : plotSettings.legendPosition;
        chartInstance.options.plugins.legend.align = plotSettings.legendAlign || 'center';
        chartInstance.options.plugins.legend.labels.pointStyle = plotSettings.legendPointStyle || 'circle';
        chartInstance.options.plugins.legend.labels.font = {
            family: plotSettings.fontFamily,
            size: plotSettings.legendFontSize
        };

        // Update Scales
        if (chartInstance.options.scales.x) {
            chartInstance.options.scales.x.title = {
                display: true,
                text: plotSettings.xAxisTitle || 'Elution Volume (mL)',
                color: colors.text,
                font: {
                    family: plotSettings.fontFamily,
                    size: plotSettings.axisTitleFontSize,
                    weight: plotSettings.fontWeight
                }
            };
            chartInstance.options.scales.x.ticks.font = {
                family: plotSettings.fontFamily,
                size: plotSettings.ticksFontSize
            };
        }

        if (chartInstance.options.scales.y) {
            chartInstance.options.scales.y.title = {
                display: true,
                text: plotSettings.yPrimaryTitle || leftAxisTitle,
                color: colors.text,
                font: {
                    family: plotSettings.fontFamily,
                    size: plotSettings.axisTitleFontSize,
                    weight: plotSettings.fontWeight
                }
            };
            const safeY = getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax);
            chartInstance.options.scales.y.min = safeY.min;
            chartInstance.options.scales.y.max = safeY.max;
        }

        if (chartInstance.options.scales.yBuffer) {
            chartInstance.options.scales.yBuffer.display = hasRightAxis;
            chartInstance.options.scales.yBuffer.title = {
                display: hasRightAxis,
                text: plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)',
                color: colors.text,
                font: {
                    family: plotSettings.fontFamily,
                    size: plotSettings.axisTitleFontSize,
                    weight: plotSettings.fontWeight
                }
            };
            chartInstance.options.scales.yBuffer.ticks.font = {
                family: plotSettings.fontFamily,
                size: plotSettings.ticksFontSize
            };
            const safeYBuffer = getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined);
            chartInstance.options.scales.yBuffer.min = safeYBuffer.min;
            chartInstance.options.scales.yBuffer.max = safeYBuffer.max;
        }

        if (chartInstance.options.scales.yMolarMass) {
            chartInstance.options.scales.yMolarMass.display = hasMolarMass;
            chartInstance.options.scales.yMolarMass.title = {
                display: hasMolarMass,
                text: plotSettings.yMolarMassTitle || 'Molar Mass (kDa)',
                color: '#e879f9',
                font: {
                    family: plotSettings.fontFamily,
                    size: plotSettings.axisTitleFontSize,
                    weight: plotSettings.fontWeight
                }
            };
            chartInstance.options.scales.yMolarMass.ticks.font = {
                family: plotSettings.fontFamily,
                size: plotSettings.ticksFontSize
            };
        }

        if (!preserveZoom) {
            chartInstance.resetZoom();
            setResetZoomButtonsDisabled(true);
        }
        chartInstance.update('none');
        return;
    }
    
    chartInstance = new Chart(ctx, {
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            onClick: handleChartClick,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: plotSettings.xAxisTitle || 'Elution Volume (mL)',
                        color: colors.text,
                        font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight }
                    },
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    min: getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax).min,
                    max: getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax).max,
                    title: {
                        display: true,
                        text: plotSettings.yPrimaryTitle || leftAxisTitle,
                        color: colors.text,
                        font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight }
                    },
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                yBuffer: {
                    type: 'linear',
                    position: 'right',
                    display: hasRightAxis,
                    min: getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined).min,
                    max: getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined).max,
                    title: {
                        display: hasRightAxis,
                        text: plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)',
                        color: colors.text,
                        font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: { color: colors.text, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                yMolarMass: {
                    type: 'logarithmic',
                    position: 'right',
                    display: hasMolarMass,
                    min: 1,
                    max: 10000,
                    title: {
                        display: hasMolarMass,
                        text: plotSettings.yMolarMassTitle || 'Molar Mass (kDa)',
                        color: '#e879f9',
                        font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight }
                    },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#e879f9',
                        font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize },
                        callback: function(val) {
                            if (val === 1 || val === 10 || val === 100 || val === 1000 || val === 10000) {
                                return val + ' kDa';
                            }
                            return null;
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: !!plotSettings.title,
                    text: plotSettings.title,
                    color: colors.text,
                    font: { family: plotSettings.fontFamily, size: plotSettings.titleFontSize, weight: plotSettings.fontWeight },
                    padding: { bottom: 6 }
                },
                subtitle: {
                    display: !!plotSettings.subtitle,
                    text: plotSettings.subtitle,
                    color: colors.text,
                    font: { family: plotSettings.fontFamily, size: plotSettings.subtitleFontSize, weight: '400' },
                    padding: { bottom: 10 }
                },
                legend: {
                    display: plotSettings.legendPosition !== 'hidden',
                    position: plotSettings.legendPosition === 'hidden' ? 'top' : plotSettings.legendPosition,
                    align: plotSettings.legendAlign || 'center',
                    labels: {
                        color: colors.text,
                        usePointStyle: true,
                        pointStyle: plotSettings.legendPointStyle || 'circle',
                        boxWidth: 8,
                        font: { family: plotSettings.fontFamily, size: plotSettings.legendFontSize },
                        filter: function(item, chartData) {
                            if (toggleCompactLegend && toggleCompactLegend.checked) {
                                const raw = chartData.datasets[item.datasetIndex]?.rawName || item.text || '';
                                const l = raw.toLowerCase();
                                if (l.startsWith('ls det') && !l.includes('90°') && !l.includes('det 5')) {
                                    return false;
                                }
                            }
                            return true;
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleColor: '#f8fafc',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.parsed.y;
                            if (ctx.dataset.yAxisID === 'yMolarMass') {
                                return `Molar Mass: ${val.toFixed(1)} kDa`;
                            }
                            const raw = ctx.raw && ctx.raw.rawVal !== undefined ? ctx.raw.rawVal : val;
                            if (ctx.raw && ctx.raw.rawVal !== undefined && Math.abs(ctx.raw.rawVal - val) > 1e-4) {
                                return `${ctx.dataset.label}: ${raw.toFixed(3)} (50% BG Scale)`;
                            }
                            return `${ctx.dataset.label}: ${val.toFixed(3)}`;
                        }
                    }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl',
                        onPanComplete: () => {
                            setResetZoomButtonsDisabled(false);
                        }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        drag: {
                            enabled: currentInteractionMode === 'zoom',
                            backgroundColor: 'rgba(56, 189, 248, 0.2)',
                            borderColor: '#38bdf8',
                            borderWidth: 1
                        },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoomComplete: () => {
                            setResetZoomButtonsDisabled(false);
                        }
                    }
                }
            }
        },
        plugins: [
            // Custom Fraction Ribbon Plugin
            {
                id: 'fractionBands',
                beforeDraw: (chart) => {
                    if (!showFractions || !rawData || !rawData.fractions || rawData.fractions.length === 0) return;
                    if (!chart.chartArea || !chart.scales || !chart.scales.x) return;
                    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                    ctx.save();
                    
                    const isLight = document.body.getAttribute('data-theme') === 'light';
                    const fillA = isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)';
                    const fillB = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
                    const lineCol = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
                    const textCol = isLight ? '#64748b' : '#94a3b8';
                    
                    ctx.font = '10px sans-serif';
                    ctx.fillStyle = textCol;
                    ctx.textAlign = 'center';
                    
                    rawData.fractions.forEach((frac, idx) => {
                        const startX = x.getPixelForValue(frac.startMl);
                        const endX = x.getPixelForValue(frac.endMl);
                        
                        if (endX < chart.chartArea.left || startX > chart.chartArea.right) return;
                        
                        const drawStartX = Math.max(startX, chart.chartArea.left);
                        const drawEndX = Math.min(endX, chart.chartArea.right);
                        
                        ctx.fillStyle = (idx % 2 === 0) ? fillA : fillB;
                        ctx.fillRect(drawStartX, top, drawEndX - drawStartX, bottom - top);
                        
                        ctx.strokeStyle = lineCol;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(drawStartX, top);
                        ctx.lineTo(drawStartX, bottom);
                        ctx.stroke();
                        
                        const fracWidth = drawEndX - drawStartX;
                        const midX = (drawStartX + drawEndX) / 2;
                        if (midX >= chart.chartArea.left && midX <= chart.chartArea.right) {
                            if (fracWidth >= 28) {
                                ctx.fillStyle = textCol;
                                ctx.fillText(frac.name, midX, top + 12);
                            } else if (fracWidth >= 14 && idx % 2 === 0) {
                                ctx.fillStyle = textCol;
                                ctx.fillText(frac.name, midX, top + 12);
                            }
                        }
                    });
                    ctx.restore();
                }
            },
            // Custom Peak Highlight Fill Plugin
            {
                id: 'peakHighlights',
                beforeDraw: (chart) => {
                    if (!chart.chartArea || !chart.scales || !chart.scales.x) return;
                    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                    ctx.save();
                    
                    peaks.forEach(pk => {
                        const startX = x.getPixelForValue(pk.start);
                        const endX = x.getPixelForValue(pk.end);
                        if (endX < chart.chartArea.left || startX > chart.chartArea.right) return;
                        const drawStartX = Math.max(startX, chart.chartArea.left);
                        const drawEndX = Math.min(endX, chart.chartArea.right);
                        
                        ctx.fillStyle = colors.peak;
                        ctx.fillRect(drawStartX, top, drawEndX - drawStartX, bottom - top);
                        
                        ctx.strokeStyle = pk.color || '#6366f1';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash([4, 4]);
                        ctx.beginPath();
                        ctx.moveTo(drawStartX, top);
                        ctx.lineTo(drawStartX, bottom);
                        ctx.moveTo(drawEndX, top);
                        ctx.lineTo(drawEndX, bottom);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    });
                    
                    if (currentSelection.start !== null) {
                        const startX = x.getPixelForValue(currentSelection.start);
                        ctx.strokeStyle = '#38bdf8';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(startX, top);
                        ctx.lineTo(startX, bottom);
                        ctx.stroke();

                        if (currentSelection.end !== null) {
                            const endX = x.getPixelForValue(currentSelection.end);
                            const minX = Math.min(startX, endX);
                            const maxX = Math.max(startX, endX);
                            ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
                            ctx.fillRect(minX, top, maxX - minX, bottom - top);
                        }
                    }
                    ctx.restore();
                }
            }
        ]
    });
}

let _lastPeakClickTime = 0;

function processPeakBoundaryClick(clickedMl) {
    if (!chartInstance || !rawData || isNaN(clickedMl)) return;

    if (currentSelection.start === null) {
        currentSelection.start = clickedMl;
        if (peakStartInput) peakStartInput.value = clickedMl.toFixed(2);
        if (clickInstructions) {
            clickInstructions.innerHTML = `<span style="color:#38bdf8; font-weight:700;">📍 Start set at ${clickedMl.toFixed(2)} mL</span> &bull; Click again on chart for Peak End (or press Esc to cancel)`;
        }
        showToast(`Peak Start set at ${clickedMl.toFixed(2)} mL. Click again for Peak End.`, "info");
        chartInstance.update('none');
    } else {
        currentSelection.end = clickedMl;
        if (peakEndInput) peakEndInput.value = clickedMl.toFixed(2);
        
        const targetName = targetCurveSelect ? targetCurveSelect.value : Object.keys(rawData.curves)[0];
        const mode = baselineMode ? baselineMode.value : 'linear';
        const newPk = integrateSelection(targetName, currentSelection.start, currentSelection.end, mode);
        
        if (newPk) {
            peaks.push(newPk);
            if (rawData.mals && rawData.mals.rawGridMals) {
                recalculateMalsData();
            } else {
                updatePeaksTable();
                chartInstance.update('none');
            }
            const mwMsg = newPk.mwKda ? ` | Mw: ${newPk.mwKda.toFixed(1)} kDa (${newPk.stoich.desc})` : '';
            showToast(`Integrated ${newPk.name} (${newPk.start.toFixed(2)} - ${newPk.end.toFixed(2)} mL)${mwMsg}`, "success");
        }
        
        currentSelection.start = null;
        currentSelection.end = null;
        setChartInteractionMode('zoom');
        chartInstance.update('none');
    }
}

function handleChartClick(evt) {
    if (!chartInstance || !rawData) return;
    // In Box Zoom mode, clicks do not start peak boundary definition unless Alt key is held
    if (currentInteractionMode !== 'peak' && !evt.native?.altKey) return;
    if (evt.native && (evt.native.ctrlKey || evt.native.shiftKey)) return;
    
    const now = Date.now();
    if (now - _lastPeakClickTime < 180) return;
    _lastPeakClickTime = now;

    const canvas = document.getElementById('chromatogram-chart');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.native ? evt.native.clientX : (evt.clientX !== undefined ? evt.clientX : evt.x);
    const clientY = evt.native ? evt.native.clientY : (evt.clientY !== undefined ? evt.clientY : evt.y);
    const xPixel = clientX - rect.left;
    const yPixel = clientY - rect.top;

    if (chartInstance.chartArea) {
        if (xPixel < chartInstance.chartArea.left || xPixel > chartInstance.chartArea.right ||
            yPixel < chartInstance.chartArea.top || yPixel > chartInstance.chartArea.bottom) {
            return;
        }
    }

    const clickedMl = chartInstance.scales.x.getValueForPixel(xPixel);
    if (clickedMl !== undefined && !isNaN(clickedMl)) {
        processPeakBoundaryClick(clickedMl);
    }
}

function updateChartTheme() {
    if (!chartInstance) return;
    chartInstance.options.scales.x.grid.color = colors.grid;
    chartInstance.options.scales.x.ticks.color = colors.text;
    chartInstance.options.scales.x.title.color = colors.text;
    chartInstance.options.scales.y.grid.color = colors.grid;
    chartInstance.options.scales.y.ticks.color = colors.text;
    chartInstance.options.scales.y.title.color = colors.text;
    if (chartInstance.options.scales.yBuffer) {
        chartInstance.options.scales.yBuffer.ticks.color = colors.text;
        chartInstance.options.scales.yBuffer.title.color = colors.text;
    }
    chartInstance.options.plugins.legend.labels.color = colors.text;
    chartInstance.update('none');
}

function updateChartColors() {
    if (!chartInstance) return;
    chartInstance.update('none');
}

// ==========================================================================
// Peak Integration & Calculation (ÄKTA & Wyatt Combined)
// ==========================================================================

function integrateSelection(targetCurveName, startMl, endMl, mode = 'linear') {
    if (startMl === null || startMl === undefined || endMl === null || endMl === undefined) return null;
    if (isNaN(startMl) || isNaN(endMl) || !isFinite(startMl) || !isFinite(endMl)) return null;
    if (!rawData || !rawData.curves || !rawData.curves[targetCurveName]) return null;
    const pts = rawData.curves[targetCurveName];
    if (!pts || pts.length < 2) return null;

    const sMl = Math.min(startMl, endMl);
    const eMl = Math.max(startMl, endMl);

    let subset = [];
    for (let i = 0; i < pts.length; i++) {
        if (pts[i].ml >= sMl && pts[i].ml <= eMl) subset.push(pts[i]);
    }
    if (subset.length < 2) return null;

    const startVal = subset[0].val;
    const endVal = subset[subset.length - 1].val;
    const deltaMl = eMl - sMl;

    let auc = 0;
    let apexMl = subset[0].ml;
    let maxHeight = -Infinity;

    for (let i = 0; i < subset.length - 1; i++) {
        const p1 = subset[i];
        const p2 = subset[i + 1];
        const h = p2.ml - p1.ml;

        let y1 = p1.val;
        let y2 = p2.val;

        if (mode === 'linear' && deltaMl > 1e-6) {
            const base1 = startVal + ((p1.ml - sMl) / deltaMl) * (endVal - startVal);
            const base2 = startVal + ((p2.ml - sMl) / deltaMl) * (endVal - startVal);
            y1 -= base1;
            y2 -= base2;
        }

        const trap = (y1 + y2) * 0.5 * h;
        auc += trap;

        if (p1.val > maxHeight) {
            maxHeight = p1.val;
            apexMl = p1.ml;
        }
    }

    let mwAvg = null;
    let mnAvg = null;
    let pdi = null;

    // Check for Molar Mass points within this peak range using early-break loop
    if (rawData.mals && rawData.mals.sliceMw && rawData.mals.sliceMw.length > 0) {
        const slices = rawData.mals.sliceMw;
        let sumC = 0;
        let sumCMw = 0;
        let sumCInvMw = 0;
        let count = 0;

        for (let i = 0; i < slices.length; i++) {
            const s = slices[i];
            if (s.ml < sMl) continue;
            if (s.ml > eMl) break; // Slices are sorted by elution volume
            if (s.mw > 0) {
                const c = s.concGml || 1.0;
                sumC += c;
                sumCMw += c * s.mw;
                sumCInvMw += c / s.mw;
                count++;
            }
        }

        if (count > 0 && sumC > 0 && sumCInvMw > 0) {
            mwAvg = sumCMw / sumC;
            mnAvg = sumC / sumCInvMw;
            pdi = mwAvg / mnAvg;
        }
    }

    const stoich = predictStoichiometry(mwAvg);

    return {
        id: nextPeakId++,
        name: `Peak ${nextPeakId - 1}`,
        targetCurve: targetCurveName,
        start: sMl,
        end: eMl,
        apex: apexMl,
        height: maxHeight,
        auc: auc,
        mode: mode,
        mwKda: mwAvg,
        mnKda: mnAvg,
        pdi: pdi,
        stoich: stoich,
        color: curveColors[targetCurveName] || '#38bdf8'
    };
}

function updatePeaksTable() {
    if (!peaksTableBody) return;
    
    while (peaksTableBody.firstChild) {
        peaksTableBody.removeChild(peaksTableBody.firstChild);
    }
    
    if (peaks.length === 0) {
        const row = document.createElement('tr');
        row.id = 'no-peaks-row';
        const td = document.createElement('td');
        td.colSpan = 12;
        td.style.textAlign = 'center';
        td.style.color = 'var(--text-muted)';
        td.style.fontStyle = 'italic';
        td.style.padding = '2rem';
        td.textContent = 'No peaks integrated yet. Click on any peak in the chart to calculate its molecular weight!';
        row.appendChild(td);
        peaksTableBody.appendChild(row);
        if (exportPeaksCsvBtn) exportPeaksCsvBtn.disabled = true;
        if (clearPeaksBtn) clearPeaksBtn.disabled = true;
        return;
    }
    
    if (exportPeaksCsvBtn) exportPeaksCsvBtn.disabled = false;
    if (clearPeaksBtn) clearPeaksBtn.disabled = false;
    const fragment = document.createDocumentFragment();
    
    peaks.forEach(pk => {
        const tr = document.createElement('tr');
        
        const tdPeak = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge-peak';
        badge.style.borderLeft = `3px solid ${pk.color}`;
        badge.textContent = pk.name;
        tdPeak.appendChild(badge);
        
        const tdRange = document.createElement('td');
        tdRange.textContent = `${pk.start.toFixed(2)} - ${pk.end.toFixed(2)}`;
        
        const tdApex = document.createElement('td');
        tdApex.textContent = pk.apex.toFixed(2);
        
        const tdHeight = document.createElement('td');
        tdHeight.textContent = pk.height.toFixed(2);
        
        const tdAuc = document.createElement('td');
        tdAuc.textContent = pk.auc.toFixed(2);
        
        const secMw = predictApparentSecMw(pk.apex);
        pk.secApparentMw = secMw;
        const sizeInfo = elutionToHydrodynamicRadius(pk.apex, columnCalibrationState.preset);
        pk.estimatedRh = sizeInfo ? sizeInfo.rhNm : null;
        pk.estimatedDiam = sizeInfo ? sizeInfo.diamNm : null;
        pk.globularMw = sizeInfo ? rhToMolecularWeightGlobular(sizeInfo.rhNm) : null;
        pk.disorderedMw = sizeInfo ? rhToMolecularWeightDisordered(sizeInfo.rhNm) : null;

        const tdMw = document.createElement('td');
        if (pk.mwKda !== null) {
            const mwSpan = document.createElement('span');
            mwSpan.className = 'badge-mw';
            mwSpan.textContent = `${pk.mwKda.toFixed(1)} kDa`;
            tdMw.appendChild(mwSpan);
        } else if (secMw !== null || pk.globularMw !== null) {
            const estVal = secMw !== null ? secMw : pk.globularMw;
            const mwSpan = document.createElement('span');
            mwSpan.className = 'badge-mw';
            mwSpan.style.background = '#e3f2fd';
            mwSpan.style.color = '#1565c0';
            mwSpan.style.border = '1px solid #90caf9';
            mwSpan.title = 'Estimated from SEC Column & Stokes Size (MALS concentration was not specified)';
            mwSpan.innerHTML = `~${estVal.toFixed(1)} kDa <small style="display:block; font-size:0.68rem; font-weight:normal; color:#546e7a;">[Est. by Size]</small>`;
            tdMw.appendChild(mwSpan);
        } else {
            tdMw.textContent = '—';
        }
        
        const tdSecMw = document.createElement('td');
        if (secMw !== null) {
            const spanSec = document.createElement('span');
            spanSec.className = 'badge-mw';
            spanSec.style.background = '#e8f5e9';
            spanSec.style.color = '#2e7d32';
            spanSec.style.border = '1px solid #a5d6a7';
            spanSec.textContent = `${secMw.toFixed(1)} kDa`;
            tdSecMw.appendChild(spanSec);
        } else {
            tdSecMw.textContent = '—';
        }

        const tdDiam = document.createElement('td');
        if (pk.estimatedDiam !== null) {
            const spanDiam = document.createElement('span');
            spanDiam.style.fontFamily = 'var(--font-mono)';
            spanDiam.style.fontSize = '0.78rem';
            spanDiam.innerHTML = `<strong>${pk.estimatedDiam.toFixed(2)} nm</strong> <small style="color:var(--text-muted);">(Rh: ${pk.estimatedRh.toFixed(2)} nm)</small>`;
            tdDiam.appendChild(spanDiam);
        } else {
            tdDiam.textContent = '—';
        }

        const tdConformation = document.createElement('td');
        if (secMw !== null && pk.mwKda !== null && pk.mwKda > 0) {
            const ratio = secMw / pk.mwKda;
            pk.shapeRatio = ratio;
            const badgeConf = document.createElement('span');
            badgeConf.className = 'badge-peak';
            if (ratio >= 0.85 && ratio <= 1.15) {
                badgeConf.style.borderLeftColor = 'var(--success)';
                badgeConf.style.color = 'var(--success)';
                badgeConf.textContent = `Globular (${ratio.toFixed(2)}x)`;
            } else if (ratio > 1.15) {
                badgeConf.style.borderLeftColor = '#a78bfa';
                badgeConf.style.color = '#a78bfa';
                badgeConf.textContent = `Elongated (${ratio.toFixed(2)}x)`;
            } else {
                badgeConf.style.borderLeftColor = '#fbbf24';
                badgeConf.style.color = '#fbbf24';
                badgeConf.textContent = `Retarded (${ratio.toFixed(2)}x)`;
            }
            tdConformation.appendChild(badgeConf);
        } else if (pk.globularMw !== null && pk.disorderedMw !== null) {
            const badgeConf = document.createElement('span');
            badgeConf.className = 'badge-peak';
            badgeConf.style.fontSize = '0.7rem';
            badgeConf.textContent = `Glob: ${pk.globularMw.toFixed(0)}k | Dis: ${pk.disorderedMw.toFixed(0)}k`;
            tdConformation.appendChild(badgeConf);
        } else {
            tdConformation.textContent = '—';
        }

        const tdMn = document.createElement('td');
        tdMn.textContent = pk.mnKda !== null ? `${pk.mnKda.toFixed(1)} kDa` : '—';
        
        const tdPdi = document.createElement('td');
        if (pk.pdi !== null) {
            const pdiSpan = document.createElement('span');
            pdiSpan.className = pk.pdi <= 1.05 ? 'badge-pdi-good' : 'badge-pdi-poly';
            pdiSpan.textContent = pk.pdi.toFixed(3);
            tdPdi.appendChild(pdiSpan);
        } else {
            tdPdi.textContent = '—';
        }
        
        const tdStoich = document.createElement('td');
        if (pk.stoich && pk.stoich.desc !== 'N/A') {
            const sSpan = document.createElement('span');
            sSpan.className = 'badge-stoich';
            sSpan.textContent = pk.stoich.desc;
            if (pk.stoich.errorPct !== null) {
                const errSmall = document.createElement('small');
                errSmall.style.display = 'block';
                errSmall.style.fontSize = '0.7rem';
                errSmall.style.color = 'var(--text-muted)';
                errSmall.textContent = `Δ: ${pk.stoich.errorPct > 0 ? '+' : ''}${pk.stoich.errorPct.toFixed(1)}%`;
                sSpan.appendChild(errSmall);
            }
            tdStoich.appendChild(sSpan);
        } else {
            tdStoich.textContent = '—';
        }

        const tdAction = document.createElement('td');
        tdAction.style.textAlign = 'center';
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-table-action btn-delete';
        delBtn.title = 'Delete Peak';
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.addEventListener('click', () => removePeak(pk.id));
        tdAction.appendChild(delBtn);
        
        tr.appendChild(tdPeak);
        tr.appendChild(tdRange);
        tr.appendChild(tdApex);
        tr.appendChild(tdHeight);
        tr.appendChild(tdAuc);
        tr.appendChild(tdMw);
        tr.appendChild(tdSecMw);
        tr.appendChild(tdDiam);
        tr.appendChild(tdConformation);
        tr.appendChild(tdMn);
        tr.appendChild(tdPdi);
        tr.appendChild(tdStoich);
        tr.appendChild(tdAction);
        
        fragment.appendChild(tr);
    });
    
    peaksTableBody.appendChild(fragment);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: peaksTableBody });
    }
}

function removePeak(peakId) {
    peaks = peaks.filter(p => p.id !== peakId);
    if (rawData && rawData.mals && rawData.mals.rawGridMals) {
        recalculateMalsData();
    } else {
        updatePeaksTable();
        if (chartInstance) chartInstance.update('none');
    }
    showToast("Peak removed", "info");
}
window.removePeak = removePeak;

// ==========================================================================
// UI Sidebar Controls & Curves Management
// ==========================================================================

function buildCurvesControlPanel() {
    if (!curvesControlsContainer) return;
    
    while (curvesControlsContainer.firstChild) {
        curvesControlsContainer.removeChild(curvesControlsContainer.firstChild);
    }
    
    if (!rawData || !rawData.curves || Object.keys(rawData.curves).length === 0) {
        const noData = document.createElement('span');
        noData.style.fontSize = '0.75rem';
        noData.style.color = 'var(--text-muted)';
        noData.style.fontStyle = 'italic';
        noData.textContent = 'No data loaded.';
        curvesControlsContainer.appendChild(noData);
        return;
    }
    
    const fragment = document.createDocumentFragment();
    const curveNames = Object.keys(rawData.curves);
    
    if (targetCurveSelect) {
        targetCurveSelect.innerHTML = '';
        curveNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            targetCurveSelect.appendChild(opt);
        });
        activeCurveForIntegration = curveNames[0];
    }
    
    curveNames.forEach((name, idx) => {
        if (!isSafeKey(name)) return;
        if (!curveColors[name]) {
            curveColors[name] = COLOR_PALETTE[idx % COLOR_PALETTE.length];
        }
        if (curveVisibility[name] === undefined) {
            curveVisibility[name] = !name.startsWith('LS Det') || name.includes('90°');
        }
        
        const row = document.createElement('div');
        row.className = 'color-picker-item';
        
        const labelWrapper = document.createElement('label');
        labelWrapper.className = 'curve-toggle-label';
        labelWrapper.style.display = 'flex';
        labelWrapper.style.alignItems = 'center';
        labelWrapper.style.gap = '0.5rem';
        labelWrapper.style.cursor = 'pointer';
        labelWrapper.style.flex = '1';
        
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = curveVisibility[name];
        check.addEventListener('change', () => {
            if (isSafeKey(name)) {
                curveVisibility[name] = check.checked;
                queueChartRender(true);
            }
        });
        
        const nameSpan = document.createElement('span');
        nameSpan.style.fontSize = '0.8rem';
        nameSpan.style.fontWeight = '500';
        nameSpan.textContent = name;
        
        labelWrapper.appendChild(check);
        labelWrapper.appendChild(nameSpan);
        
        const colorWrapper = document.createElement('div');
        colorWrapper.className = 'color-input-wrapper';
        
        const colorIn = document.createElement('input');
        colorIn.type = 'color';
        colorIn.value = colorToHex(curveColors[name]);
        colorIn.addEventListener('input', () => {
            if (isSafeKey(name)) {
                curveColors[name] = colorIn.value;
                colorVal.textContent = colorIn.value.toUpperCase();
                queueChartRender(true);
            }
        });
        
        const colorVal = document.createElement('span');
        colorVal.className = 'color-value';
        colorVal.textContent = colorToHex(curveColors[name]).toUpperCase();
        
        colorWrapper.appendChild(colorIn);
        colorWrapper.appendChild(colorVal);
        
        row.appendChild(labelWrapper);
        row.appendChild(colorWrapper);
        fragment.appendChild(row);
    });
    
    curvesControlsContainer.appendChild(fragment);
}

function updateInjectionDropdown() {
    if (!selectAktaInjection) return;
    selectAktaInjection.innerHTML = '';
    
    if (rawData && rawData.injections && rawData.injections.length > 0) {
        rawData.injections.forEach((inj, idx) => {
            const opt = document.createElement('option');
            opt.value = inj.ml.toFixed(2);
            opt.textContent = `Injection ${idx + 1} (${inj.ml.toFixed(2)} mL)`;
            selectAktaInjection.appendChild(opt);
        });
        if (alignInjVol) alignInjVol.value = rawData.injections[0].ml.toFixed(2);
    } else {
        const opt = document.createElement('option');
        opt.value = "0.0";
        opt.textContent = "Injection 1 (0.00 mL)";
        selectAktaInjection.appendChild(opt);
    }
}

// ==========================================================================
// Multi-Run Overlap / Alignment Handler (Wyatt or ÄKTA)
// ==========================================================================

function applyOverlayShifts() {
    if (!rawData || activeOverlays.length === 0) return;

    const injOffset = parseFloat(alignInjVol.value) || 0.0;
    const tubingDelay = parseFloat(alignTubingDelay.value) || 0.15;
    const effectiveOffset = injOffset - tubingDelay;

    // Remove old overlay curves from rawData
    activeOverlays.forEach(ov => {
        Object.keys(rawData.curves).forEach(k => {
            if (k.endsWith(`[${ov.tag}]`)) {
                delete rawData.curves[k];
            }
        });
    });

    if (rawData.mals) {
        rawData.mals.sliceMw = rawData.mals.sliceMw ? rawData.mals.sliceMw.filter(p => !p.overlayTag) : [];
    }

    // Re-apply shifts
    activeOverlays.forEach(ov => {
        ov.effectiveOffset = effectiveOffset;

        if (ov.rawRun.mals && ov.rawRun.mals.rawGridMals) {
            if (!rawData.mals || rawData.mals.isOverlay) {
                rawData.mals = {
                    ...ov.rawRun.mals,
                    isOverlay: true,
                    overlayTag: ov.tag,
                    alignmentOffset: effectiveOffset
                };
            }
        }

        Object.keys(ov.rawRun.curves).forEach(k => {
            if (!isSafeKey(k)) return;
            const shiftedPts = ov.rawRun.curves[k].map(p => {
                const newMl = Math.round((p.ml + effectiveOffset) * 10000) / 10000;
                return { x: newMl, y: p.val, ml: newMl, val: p.val };
            });
            const overlayName = `${k} [${ov.tag}]`;
            if (isSafeKey(overlayName)) {
                rawData.curves[overlayName] = shiftedPts;
                if (!curveColors[overlayName]) {
                    curveColors[overlayName] = COLOR_PALETTE[Object.keys(rawData.curves).length % COLOR_PALETTE.length];
                }
                if (curveVisibility[overlayName] === undefined) {
                    curveVisibility[overlayName] = true;
                }
            }
        });

        if (ov.rawRun.mals && ov.rawRun.mals.sliceMw) {
            const shiftedMw = ov.rawRun.mals.sliceMw.map(p => {
                const newMl = Math.round((p.ml + effectiveOffset) * 10000) / 10000;
                return { x: newMl, y: p.val, ml: newMl, val: p.val, mw: p.mw, concGml: p.concGml, overlayTag: ov.tag };
            });
            if (!rawData.mals) rawData.mals = { hasMals: true, sliceMw: [] };
            rawData.mals.sliceMw.push(...shiftedMw);
        }
    });

    if (rawData.mals && rawData.mals.rawGridMals) {
        recalculateMalsData();
        syncBaselineStudioUI();
    }

    clearScaledLsCache();
    decimatedCurves = Object.create(null);
    Object.keys(rawData.curves).forEach(k => {
        if (isSafeKey(k)) {
            decimatedCurves[k] = decimateCurve(rawData.curves[k], 3000);
        }
    });

    buildCurvesControlPanel();
    queueChartRender(true);
}

async function handleOverlayFile(file) {
    if (!file) return;
    
    if (!rawData) {
        await handleFile(file);
        return;
    }

    try {
        const injOffset = parseFloat(alignInjVol.value) || 0.0;
        const tubingDelay = parseFloat(alignTubingDelay.value) || 0.15;
        const effectiveOffset = injOffset - tubingDelay;

        showToast(`Aligning ${file.name} at ${injOffset.toFixed(2)} mL...`, "info");

        const arrayBuf = await file.arrayBuffer();
        const isAstra = file.name.endsWith('.afe7') || file.name.endsWith('.afs7');
        let newRun = null;

        if (isAstra) {
            newRun = await parseWyattAstraFile(arrayBuf, file.name);
        } else {
            const text = decodeTextBuffer(arrayBuf);
            if (isWyattAstraCSV(text)) {
                newRun = parseWyattAstraCSV(text, file.name);
            } else {
                newRun = parseUniversalCSV(text);
            }
        }

        const runTag = file.name.replace(/\.(afe7|afs7|csv|txt)$/i, '').slice(0, 10);
        activeOverlays.push({ file, tag: runTag, rawRun: newRun, effectiveOffset });

        applyOverlayShifts();
        if (newRun.mals && newRun.mals.rawGridMals) {
            _cachedBaselinePts = null;
            _cachedBaselineMalsRef = null;
            syncBaselineStudioUI();
            if (baselineChartInstance || currentView === 'baseline-studio') {
                renderBaselineChart();
            }
        }
        populateEditorAliasesTable();
        showToast(`Overlaid ${file.name} with active MALS calibration!`, "success");
    } catch (err) {
        console.error("Overlay error:", err);
        showToast(`Error overlaying file: ${err.message}`, "error");
    }
}

// ==========================================================================
// Auto-Peak Alignment Engine
// ==========================================================================

function autoAlignToNearestPeak() {
    if (!rawData || activeOverlays.length === 0) {
        showToast("Please load an ÄKTA run and add a Wyatt run first.", "warning");
        return;
    }

    const currentInjVol = parseFloat(alignInjVol.value) || 0.0;
    const tubingDelay = parseFloat(alignTubingDelay.value) || 0.15;

    // 1. Find the primary UV curve on ÄKTA
    const uvCurveKey = Object.keys(rawData.curves).find(k => k.toLowerCase().includes('uv') && !k.includes('['));
    if (!uvCurveKey) {
        showToast("Could not find primary ÄKTA UV curve for auto-alignment.", "warning");
        return;
    }
    const uvPts = rawData.curves[uvCurveKey];

    // Find highest ÄKTA peak in the search window near this injection
    const searchStart = currentInjVol - 2.0;
    const searchEnd = currentInjVol + 25.0;
    let maxUv = -Infinity;
    let aktaApexMl = currentInjVol;

    uvPts.forEach(p => {
        if (p.ml >= searchStart && p.ml <= searchEnd && p.val > maxUv) {
            maxUv = p.val;
            aktaApexMl = p.ml;
        }
    });

    // 2. Find the highest peak in the Wyatt Light Scattering / dRI run
    const lastOverlay = activeOverlays[activeOverlays.length - 1];
    if (!lastOverlay || !lastOverlay.rawRun || !lastOverlay.rawRun.curves) {
        showToast("Could not find active Wyatt overlay curves for auto-alignment.", "warning");
        return;
    }
    const wyattLsKey = Object.keys(lastOverlay.rawRun.curves).find(k => k.includes('90°') || k.includes('dRI'));
    if (!wyattLsKey) {
        showToast("Could not find Wyatt Light Scattering peak for auto-alignment.", "warning");
        return;
    }

    const wyattPts = lastOverlay.rawRun.curves[wyattLsKey];
    let maxLs = -Infinity;
    let wyattApexMl = 0;
    wyattPts.forEach(p => {
        if (p.val > maxLs) {
            maxLs = p.val;
            wyattApexMl = p.ml;
        }
    });

    // Calculate required offset
    const calculatedInjOffset = Math.max(0, aktaApexMl - wyattApexMl + tubingDelay);
    alignInjVol.value = calculatedInjOffset.toFixed(2);

    applyOverlayShifts();
    showToast(`Auto-aligned Wyatt peak (${wyattApexMl.toFixed(2)} mL) to ÄKTA peak (${aktaApexMl.toFixed(2)} mL)!`, "success");
}

// ==========================================================================
// 1-Click Standardized Molecular Weight Analysis ("Auto-Fit Best Practice")
// ==========================================================================

function autoFitStandardMolarMass() {
    if (!rawData || !rawData.curves || Object.keys(rawData.curves).length === 0) {
        showToast("Please load a chromatogram first.", "warning");
        return;
    }

    try {
        // 1. Auto-tare solvent baseline to 0.5 - 2.5 mL
        const malsBaselineStart = document.getElementById('mals-baseline-start');
        const malsBaselineEnd = document.getElementById('mals-baseline-end');
        if (malsBaselineStart) malsBaselineStart.value = "0.5";
        if (malsBaselineEnd) malsBaselineEnd.value = "2.5";

        // Recalculate MALS data with updated baseline
        if (rawData.mals && rawData.mals.rawGridMals) {
            recalculateMalsData();
        }

        // 2. Select primary target curve: Prefer UV 280, or LS 90°, or dRI, or first available
        const curveKeys = Object.keys(rawData.curves);
        let targetKey = curveKeys.find(k => k.toLowerCase().includes('uv') && !k.includes('['));
        if (!targetKey) targetKey = curveKeys.find(k => k.includes('90°') || k.includes('Det 5'));
        if (!targetKey) targetKey = curveKeys.find(k => k.toLowerCase().includes('dri') || k.toLowerCase().includes('refractive'));
        if (!targetKey) targetKey = curveKeys[0];

        if (targetCurveSelect) targetCurveSelect.value = targetKey;

        const pts = rawData.curves[targetKey];
        if (!pts || pts.length < 10) {
            showToast("Not enough data points to detect peak.", "warning");
            return;
        }

        // 3. Find primary peak or next largest unintegrated peak apex
        let maxVal = -Infinity;
        let apexIdx = -1;
        const lastPtMl = pts[pts.length - 1]?.ml || 0;
        const minSearchMl = Math.min(2.0, lastPtMl * 0.2);

        const isPointInExistingPeak = (ml) => {
            return peaks.some(p => ml >= Math.min(p.start, p.end) - 0.05 && ml <= Math.max(p.start, p.end) + 0.05);
        };

        for (let i = 0; i < pts.length; i++) {
            if (pts[i].ml >= minSearchMl && pts[i].val > maxVal && !isPointInExistingPeak(pts[i].ml)) {
                maxVal = pts[i].val;
                apexIdx = i;
            }
        }

        // Fallback if no peak after minSearchMl
        if (apexIdx === -1) {
            for (let i = 0; i < pts.length; i++) {
                if (pts[i].val > maxVal && !isPointInExistingPeak(pts[i].ml)) {
                    maxVal = pts[i].val;
                    apexIdx = i;
                }
            }
        }

        if (apexIdx === -1 || maxVal <= 0) {
            showToast(peaks.length > 0 ? "All significant peaks have already been fitted. You can also click on the chart twice to select custom peaks." : "Could not detect prominent peak apex.", "info");
            return;
        }

        const apexMl = pts[apexIdx].ml;

        // 4. Estimate baseline floor near the peak
        const baseVal = Math.min(pts[0].val, pts[Math.min(50, pts.length - 1)].val, pts[pts.length - 1].val);
        const peakHeight = maxVal - baseVal;
        const cutoffVal = baseVal + (peakHeight * 0.25); // ~25% peak height / FWHM boundary

        // Scan left for start
        let startIdx = 0;
        for (let i = apexIdx; i >= 0; i--) {
            if (isPointInExistingPeak(pts[i].ml) || pts[i].val <= cutoffVal || (i > 1 && pts[i].val > pts[i - 1].val && pts[i - 1].val > pts[i - 2].val && pts[i].val < maxVal * 0.5)) {
                startIdx = i;
                break;
            }
        }

        // Scan right for end
        let endIdx = pts.length - 1;
        for (let i = apexIdx; i < pts.length; i++) {
            if (isPointInExistingPeak(pts[i].ml) || pts[i].val <= cutoffVal || (i < pts.length - 2 && pts[i].val > pts[i + 1].val && pts[i + 1].val > pts[i + 2].val && pts[i].val < maxVal * 0.5)) {
                endIdx = i;
                break;
            }
        }

        let startMl = Math.round(pts[startIdx].ml * 100) / 100;
        let endMl = Math.round(pts[endIdx].ml * 100) / 100;

        if (startMl >= endMl) {
            endMl = Math.min(lastPtMl, startMl + 0.8);
        }

        if (peakStartInput) peakStartInput.value = startMl.toFixed(2);
        if (peakEndInput) peakEndInput.value = endMl.toFixed(2);

        // 5. Integrate selection
        const newPk = integrateSelection(targetKey, startMl, endMl, 'linear');
        if (newPk) {
            peaks.push(newPk);
            if (rawData.mals && rawData.mals.rawGridMals) {
                recalculateMalsData();
            } else {
                updatePeaksTable();
                queueChartRender(true);
            }
            const mwStr = newPk.mwKda ? ` | Mw = ${newPk.mwKda.toFixed(1)} kDa (${newPk.stoich.desc})` : '';
            showToast(`Auto-Fit ${newPk.name} detected at ${apexMl.toFixed(2)} mL (${startMl} - ${endMl} mL)${mwStr}`, "success");
        } else {
            showToast("Auto-Fit calculation failed for detected region.", "error");
        }
    } catch (err) {
        console.error("Error during auto-fit:", err);
        showToast(`Auto-Fit error: ${err.message}`, "error");
    }
}

// ==========================================================================
// Interactive Plot Editor UI Sync & Helpers
// ==========================================================================

function populateEditorAliasesTable() {
    const tableBodies = [
        editorAliasesTableBody,
        document.getElementById('editor-aliases-table-body-v3')
    ];

    tableBodies.forEach(tbody => {
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        if (!rawData || !rawData.curves || Object.keys(rawData.curves).length === 0) {
            const emptyTr = document.createElement('tr');
            const emptyTd = document.createElement('td');
            emptyTd.colSpan = 4;
            emptyTd.style.textAlign = 'center';
            emptyTd.style.color = 'var(--text-muted)';
            emptyTd.style.padding = '1.5rem';
            emptyTd.textContent = 'Load a dataset to configure curve aliases.';
            emptyTr.appendChild(emptyTd);
            tbody.appendChild(emptyTr);
            return;
        }

        const fragment = document.createDocumentFragment();
        Object.keys(rawData.curves).forEach((name, idx) => {
            const tr = document.createElement('tr');

            // Visibility checkbox
            const tdVis = document.createElement('td');
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = curveVisibility[name] !== false;
            chk.addEventListener('change', () => {
                curveVisibility[name] = chk.checked;
                buildCurvesControlPanel();
                queueChartRender(true);
            });
            tdVis.appendChild(chk);

            // Color input
            const tdColor = document.createElement('td');
            const colIn = document.createElement('input');
            colIn.type = 'color';
            colIn.value = colorToHex(curveColors[name] || COLOR_PALETTE[idx % COLOR_PALETTE.length]);
            colIn.style.width = '28px';
            colIn.style.height = '28px';
            colIn.style.border = 'none';
            colIn.style.borderRadius = '4px';
            colIn.style.cursor = 'pointer';
            colIn.addEventListener('input', () => {
                curveColors[name] = colIn.value;
                buildCurvesControlPanel();
                queueChartRender(true);
            });
            tdColor.appendChild(colIn);

            // Raw Name
            const tdRaw = document.createElement('td');
            tdRaw.style.fontSize = '0.8rem';
            tdRaw.textContent = name;

            // Alias Input
            const tdAlias = document.createElement('td');
            const aliasIn = document.createElement('input');
            aliasIn.type = 'text';
            aliasIn.className = 'input-control';
            aliasIn.style.fontSize = '0.8rem';
            aliasIn.style.padding = '0.3rem 0.5rem';
            aliasIn.placeholder = formatCompactLabel(name);
            aliasIn.value = (isSafeKey(name) && plotSettings.aliases[name]) ? plotSettings.aliases[name] : '';
            aliasIn.addEventListener('input', () => {
                if (isSafeKey(name)) {
                    plotSettings.aliases[name] = aliasIn.value.trim();
                    queueChartRender(true);
                }
            });
            tdAlias.appendChild(aliasIn);

            tr.appendChild(tdVis);
            tr.appendChild(tdColor);
            tr.appendChild(tdRaw);
            tr.appendChild(tdAlias);
            fragment.appendChild(tr);
        });

        tbody.appendChild(fragment);
    });
}

function syncPlotEditorUI() {
    if (plotTitleInput) plotTitleInput.value = plotSettings.title || '';
    if (plotSubtitleInput) plotSubtitleInput.value = plotSettings.subtitle || '';
    if (plotXAxisTitle) plotXAxisTitle.value = plotSettings.xAxisTitle || 'Elution Volume (mL)';
    if (plotYPrimaryTitle) plotYPrimaryTitle.value = plotSettings.yPrimaryTitle || '';
    if (plotYSecondaryTitle) plotYSecondaryTitle.value = plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)';
    if (plotYMolarMassTitle) plotYMolarMassTitle.value = plotSettings.yMolarMassTitle || 'Molar Mass (kDa)';
    if (plotFontFamily) plotFontFamily.value = plotSettings.fontFamily || 'Plus Jakarta Sans';
    if (plotFontWeight) plotFontWeight.value = plotSettings.fontWeight || '600';
    if (plotTitleSize) plotTitleSize.value = plotSettings.titleFontSize || 16;
    if (plotAxisSize) plotAxisSize.value = plotSettings.axisTitleFontSize || 12;
    if (plotTicksSize) plotTicksSize.value = plotSettings.ticksFontSize || 11;
    if (plotLegendSize) plotLegendSize.value = plotSettings.legendFontSize || 12;
    if (plotLegendPos) plotLegendPos.value = plotSettings.legendPosition || 'top';
    if (plotLegendAlign) plotLegendAlign.value = plotSettings.legendAlign || 'center';
    if (plotPointStyle) plotPointStyle.value = plotSettings.legendPointStyle || 'circle';
    if (plotAspectPreset) plotAspectPreset.value = plotSettings.aspectRatioPreset || 'responsive';
    if (plotCustomW) plotCustomW.value = plotSettings.customWidth || 900;
    if (plotCustomH) plotCustomH.value = plotSettings.customHeight || 500;
    if (customDimsRow) customDimsRow.style.display = plotSettings.aspectRatioPreset === 'custom' ? 'grid' : 'none';
    if (plotExportDpi) plotExportDpi.value = plotSettings.exportDpi || 300;
    if (plotExportFormat) plotExportFormat.value = plotSettings.exportFormat || 'png';
    if (plotExportBg) plotExportBg.value = plotSettings.exportBg || 'publication';
    populateEditorAliasesTable();
}

function syncSplitEditorUI() {
    const v3Title = document.getElementById('v3-plot-title');
    const v3Subtitle = document.getElementById('v3-plot-subtitle');
    const v3XAxis = document.getElementById('v3-plot-xaxis');
    const v3YPrimary = document.getElementById('v3-plot-yprimary');
    const v3YSecondary = document.getElementById('v3-plot-ysecondary');
    const v3YMolarMass = document.getElementById('v3-plot-ymolarmass');
    const v3FontFamily = document.getElementById('v3-plot-font-family');
    const v3FontWeight = document.getElementById('v3-plot-font-weight');
    const v3TitleSize = document.getElementById('v3-plot-title-size');
    const v3AxisSize = document.getElementById('v3-plot-axis-size');
    const v3TicksSize = document.getElementById('v3-plot-ticks-size');
    const v3LegendSize = document.getElementById('v3-plot-legend-size');
    const v3LegendPos = document.getElementById('v3-plot-legend-pos');
    const v3AspectPreset = document.getElementById('v3-plot-aspect-preset');
    const v3CustomW = document.getElementById('v3-plot-custom-w');
    const v3CustomH = document.getElementById('v3-plot-custom-h');
    const v3CustomDimsRow = document.getElementById('v3-custom-dims-row');
    const v3ExportDpi = document.getElementById('v3-plot-export-dpi');
    const v3ExportFormat = document.getElementById('v3-plot-export-format');
    const v3ExportBg = document.getElementById('v3-plot-export-bg');
    const yAutoscaleToggle = document.getElementById('plot-y-primary-autoscale');
    const yPrimaryMinIn = document.getElementById('plot-y-primary-min');
    const yPrimaryMaxIn = document.getElementById('plot-y-primary-max');
    const ySecondaryMinIn = document.getElementById('plot-y-secondary-min');
    const ySecondaryMaxIn = document.getElementById('plot-y-secondary-max');

    if (v3Title) v3Title.value = plotSettings.title || '';
    if (v3Subtitle) v3Subtitle.value = plotSettings.subtitle || '';
    if (v3XAxis) v3XAxis.value = plotSettings.xAxisTitle || 'Elution Volume (mL)';
    if (v3YPrimary) v3YPrimary.value = plotSettings.yPrimaryTitle || '';
    if (v3YSecondary) v3YSecondary.value = plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)';
    if (v3YMolarMass) v3YMolarMass.value = plotSettings.yMolarMassTitle || 'Molar Mass (kDa)';
    if (v3FontFamily) v3FontFamily.value = plotSettings.fontFamily || 'Plus Jakarta Sans';
    if (v3FontWeight) v3FontWeight.value = plotSettings.fontWeight || '600';
    if (v3TitleSize) v3TitleSize.value = plotSettings.titleFontSize || 16;
    if (v3AxisSize) v3AxisSize.value = plotSettings.axisTitleFontSize || 12;
    if (v3TicksSize) v3TicksSize.value = plotSettings.ticksFontSize || 11;
    if (v3LegendSize) v3LegendSize.value = plotSettings.legendFontSize || 12;
    if (v3LegendPos) v3LegendPos.value = plotSettings.legendPosition || 'top';
    if (v3AspectPreset) v3AspectPreset.value = plotSettings.aspectRatioPreset || 'responsive';
    if (v3CustomW) v3CustomW.value = plotSettings.customWidth || 900;
    if (v3CustomH) v3CustomH.value = plotSettings.customHeight || 500;
    if (v3CustomDimsRow) v3CustomDimsRow.style.display = plotSettings.aspectRatioPreset === 'custom' ? 'grid' : 'none';
    if (v3ExportDpi) v3ExportDpi.value = plotSettings.exportDpi || 300;
    if (v3ExportFormat) v3ExportFormat.value = plotSettings.exportFormat || 'png';
    if (v3ExportBg) v3ExportBg.value = plotSettings.exportBg || 'publication';
    if (yAutoscaleToggle) yAutoscaleToggle.checked = plotSettings.yPrimaryAutoscale !== false;
    if (yPrimaryMinIn) yPrimaryMinIn.value = plotSettings.yPrimaryMin !== null ? plotSettings.yPrimaryMin : '';
    if (yPrimaryMaxIn) yPrimaryMaxIn.value = plotSettings.yPrimaryMax !== null ? plotSettings.yPrimaryMax : '';
    if (ySecondaryMinIn) ySecondaryMinIn.value = plotSettings.ySecondaryMin !== null ? plotSettings.ySecondaryMin : '';
    if (ySecondaryMaxIn) ySecondaryMaxIn.value = plotSettings.ySecondaryMax !== null ? plotSettings.ySecondaryMax : '';

    const tbodyV3 = document.getElementById('editor-aliases-table-body-v3');
    if (tbodyV3 && !tbodyV3.hasChildNodes()) {
        populateEditorAliasesTable();
    }
}

function syncBaselineStudioUI() {
    const studioBaselineStart = document.getElementById('studio-baseline-start');
    const studioBaselineEnd = document.getElementById('studio-baseline-end');
    const studioBaselineStartSlider = document.getElementById('studio-baseline-start-slider');
    const studioBaselineEndSlider = document.getElementById('studio-baseline-end-slider');
    const studioBaseStartVal = document.getElementById('studio-base-start-val');
    const studioBaseEndVal = document.getElementById('studio-base-end-val');
    const toggleMwGating = document.getElementById('toggle-mw-peak-gating');
    const sidebarToggleMwGating = document.getElementById('sidebar-toggle-mw-peak-gating');
    const studioSnrSlider = document.getElementById('studio-snr-slider');
    const studioSnrVal = document.getElementById('studio-snr-val');
    const studioConcFractionSlider = document.getElementById('studio-conc-fraction-slider');
    const studioConcFractionVal = document.getElementById('studio-conc-fraction-val');

    const studioBaselinePlan = document.getElementById('studio-baseline-plan');
    const studioPostPeakGroup = document.getElementById('studio-post-peak-group');
    const studioPostStart = document.getElementById('studio-post-start');
    const studioPostEnd = document.getElementById('studio-post-end');
    const studioPostWindowVal = document.getElementById('studio-post-window-val');

    if (studioBaselinePlan && studioPostPeakGroup) {
        const isMultiPoint = studioBaselinePlan.value === 'plan2' || studioBaselinePlan.value === 'plan3';
        studioPostPeakGroup.style.display = isMultiPoint ? 'flex' : 'none';
    }

    if (studioPostStart && studioPostEnd && studioPostWindowVal) {
        const ps = parseFloat(studioPostStart.value) || 18.0;
        const pe = parseFloat(studioPostEnd.value) || 20.0;
        studioPostWindowVal.textContent = `${ps.toFixed(1)} - ${pe.toFixed(1)} mL`;
    }

    const malsBaselineStart = document.getElementById('mals-baseline-start');
    const malsBaselineEnd = document.getElementById('mals-baseline-end');

    const bStart = malsBaselineStart ? (parseFloat(malsBaselineStart.value) || 0.5) : 0.5;
    const bEnd = malsBaselineEnd ? (parseFloat(malsBaselineEnd.value) || 2.5) : 2.5;

    _studioBaselineState.start = bStart;
    _studioBaselineState.end = bEnd;
    if (studioBaselinePlan) _studioBaselineState.plan = studioBaselinePlan.value;
    if (studioPostStart) _studioBaselineState.postStart = parseFloat(studioPostStart.value) || 18.0;
    if (studioPostEnd) _studioBaselineState.postEnd = parseFloat(studioPostEnd.value) || 20.0;

    if (studioBaselineStart) studioBaselineStart.value = bStart.toFixed(2);
    if (studioBaselineEnd) studioBaselineEnd.value = bEnd.toFixed(2);
    if (studioBaselineStartSlider) studioBaselineStartSlider.value = bStart;
    if (studioBaselineEndSlider) studioBaselineEndSlider.value = bEnd;
    if (studioBaseStartVal) studioBaseStartVal.textContent = `${bStart.toFixed(2)} mL`;
    if (studioBaseEndVal) studioBaseEndVal.textContent = `${bEnd.toFixed(2)} mL`;

    const isGated = mwGatingSettings.mode === 'peaks_only';
    if (toggleMwGating) toggleMwGating.checked = isGated;
    if (sidebarToggleMwGating) sidebarToggleMwGating.checked = isGated;
    if (studioSnrSlider) studioSnrSlider.value = mwGatingSettings.snrThreshold || 2.0;
    if (studioSnrVal) studioSnrVal.textContent = `${(mwGatingSettings.snrThreshold || 2.0).toFixed(1)}σ`;
    const curFrac = mwGatingSettings.concApexFraction !== undefined ? mwGatingSettings.concApexFraction : 0.01;
    if (studioConcFractionSlider) studioConcFractionSlider.value = curFrac * 100;
    if (studioConcFractionVal) studioConcFractionVal.textContent = `${(curFrac * 100).toFixed(curFrac < 0.01 ? 1 : 0)}% Apex`;

    updateStudioPhotodiodesTable();
}

function updateStudioPhotodiodesTable() {
    const tbody = document.getElementById('studio-photodiodes-tbody');
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (!rawData || !rawData.mals || !rawData.mals.rawGridMals) {
        const emptyTr = document.createElement('tr');
        const emptyTd = document.createElement('td');
        emptyTd.colSpan = 4;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.color = 'var(--text-muted)';
        emptyTd.style.padding = '1rem';
        emptyTd.textContent = 'Load a Wyatt MALS dataset to view photodiode baselines.';
        emptyTr.appendChild(emptyTd);
        tbody.appendChild(emptyTr);
        return;
    }

    const angleNames = ['32°', '44°', '57°', '72°', '90° (Det 5)', '108°', '126°', '141°'];
    const normCoeffs = rawData.mals.normCoeffs || [1.545, 2.151, 0.858, 0.983, 1.0, 1.0, 0.812, 2.105];
    const bases = rawData.mals.malsBases || new Float64Array(8);

    const frag = document.createDocumentFragment();
    for (let a = 0; a < 8; a++) {
        const tr = document.createElement('tr');
        if (a === 4) tr.style.fontWeight = '700';

        const tdAngle = document.createElement('td');
        tdAngle.style.color = (a === 4) ? '#38bdf8' : 'var(--text-primary)';
        tdAngle.textContent = angleNames[a];

        const tdDet = document.createElement('td');
        tdDet.textContent = `Det ${a + 1}`;

        const tdBase = document.createElement('td');
        tdBase.style.fontFamily = 'monospace';
        tdBase.style.color = bases[a] > 0 ? '#34d399' : 'var(--text-muted)';
        tdBase.textContent = `${bases[a].toFixed(4)} V`;

        const tdNorm = document.createElement('td');
        tdNorm.style.fontFamily = 'monospace';
        tdNorm.textContent = normCoeffs[a].toFixed(3);

        tr.appendChild(tdAngle);
        tr.appendChild(tdDet);
        tr.appendChild(tdBase);
        tr.appendChild(tdNorm);
        frag.appendChild(tr);
    }
    tbody.appendChild(frag);
}

// Cached Baseline Studio state & zero-allocation dash patterns
const DASH_PATTERN = Object.freeze([4, 4]);
const EMPTY_DASH = Object.freeze([]);

const _studioBaselineState = {
    start: 0.5,
    end: 2.5,
    postStart: 18.0,
    postEnd: 20.0,
    plan: 'plan1'
};

let _cachedBaselinePts = null;
let _cachedBaselineMalsRef = null;

function renderBaselinePreviewChart() {
    const canvas = document.getElementById('baseline-preview-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!rawData || !rawData.mals || !rawData.mals.rawGridMals) {
        if (baselineChartInstance) {
            baselineChartInstance.destroy();
            baselineChartInstance = null;
        }
        _cachedBaselinePts = null;
        _cachedBaselineMalsRef = null;
        return;
    }

    const m = rawData.mals;
    const angleNames = ['32°', '44°', '57°', '72°', '90°', '108°', '126°', '141°'];
    const colorsArr = ['#38bdf8', '#34d399', '#fb7185', '#fbbf24', '#e879f9', '#a78bfa', '#22d3ee', '#f472b6'];

    // Fast-path: if baselineChartInstance already exists and raw data hasn't changed,
    // update only dataset labels in-place without re-allocating 12,000 point objects per slider tick!
    if (baselineChartInstance && _cachedBaselineMalsRef === m && _cachedBaselinePts && baselineChartInstance.data.datasets.length === 8) {
        for (let a = 0; a < 8; a++) {
            const baseVal = m.malsBases ? m.malsBases[a] : 0;
            baselineChartInstance.data.datasets[a].label = `LS Det ${a+1} (${angleNames[a]}) [Base: ${baseVal.toFixed(4)}V]`;
        }
        baselineChartInstance.update('none');
        return;
    }

    const timeMals = m.timeMals;
    const gridMals = m.rawGridMals;
    const flowRate = m.flowRate || 0.5;
    const numSlices = Math.min(timeMals ? timeMals.length : 0, gridMals ? gridMals.length : 0);
    if (numSlices === 0) return;

    const step = Math.max(1, Math.floor(numSlices / 1500));
    _cachedBaselinePts = new Array(8);
    for (let a = 0; a < 8; a++) {
        const rawPts = [];
        for (let i = 0; i < numSlices; i += step) {
            const ml = Math.round((timeMals[i] * flowRate + (m.alignmentOffset || 0)) * 100) / 100;
            const val = gridMals[i] ? gridMals[i][a] : 0;
            rawPts.push({ x: ml, y: val });
        }
        _cachedBaselinePts[a] = rawPts;
    }
    _cachedBaselineMalsRef = m;

    const datasets = [];
    for (let a = 0; a < 8; a++) {
        const baseVal = m.malsBases ? m.malsBases[a] : 0;
        datasets.push({
            type: 'line',
            label: `LS Det ${a+1} (${angleNames[a]}) [Base: ${baseVal.toFixed(4)}V]`,
            data: _cachedBaselinePts[a],
            borderColor: colorsArr[a % colorsArr.length],
            borderWidth: a === 4 ? 2.5 : 1.2,
            pointRadius: 0,
            fill: false,
            tension: 0.05
        });
    }

    const isLight = document.body.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#1e293b' : '#f8fafc';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';

    if (baselineChartInstance) {
        baselineChartInstance.data.datasets = datasets;
        baselineChartInstance.update('none');
        return;
    }

    baselineChartInstance = new Chart(ctx, {
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Elution Volume (mL)', color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Photodiode Raw Voltage (V)', color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: textColor, boxWidth: 8, font: { size: 11 } }
                }
            }
        },
        plugins: [{
            id: 'tareBoxPlugin',
            beforeDraw: (chart) => {
                if (!chart.chartArea || !chart.scales || !chart.scales.x) return;
                const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
                const curStart = _studioBaselineState.start;
                const curEnd = _studioBaselineState.end;
                const minS = curStart < curEnd ? curStart : curEnd;
                const maxS = curStart < curEnd ? curEnd : curStart;
                const startX = x.getPixelForValue(minS);
                const endX = x.getPixelForValue(maxS);
                if (startX < right && endX > left) {
                    const dStart = startX > left ? startX : left;
                    const dEnd = endX < right ? endX : right;
                    ctx.save();
                    ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
                    ctx.fillRect(dStart, top, dEnd - dStart, bottom - top);
                    ctx.strokeStyle = '#6366f1';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash(DASH_PATTERN);
                    ctx.beginPath();
                    ctx.moveTo(dStart, top); ctx.lineTo(dStart, bottom);
                    ctx.moveTo(dEnd, top); ctx.lineTo(dEnd, bottom);
                    ctx.stroke();
                    ctx.setLineDash(EMPTY_DASH);
                    ctx.restore();
                }

                // Post-peak window if Plan 2 or Plan 3
                const planVal = _studioBaselineState.plan;
                if (planVal === 'plan2' || planVal === 'plan3') {
                    const curPStart = _studioBaselineState.postStart;
                    const curPEnd = _studioBaselineState.postEnd;
                    const minP = curPStart < curPEnd ? curPStart : curPEnd;
                    const maxP = curPStart < curPEnd ? curPEnd : curPStart;
                    const pStartX = x.getPixelForValue(minP);
                    const pEndX = x.getPixelForValue(maxP);
                    if (pStartX < right && pEndX > left) {
                        const dpStart = pStartX > left ? pStartX : left;
                        const dpEnd = pEndX < right ? pEndX : right;
                        ctx.save();
                        ctx.fillStyle = 'rgba(251, 113, 133, 0.18)';
                        ctx.fillRect(dpStart, top, dpEnd - dpStart, bottom - top);
                        ctx.strokeStyle = '#fb7185';
                        ctx.lineWidth = 1.5;
                        ctx.setLineDash(DASH_PATTERN);
                        ctx.beginPath();
                        ctx.moveTo(dpStart, top); ctx.lineTo(dpStart, bottom);
                        ctx.moveTo(dpEnd, top); ctx.lineTo(dpEnd, bottom);
                        ctx.stroke();
                        ctx.setLineDash(EMPTY_DASH);
                        ctx.restore();
                    }
                }
            }
        }]
    });
}

function autoDetectSolventBaseline() {
    if (!rawData || !rawData.mals || !rawData.mals.timeMals) {
        showToast("Load a Wyatt MALS run first.", "warning");
        return;
    }
    const studioBaselineStart = document.getElementById('studio-baseline-start');
    const studioBaselineEnd = document.getElementById('studio-baseline-end');
    const studioBaselineStartSlider = document.getElementById('studio-baseline-start-slider');
    const studioBaselineEndSlider = document.getElementById('studio-baseline-end-slider');
    const studioBaseStartVal = document.getElementById('studio-base-start-val');
    const studioBaseEndVal = document.getElementById('studio-base-end-val');

    if (studioBaselineStart) studioBaselineStart.value = "0.5";
    if (studioBaselineEnd) studioBaselineEnd.value = "2.5";
    if (studioBaselineStartSlider) studioBaselineStartSlider.value = "0.5";
    if (studioBaselineEndSlider) studioBaselineEndSlider.value = "2.5";
    if (studioBaseStartVal) studioBaseStartVal.textContent = "0.50 mL";
    if (studioBaseEndVal) studioBaseEndVal.textContent = "2.50 mL";

    const malsBaselineStart = document.getElementById('mals-baseline-start');
    const malsBaselineEnd = document.getElementById('mals-baseline-end');
    if (malsBaselineStart) malsBaselineStart.value = "0.5";
    if (malsBaselineEnd) malsBaselineEnd.value = "2.5";

    _studioBaselineState.start = 0.5;
    _studioBaselineState.end = 2.5;

    recalculateMalsData();
    showToast("Auto-detected pure solvent baseline window (0.50 - 2.50 mL).", "success");
}

function renderFigureEditorChart() {
    const canvas = document.getElementById('figure-editor-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!rawData || !rawData.curves || Object.keys(rawData.curves).length === 0) {
        if (figureEditorChartInstance) {
            figureEditorChartInstance.destroy();
            figureEditorChartInstance = null;
        }
        return;
    }

    applyChartAspectRatio();
    const datasets = buildChartDatasets();
    const hasRightAxis = Object.keys(rawData ? rawData.curves : {}).some(k => {
        const kl = k.toLowerCase();
        return kl.includes('buffer') || kl.includes('%b') || kl.includes('conc b') || kl.includes('cond') || kl.includes('ph');
    });
    const hasMolarMass = showMolarMassOverlay && rawData && rawData.mals && rawData.mals.sliceMw && rawData.mals.sliceMw.length > 0;
    let leftAxisTitle = rawData && rawData.type === 'wyatt_astra' ? 'Light Scattering (V) / Refractive Index (μRIU)' : 'Absorbance (mAU)';

    let yPeakMax = 0;
    if (rawData && rawData.curves) {
        Object.keys(rawData.curves).forEach(name => {
            if (!isSafeKey(name)) return;
            const nl = name.toLowerCase();
            const isSec = nl.includes('buffer') || nl.includes('%b') || nl.includes('cond') || nl.includes('ph');
            if (!isSec && curveVisibility[name] !== false) {
                const arr = rawData.curves[name];
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i].val > yPeakMax) yPeakMax = arr[i].val;
                }
            }
        });
    }
    const ySuggestedMax = (plotSettings.yPrimaryAutoscale && yPeakMax > 0) ? (yPeakMax * 1.15) : undefined;

    const isLight = document.body.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#1e293b' : '#f8fafc';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';

    if (figureEditorChartInstance) {
        figureEditorChartInstance.data.datasets = datasets;
        
        figureEditorChartInstance.options.plugins.title = {
            display: !!plotSettings.title,
            text: plotSettings.title,
            color: textColor,
            font: { family: plotSettings.fontFamily, size: plotSettings.titleFontSize, weight: plotSettings.fontWeight },
            padding: { bottom: 6 }
        };
        figureEditorChartInstance.options.plugins.subtitle = {
            display: !!plotSettings.subtitle,
            text: plotSettings.subtitle,
            color: textColor,
            font: { family: plotSettings.fontFamily, size: plotSettings.subtitleFontSize, weight: '400' },
            padding: { bottom: 10 }
        };
        figureEditorChartInstance.options.plugins.legend.display = plotSettings.legendPosition !== 'hidden';
        figureEditorChartInstance.options.plugins.legend.position = plotSettings.legendPosition === 'hidden' ? 'top' : plotSettings.legendPosition;
        figureEditorChartInstance.options.plugins.legend.align = plotSettings.legendAlign || 'center';
        figureEditorChartInstance.options.plugins.legend.labels.pointStyle = plotSettings.legendPointStyle || 'circle';
        figureEditorChartInstance.options.plugins.legend.labels.font = { family: plotSettings.fontFamily, size: plotSettings.legendFontSize };

        if (figureEditorChartInstance.options.scales.x) {
            figureEditorChartInstance.options.scales.x.title.text = plotSettings.xAxisTitle || 'Elution Volume (mL)';
            figureEditorChartInstance.options.scales.x.title.font = { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight };
            figureEditorChartInstance.options.scales.x.ticks.font = { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize };
        }
        if (figureEditorChartInstance.options.scales.y) {
            figureEditorChartInstance.options.scales.y.title.text = plotSettings.yPrimaryTitle || leftAxisTitle;
            figureEditorChartInstance.options.scales.y.title.font = { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight };
            figureEditorChartInstance.options.scales.y.ticks.font = { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize };
            const safeY = getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax);
            figureEditorChartInstance.options.scales.y.min = safeY.min;
            figureEditorChartInstance.options.scales.y.max = safeY.max;
        }
        if (figureEditorChartInstance.options.scales.yBuffer) {
            figureEditorChartInstance.options.scales.yBuffer.display = hasRightAxis;
            figureEditorChartInstance.options.scales.yBuffer.title.text = plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)';
            figureEditorChartInstance.options.scales.yBuffer.title.font = { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight };
            figureEditorChartInstance.options.scales.yBuffer.ticks.font = { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize };
            const safeYBuffer = getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined);
            figureEditorChartInstance.options.scales.yBuffer.min = safeYBuffer.min;
            figureEditorChartInstance.options.scales.yBuffer.max = safeYBuffer.max;
        }
        if (figureEditorChartInstance.options.scales.yMolarMass) {
            figureEditorChartInstance.options.scales.yMolarMass.display = hasMolarMass;
            figureEditorChartInstance.options.scales.yMolarMass.title.text = plotSettings.yMolarMassTitle || 'Molar Mass (kDa)';
            figureEditorChartInstance.options.scales.yMolarMass.title.font = { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight };
            figureEditorChartInstance.options.scales.yMolarMass.ticks.font = { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize };
        }

        figureEditorChartInstance.update('none');
        return;
    }

    figureEditorChartInstance = new Chart(ctx, {
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: { display: true, text: plotSettings.xAxisTitle || 'Elution Volume (mL)', color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight } },
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    min: getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax).min,
                    max: getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, ySuggestedMax).max,
                    title: { display: true, text: plotSettings.yPrimaryTitle || leftAxisTitle, color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight } },
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                yBuffer: {
                    type: 'linear',
                    position: 'right',
                    display: hasRightAxis,
                    min: getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined).min,
                    max: getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined).max,
                    title: { display: hasRightAxis, text: plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)', color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight } },
                    grid: { drawOnChartArea: false },
                    ticks: { color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize } }
                },
                yMolarMass: {
                    type: 'logarithmic',
                    position: 'right',
                    display: hasMolarMass,
                    min: 1,
                    max: 10000,
                    title: { display: hasMolarMass, text: plotSettings.yMolarMassTitle || 'Molar Mass (kDa)', color: '#e879f9', font: { family: plotSettings.fontFamily, size: plotSettings.axisTitleFontSize, weight: plotSettings.fontWeight } },
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#e879f9',
                        font: { family: plotSettings.fontFamily, size: plotSettings.ticksFontSize },
                        callback: function(val) {
                            if (val === 1 || val === 10 || val === 100 || val === 1000 || val === 10000) return val + ' kDa';
                            return null;
                        }
                    }
                }
            },
            plugins: {
                title: { display: !!plotSettings.title, text: plotSettings.title, color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.titleFontSize, weight: plotSettings.fontWeight }, padding: { bottom: 6 } },
                subtitle: { display: !!plotSettings.subtitle, text: plotSettings.subtitle, color: textColor, font: { family: plotSettings.fontFamily, size: plotSettings.subtitleFontSize, weight: '400' }, padding: { bottom: 10 } },
                legend: {
                    display: plotSettings.legendPosition !== 'hidden',
                    position: plotSettings.legendPosition === 'hidden' ? 'top' : plotSettings.legendPosition,
                    align: plotSettings.legendAlign || 'center',
                    labels: { color: textColor, usePointStyle: true, pointStyle: plotSettings.legendPointStyle || 'circle', boxWidth: 8, font: { family: plotSettings.fontFamily, size: plotSettings.legendFontSize } }
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'ctrl',
                        onPanComplete: () => {
                            setResetZoomButtonsDisabled(false);
                        }
                    },
                    zoom: {
                        wheel: { enabled: true },
                        drag: { enabled: true, backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: '#38bdf8', borderWidth: 1 },
                        pinch: { enabled: true },
                        mode: 'x',
                        onZoomComplete: () => {
                            setResetZoomButtonsDisabled(false);
                        }
                    }
                }
            }
        }
    });
}

function switchView(viewName) {
    const VALID_VIEWS = ['baseline-studio', 'main-workspace', 'figure-editor'];
    if (!viewName || !VALID_VIEWS.includes(viewName) || currentView === viewName) return;
    currentView = viewName;
    
    // Update header switcher buttons
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
        const v = btn.getAttribute('data-view');
        btn.classList.toggle('active', v === viewName);
    });

    // Update app views with class toggles and display isolation
    const views = [
        { el: document.getElementById('view-baseline-studio'), name: 'baseline-studio' },
        { el: document.getElementById('view-main-workspace'), name: 'main-workspace' },
        { el: document.getElementById('view-figure-editor'), name: 'figure-editor' }
    ];

    views.forEach(({ el, name }) => {
        if (el) {
            const isActive = (name === viewName);
            el.classList.toggle('active', isActive);
            if (isActive) {
                el.style.removeProperty('display');
            } else {
                el.style.display = 'none';
            }
        }
    });

    const activeViewEl = document.getElementById(`view-${viewName}`);
    if (activeViewEl && typeof lucide !== 'undefined') {
        lucide.createIcons({ root: activeViewEl });
    }

    // Hardware-accelerated rAF rendering & resizing for the newly active canvas without layout thrashing
    requestAnimationFrame(() => {
        if (viewName === 'main-workspace') {
            renderChart(true);
        } else if (viewName === 'baseline-studio') {
            syncBaselineStudioUI();
            renderBaselinePreviewChart();
        } else if (viewName === 'figure-editor') {
            syncSplitEditorUI();
            renderFigureEditorChart();
        }
    });
}
window.switchView = switchView;

function resetPlotEditorSettings() {
    plotSettings = {
        title: '',
        subtitle: '',
        xAxisTitle: 'Elution Volume (mL)',
        yPrimaryTitle: '',
        ySecondaryTitle: 'Secondary Curves (%B / Cond)',
        yMolarMassTitle: 'Molar Mass (kDa)',
        fontFamily: 'Plus Jakarta Sans',
        titleFontSize: 16,
        subtitleFontSize: 12,
        axisTitleFontSize: 12,
        ticksFontSize: 11,
        legendFontSize: 12,
        fontWeight: '600',
        legendPosition: 'top',
        legendAlign: 'center',
        legendPointStyle: 'circle',
        aspectRatioPreset: 'responsive',
        customWidth: 900,
        customHeight: 500,
        exportDpi: 300,
        exportFormat: 'png',
        exportBg: 'publication',
        aliases: Object.create(null),
        yPrimaryAutoscale: true,
        yPrimaryMin: null,
        yPrimaryMax: null,
        ySecondaryMin: null,
        ySecondaryMax: null
    };
    syncPlotEditorUI();
    syncSplitEditorUI();
    queueChartRender(true);
    showToast("Plot settings reset to default.", "info");
}

// ==========================================================================
// High-DPI Publication Export Engine (300/600 DPI, PNG, SVG, PDF)
// ==========================================================================

function exportSvgFigure(bgStyle = 'publication') {
    if ((!chartInstance && !figureEditorChartInstance) || !rawData) {
        showToast("No active chart to export.", "warning");
        return;
    }

    try {
        const isV3 = (currentView === 'figure-editor');
        const preferredId = isV3 ? 'figure-editor-chart' : 'chromatogram-chart';

        if (isV3 && (!figureEditorChartInstance || !document.getElementById('figure-editor-chart')?.width)) {
            renderFigureEditorChart();
        } else if (!isV3 && (!chartInstance || !document.getElementById('chromatogram-chart')?.width)) {
            renderChart(false);
        }

        let canvas = document.getElementById(preferredId);
        if (!canvas || canvas.width === 0) {
            canvas = document.getElementById('chromatogram-chart') || document.getElementById('figure-editor-chart');
        }
        if (!canvas || canvas.width === 0) {
            showToast("Chart canvas not found or not rendered.", "error");
            return;
        }
        const width = canvas.width || 900;
        const height = canvas.height || 500;

        let svg = `<?xml version="1.0" standalone="no"?>\n`;
        svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
        
        if (bgStyle === 'publication') {
            svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>\n`;
        } else if (bgStyle === 'theme') {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            svg += `<rect width="${width}" height="${height}" fill="${isLight ? '#ffffff' : '#0f172a'}"/>\n`;
        }

        const dataUrl = canvas.toDataURL('image/png');
        svg += `<image href="${dataUrl}" width="${width}" height="${height}"/>\n`;
        svg += `</svg>`;

        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeBase = sanitizeFilename(plotSettings.title, 'SEC_MALS_Plot');
        link.download = `${safeBase}_Vector.svg`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Plot exported as SVG Vector!", "success");
    } catch (err) {
        console.error("SVG Export error:", err);
        showToast(`SVG Export failed: ${err.message}`, "error");
    }
}

function exportPdfFromCanvas(canvas) {
    if (!canvas) {
        showToast("Canvas not found for PDF generation.", "error");
        return;
    }
    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) {
            showToast("Invalid canvas data URL generated for PDF.", "error");
            return;
        }
        const safeTitle = escapeHtml(plotSettings.title || 'SEC-MALS Publication Figure');
        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${safeTitle}</title>
                    <style>
                        body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fff; }
                        img { max-width: 100%; max-height: 100%; object-fit: contain; }
                        @page { size: landscape; margin: 0.5cm; }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" onload="window.print(); window.close();" />
                </body>
                </html>
            `);
            printWin.document.close();
            showToast("PDF Print dialog opened!", "success");
        } else {
            const safeBase = sanitizeFilename(plotSettings.title, 'SEC_MALS_Figure');
            const link = document.createElement('a');
            link.download = `${safeBase}_${plotSettings.exportDpi || 300}DPI.jpg`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("Figure image downloaded (popup was blocked)!", "info");
        }
    } catch (err) {
        console.error("PDF export error:", err);
        showToast(`PDF export failed: ${err.message}`, "error");
    }
}

function exportPublicationFigure(dpi = 300, format = 'png', bgStyle = 'publication') {
    if ((!chartInstance && !figureEditorChartInstance) || !rawData) {
        showToast("No active chart to export.", "warning");
        return;
    }

    if (format === 'svg') {
        exportSvgFigure(bgStyle);
        return;
    }

    try {
        const isV3 = (currentView === 'figure-editor');
        const preferredId = isV3 ? 'figure-editor-chart' : 'chromatogram-chart';

        if (isV3 && (!figureEditorChartInstance || !document.getElementById('figure-editor-chart')?.width)) {
            renderFigureEditorChart();
        } else if (!isV3 && (!chartInstance || !document.getElementById('chromatogram-chart')?.width)) {
            renderChart(false);
        }

        let srcCanvas = document.getElementById(preferredId);
        if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) {
            srcCanvas = document.getElementById('chromatogram-chart') || document.getElementById('figure-editor-chart');
        }
        if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) {
            showToast("Chart canvas is not rendered yet.", "warning");
            return;
        }

        const safeDpi = (typeof dpi === 'number' && dpi > 0) ? dpi : 300;
        const scaleFactor = safeDpi / 96.0;
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = Math.round(srcCanvas.width * scaleFactor);
        exportCanvas.height = Math.round(srcCanvas.height * scaleFactor);
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) {
            showToast("Could not obtain canvas 2D rendering context.", "error");
            return;
        }

        ctx.scale(scaleFactor, scaleFactor);

        if (bgStyle === 'publication') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
        } else if (bgStyle === 'theme') {
            const isLight = document.body.getAttribute('data-theme') === 'light';
            ctx.fillStyle = isLight ? '#ffffff' : '#0f172a';
            ctx.fillRect(0, 0, srcCanvas.width, srcCanvas.height);
        }

        ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height);

        if (format === 'pdf') {
            exportPdfFromCanvas(exportCanvas);
            return;
        }

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const link = document.createElement('a');
        const safeBase = sanitizeFilename(plotSettings.title, 'SEC_MALS_Figure');
        link.download = `${safeBase}_${safeDpi}DPI.${format}`;
        link.href = exportCanvas.toDataURL(mimeType, 0.95);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Exported ${safeDpi} DPI ${format.toUpperCase()} successfully!`, "success");
    } catch (err) {
        console.error("Export publication figure error:", err);
        showToast(`Export failed: ${err.message}`, "error");
    }
}

// ==========================================================================
// File Ingestion & Orchestration (Standalone or Base Run)
// ==========================================================================

async function handleFile(file) {
    if (!file) return;
    
    showToast(`Loading ${file.name}...`, "info");
    
    try {
        const isAstra = file.name.endsWith('.afe7') || file.name.endsWith('.afs7');
        const arrayBuf = await file.arrayBuffer();
        
        if (isAstra) {
            rawData = await parseWyattAstraFile(arrayBuf, file.name);
        } else {
            const text = decodeTextBuffer(arrayBuf);
            if (isWyattAstraCSV(text)) {
                rawData = parseWyattAstraCSV(text, file.name);
            } else {
                rawData = parseUniversalCSV(text);
            }
        }

        peaks = [];
        activeOverlays = [];
        nextPeakId = 1;
        currentSelection = { start: null, end: null };
        clearScaledLsCache();
        decimatedCurves = Object.create(null);
        Object.keys(rawData.curves).forEach(k => {
            if (isSafeKey(k)) {
                decimatedCurves[k] = decimateCurve(rawData.curves[k], 3000);
            }
        });

        updateInjectionDropdown();
        buildCurvesControlPanel();
        populateEditorAliasesTable();

        if (welcomeView) welcomeView.style.display = 'none';
        if (analysisWorkspace) analysisWorkspace.style.display = 'block';
        if (peaksContainer) peaksContainer.style.display = 'block';
        
        if (loadedFileName) {
            loadedFileName.textContent = rawData.metadata ? rawData.metadata.sampleName : file.name;
        }
        if (loadedFileInfo) {
            const numCurves = Object.keys(rawData.curves).length;
            const ptsCount = Object.values(rawData.curves)[0] ? Object.values(rawData.curves)[0].length : 0;
            let infoText = `${numCurves} curves • ${ptsCount} points per curve`;
            if (rawData.fractions && rawData.fractions.length > 0) {
                infoText += ` • ${rawData.fractions.length} fractions`;
            }
            if (rawData.injections && rawData.injections.length > 0) {
                infoText += ` • ${rawData.injections.length} injections`;
            }
            if (rawData.metadata && rawData.metadata.flowRate) {
                const safeFlow = parseFloat(rawData.metadata.flowRate);
                if (!isNaN(safeFlow) && isFinite(safeFlow) && safeFlow > 0) {
                    infoText += ` • Flow: ${safeFlow} mL/min`;
                }
            }
            if (rawData.metadata && rawData.metadata.laserWavelength) {
                const safeWave = parseFloat(rawData.metadata.laserWavelength);
                if (!isNaN(safeWave) && isFinite(safeWave) && safeWave > 0) {
                    infoText += ` • Laser: ${safeWave} nm`;
                }
            }
            loadedFileInfo.textContent = infoText;
        }

        initialBaseMw = null;
        [addPeakBtn, exportChartBtn, chartExportBtn, autoFitMwBtn, sidebarAutoFitBtn, chartAutoFitBtn, tableAutoFitBtn, openPlotEditorBtn, chartPlotEditorBtn].forEach(b => {
            if (b) b.disabled = false;
        });
        setResetZoomButtonsDisabled(true);
        setChartInteractionMode('zoom');

        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        if (baselineChartInstance) {
            baselineChartInstance.destroy();
            baselineChartInstance = null;
        }
        if (figureEditorChartInstance) {
            figureEditorChartInstance.destroy();
            figureEditorChartInstance = null;
        }
        updatePeaksTable();
        syncBaselineStudioUI();
        syncSplitEditorUI();
        if (currentView === 'baseline-studio') {
            renderBaselinePreviewChart();
        } else if (currentView === 'figure-editor') {
            renderFigureEditorChart();
        } else {
            renderChart(false);
        }

        showToast(`Successfully loaded ${file.name}! Click any peak on the chart or use Auto-Fit MW.`, "success");
    } catch (err) {
        console.error("File loading error:", err);
        showToast(err.message, "error");
    }
}

// ==========================================================================
// Event Handlers & Modal Setup
// ==========================================================================

function setupEventListeners() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
    }
    
    // Window-Level Drag & Drop Suppression (Prevents browser from navigating/opening dropped files)
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    }, false);

    window.addEventListener('drop', (e) => {
        e.preventDefault();
    }, false);

    // Press Escape to cancel peak selection, close modals, or close open dropdowns
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.style.display = 'none';
            });
            if (guidesDropdownMenu && guidesDropdownMenu.classList.contains('show')) {
                guidesDropdownMenu.classList.remove('show');
                if (guidesDropdownBtn) guidesDropdownBtn.setAttribute('aria-expanded', 'false');
                if (guidesDropdown) guidesDropdown.classList.remove('open');
            }
            if (currentSelection.start !== null) {
                currentSelection.start = null;
                currentSelection.end = null;
                if (clickInstructions) {
                    clickInstructions.innerHTML = `<i data-lucide="mouse-pointer" style="width:12px; height:12px; vertical-align:middle;"></i> <strong>Click chart twice</strong> to select peak boundaries &bull; Hold <strong>Ctrl + Drag</strong> to pan`;
                    if (typeof lucide !== 'undefined') lucide.createIcons({ root: clickInstructions });
                }
                if (chartInstance) chartInstance.update('none');
                showToast("Peak selection cancelled.", "info");
            }
        }
    });

    // Modal Overlay Backdrop Click Listeners
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover', 'drag-over');
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!dropZone.classList.contains('dragover')) {
                dropZone.classList.add('dragover', 'drag-over');
            }
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover', 'drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover', 'drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
                fileInput.value = '';
            }
        });
    }

    if (overlayWyattInput) {
        overlayWyattInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleOverlayFile(e.target.files[0]);
                overlayWyattInput.value = '';
            }
        });
    }

    // Main Chromatogram Chart Canvas Direct Click Listener
    const mainCanvas = document.getElementById('chromatogram-chart');
    if (mainCanvas) {
        mainCanvas.addEventListener('click', (e) => {
            if (!chartInstance || !rawData) return;
            if (e.ctrlKey || e.shiftKey || e.altKey) return;
            handleChartClick({ native: e });
        });
    }

    // Auto-Fit MW Buttons
    [autoFitMwBtn, sidebarAutoFitBtn, chartAutoFitBtn, tableAutoFitBtn].forEach(btn => {
        if (btn) btn.addEventListener('click', autoFitStandardMolarMass);
    });

    // Monochromatic LS Detectors Mode
    if (toggleMonoLs) {
        toggleMonoLs.addEventListener('change', () => {
            monoLsEnabled = toggleMonoLs.checked;
            if (monoLsColorContainer) {
                monoLsColorContainer.style.display = monoLsEnabled ? 'flex' : 'none';
            }
            if (monoLsEnabled) applyMonoLsColors();
            queueChartRender(true);
        });
    }

    if (colorMonoLs) {
        colorMonoLs.addEventListener('input', () => {
            monoLsBaseColor = colorMonoLs.value;
            if (valMonoLs) valMonoLs.textContent = colorMonoLs.value.toUpperCase();
            if (monoLsEnabled) {
                applyMonoLsColors();
                queueChartRender(true);
            }
        });
    }

    // Modal Tabs Generic Handler
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            const modal = btn.closest('.modal-overlay') || btn.closest('.modal-card') || btn.closest('.modal-backdrop');
            if (!modal || !tabId) return;

            modal.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            modal.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = modal.querySelector(`#${tabId}`);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    // Contextual Biophysical Guide Triggers
    document.querySelectorAll('.guide-trigger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const guideTab = btn.getAttribute('data-guide-tab');
            if (biophysicalGuideModal) {
                biophysicalGuideModal.style.display = 'flex';
                if (guideTab) {
                    const targetTab = guideTab.startsWith('guide-tab-') ? guideTab : `guide-tab-${guideTab}`;
                    const tabBtn = biophysicalGuideModal.querySelector(`.modal-tab-btn[data-tab="${targetTab}"]`) || biophysicalGuideModal.querySelector(`.modal-tab-btn[data-tab="${guideTab}"]`);
                    if (tabBtn) tabBtn.click();
                }
            }
        });
    });

    // Biophysical Guide Modal Open/Close
    if (biophysicalGuideBtn) biophysicalGuideBtn.addEventListener('click', () => { if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'flex'; });
    if (closeBiophysicalModal) closeBiophysicalModal.addEventListener('click', () => { if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'none'; });
    if (closeBiophysicalBtn) closeBiophysicalBtn.addEventListener('click', () => { if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'none'; });

    // Plot Editor Modal & View 3 Redirection
    const openEditor = () => {
        if (!rawData) {
            showToast("Please load a dataset to open the Figure Editor.", "warning");
            return;
        }
        switchView('figure-editor');
    };

    if (openPlotEditorBtn) openPlotEditorBtn.addEventListener('click', openEditor);
    if (chartPlotEditorBtn) chartPlotEditorBtn.addEventListener('click', openEditor);
    if (closePlotEditorModal) closePlotEditorModal.addEventListener('click', () => { if (plotEditorModal) plotEditorModal.style.display = 'none'; });
    if (closePlotEditorBtn) closePlotEditorBtn.addEventListener('click', () => { if (plotEditorModal) plotEditorModal.style.display = 'none'; });
    if (resetPlotSettingsBtn) resetPlotSettingsBtn.addEventListener('click', resetPlotEditorSettings);

    if (plotEditorDownloadBtn) {
        plotEditorDownloadBtn.addEventListener('click', () => {
            const dpi = parseInt(plotExportDpi ? plotExportDpi.value : 300) || 300;
            const format = plotExportFormat ? plotExportFormat.value : 'png';
            const bg = plotExportBg ? plotExportBg.value : 'publication';
            exportPublicationFigure(dpi, format, bg);
        });
    }

    // Debounce helpers for high-frequency input handlers
    let _rafMalsId = null;
    function queueRecalculateMals() {
        if (_rafMalsId !== null) return;
        _rafMalsId = requestAnimationFrame(() => {
            _rafMalsId = null;
            recalculateMalsData();
        });
    }

    let _rafOverlayId = null;
    function queueApplyOverlayShifts() {
        if (_rafOverlayId !== null) return;
        _rafOverlayId = requestAnimationFrame(() => {
            _rafOverlayId = null;
            applyOverlayShifts();
        });
    }

    let _rafStoichId = null;
    function queueStoichiometryUpdate() {
        if (_rafStoichId !== null) return;
        _rafStoichId = requestAnimationFrame(() => {
            _rafStoichId = null;
            peaks.forEach(pk => {
                pk.stoich = predictStoichiometry(pk.mwKda);
            });
            updatePeaksTable();
        });
    }

    // High-performance 60fps title & label update pipeline (avoids dataset rebuilding)
    let _rafFigureEditorMetadataId = null;

    function queueFigureEditorMetadataUpdate() {
        if (_rafFigureEditorMetadataId !== null) return;
        _rafFigureEditorMetadataId = requestAnimationFrame(() => {
            _rafFigureEditorMetadataId = null;
            updateActiveChartMetadata();
        });
    }

    function updateActiveChartMetadata() {
        const isLight = document.body.getAttribute('data-theme') === 'light';
        const textColor = isLight ? '#1e293b' : '#f8fafc';

        const targetCharts = [figureEditorChartInstance, chartInstance];
        for (let idx = 0; idx < targetCharts.length; idx++) {
            const chart = targetCharts[idx];
            if (!chart || !chart.options) continue;
            const opts = chart.options;
            if (opts.plugins) {
                if (opts.plugins.title) {
                    opts.plugins.title.display = !!plotSettings.title;
                    opts.plugins.title.text = plotSettings.title;
                    opts.plugins.title.color = textColor;
                    if (opts.plugins.title.font) {
                        opts.plugins.title.font.family = plotSettings.fontFamily;
                        opts.plugins.title.font.size = plotSettings.titleFontSize;
                        opts.plugins.title.font.weight = plotSettings.fontWeight;
                    }
                }
                if (opts.plugins.subtitle) {
                    opts.plugins.subtitle.display = !!plotSettings.subtitle;
                    opts.plugins.subtitle.text = plotSettings.subtitle;
                    opts.plugins.subtitle.color = textColor;
                    if (opts.plugins.subtitle.font) {
                        opts.plugins.subtitle.font.family = plotSettings.fontFamily;
                        opts.plugins.subtitle.font.size = plotSettings.subtitleFontSize;
                    }
                }
                if (opts.plugins.legend) {
                    opts.plugins.legend.display = plotSettings.legendPosition !== 'hidden';
                    opts.plugins.legend.position = plotSettings.legendPosition === 'hidden' ? 'top' : plotSettings.legendPosition;
                    opts.plugins.legend.align = plotSettings.legendAlign || 'center';
                    if (opts.plugins.legend.labels) {
                        opts.plugins.legend.labels.pointStyle = plotSettings.legendPointStyle || 'circle';
                        if (opts.plugins.legend.labels.font) {
                            opts.plugins.legend.labels.font.family = plotSettings.fontFamily;
                            opts.plugins.legend.labels.font.size = plotSettings.legendFontSize;
                        }
                    }
                }
            }
            if (opts.scales) {
                if (opts.scales.x && opts.scales.x.title) {
                    opts.scales.x.title.text = plotSettings.xAxisTitle || 'Elution Volume (mL)';
                    if (opts.scales.x.title.font) {
                        opts.scales.x.title.font.family = plotSettings.fontFamily;
                        opts.scales.x.title.font.size = plotSettings.axisTitleFontSize;
                        opts.scales.x.title.font.weight = plotSettings.fontWeight;
                    }
                    if (opts.scales.x.ticks && opts.scales.x.ticks.font) {
                        opts.scales.x.ticks.font.family = plotSettings.fontFamily;
                        opts.scales.x.ticks.font.size = plotSettings.ticksFontSize;
                    }
                }
                if (opts.scales.y && opts.scales.y.title) {
                    opts.scales.y.title.text = plotSettings.yPrimaryTitle || (rawData && rawData.type === 'wyatt_astra' ? 'Light Scattering (V) / Refractive Index (μRIU)' : 'Absorbance (mAU)');
                    if (opts.scales.y.title.font) {
                        opts.scales.y.title.font.family = plotSettings.fontFamily;
                        opts.scales.y.title.font.size = plotSettings.axisTitleFontSize;
                        opts.scales.y.title.font.weight = plotSettings.fontWeight;
                    }
                    if (opts.scales.y.ticks && opts.scales.y.ticks.font) {
                        opts.scales.y.ticks.font.family = plotSettings.fontFamily;
                        opts.scales.y.ticks.font.size = plotSettings.ticksFontSize;
                    }
                    const safeY = getSafeYAxisBounds(plotSettings.yPrimaryMin, plotSettings.yPrimaryMax, undefined);
                    opts.scales.y.min = safeY.min;
                    opts.scales.y.max = safeY.max;
                }
                if (opts.scales.yBuffer && opts.scales.yBuffer.title) {
                    opts.scales.yBuffer.title.text = plotSettings.ySecondaryTitle || 'Secondary Curves (%B / Cond)';
                    if (opts.scales.yBuffer.title.font) {
                        opts.scales.yBuffer.title.font.family = plotSettings.fontFamily;
                        opts.scales.yBuffer.title.font.size = plotSettings.axisTitleFontSize;
                        opts.scales.yBuffer.title.font.weight = plotSettings.fontWeight;
                    }
                    if (opts.scales.yBuffer.ticks && opts.scales.yBuffer.ticks.font) {
                        opts.scales.yBuffer.ticks.font.family = plotSettings.fontFamily;
                        opts.scales.yBuffer.ticks.font.size = plotSettings.ticksFontSize;
                    }
                    const safeYBuffer = getSafeYAxisBounds(plotSettings.ySecondaryMin, plotSettings.ySecondaryMax, undefined);
                    opts.scales.yBuffer.min = safeYBuffer.min;
                    opts.scales.yBuffer.max = safeYBuffer.max;
                }
                if (opts.scales.yMolarMass && opts.scales.yMolarMass.title) {
                    opts.scales.yMolarMass.title.text = plotSettings.yMolarMassTitle || 'Molar Mass (kDa)';
                    if (opts.scales.yMolarMass.title.font) {
                        opts.scales.yMolarMass.title.font.family = plotSettings.fontFamily;
                        opts.scales.yMolarMass.title.font.size = plotSettings.axisTitleFontSize;
                        opts.scales.yMolarMass.title.font.weight = plotSettings.fontWeight;
                    }
                    if (opts.scales.yMolarMass.ticks && opts.scales.yMolarMass.ticks.font) {
                        opts.scales.yMolarMass.ticks.font.family = plotSettings.fontFamily;
                        opts.scales.yMolarMass.ticks.font.size = plotSettings.ticksFontSize;
                    }
                }
            }
            chart.update('none');
        }
    }

    // Live sync for Plot Editor form inputs (Batched via lightweight 60fps Metadata Update)
    if (plotTitleInput) plotTitleInput.addEventListener('input', () => { plotSettings.title = plotTitleInput.value; queueFigureEditorMetadataUpdate(); });
    if (plotSubtitleInput) plotSubtitleInput.addEventListener('input', () => { plotSettings.subtitle = plotSubtitleInput.value; queueFigureEditorMetadataUpdate(); });
    if (plotXAxisTitle) plotXAxisTitle.addEventListener('input', () => { plotSettings.xAxisTitle = plotXAxisTitle.value; queueFigureEditorMetadataUpdate(); });
    if (plotYPrimaryTitle) plotYPrimaryTitle.addEventListener('input', () => { plotSettings.yPrimaryTitle = plotYPrimaryTitle.value; queueFigureEditorMetadataUpdate(); });
    if (plotYSecondaryTitle) plotYSecondaryTitle.addEventListener('input', () => { plotSettings.ySecondaryTitle = plotYSecondaryTitle.value; queueFigureEditorMetadataUpdate(); });
    if (plotYMolarMassTitle) plotYMolarMassTitle.addEventListener('input', () => { plotSettings.yMolarMassTitle = plotYMolarMassTitle.value; queueFigureEditorMetadataUpdate(); });
    if (plotFontFamily) plotFontFamily.addEventListener('change', () => { plotSettings.fontFamily = plotFontFamily.value; queueFigureEditorMetadataUpdate(); });
    if (plotFontWeight) plotFontWeight.addEventListener('change', () => { plotSettings.fontWeight = plotFontWeight.value; queueFigureEditorMetadataUpdate(); });
    if (plotTitleSize) plotTitleSize.addEventListener('input', () => { plotSettings.titleFontSize = parseInt(plotTitleSize.value) || 16; queueFigureEditorMetadataUpdate(); });
    if (plotAxisSize) plotAxisSize.addEventListener('input', () => { plotSettings.axisTitleFontSize = parseInt(plotAxisSize.value) || 12; queueFigureEditorMetadataUpdate(); });
    if (plotTicksSize) plotTicksSize.addEventListener('input', () => { plotSettings.ticksFontSize = parseInt(plotTicksSize.value) || 11; queueFigureEditorMetadataUpdate(); });
    if (plotLegendSize) plotLegendSize.addEventListener('input', () => { plotSettings.legendFontSize = parseInt(plotLegendSize.value) || 12; queueFigureEditorMetadataUpdate(); });
    if (plotLegendPos) plotLegendPos.addEventListener('change', () => { plotSettings.legendPosition = plotLegendPos.value; queueFigureEditorMetadataUpdate(); });
    if (plotLegendAlign) plotLegendAlign.addEventListener('change', () => { plotSettings.legendAlign = plotLegendAlign.value; queueFigureEditorMetadataUpdate(); });
    if (plotPointStyle) plotPointStyle.addEventListener('change', () => { plotSettings.legendPointStyle = plotPointStyle.value; queueFigureEditorMetadataUpdate(); });

    if (plotAspectPreset) {
        plotAspectPreset.addEventListener('change', () => {
            plotSettings.aspectRatioPreset = plotAspectPreset.value;
            if (customDimsRow) customDimsRow.style.display = plotAspectPreset.value === 'custom' ? 'grid' : 'none';
            applyChartAspectRatio();
            queueChartRender(true);
        });
    }

    if (plotCustomW) {
        plotCustomW.addEventListener('input', () => {
            plotSettings.customWidth = parseInt(plotCustomW.value) || 900;
            if (plotSettings.aspectRatioPreset === 'custom') {
                applyChartAspectRatio();
                queueChartRender(true);
            }
        });
    }

    if (plotCustomH) {
        plotCustomH.addEventListener('input', () => {
            plotSettings.customHeight = parseInt(plotCustomH.value) || 500;
            if (plotSettings.aspectRatioPreset === 'custom') {
                applyChartAspectRatio();
                queueChartRender(true);
            }
        });
    }

    // Injection selector dropdown change
    if (selectAktaInjection) {
        selectAktaInjection.addEventListener('change', () => {
            const injMl = parseFloat(selectAktaInjection.value) || 0.0;
            if (alignInjVol) alignInjVol.value = injMl.toFixed(2);
            applyOverlayShifts();
            showToast(`Shifted Wyatt overlay to Injection at ${injMl.toFixed(2)} mL.`, "info");
        });
    }

    // Direct offset input with RAF batching
    if (alignInjVol) alignInjVol.addEventListener('input', queueApplyOverlayShifts);
    if (alignTubingDelay) alignTubingDelay.addEventListener('input', queueApplyOverlayShifts);

    // Nudge Left / Right Buttons
    if (nudgeLeftBtn) {
        nudgeLeftBtn.addEventListener('click', () => {
            const cur = parseFloat(alignInjVol.value) || 0.0;
            alignInjVol.value = Math.max(0, cur - 0.2).toFixed(2);
            applyOverlayShifts();
        });
    }
    if (nudgeRightBtn) {
        nudgeRightBtn.addEventListener('click', () => {
            const cur = parseFloat(alignInjVol.value) || 0.0;
            alignInjVol.value = (cur + 0.2).toFixed(2);
            applyOverlayShifts();
        });
    }

    // Auto-Align Peak Button
    if (autoAlignPeakBtn) autoAlignPeakBtn.addEventListener('click', autoAlignToNearestPeak);

    if (toggleFractions) {
        toggleFractions.addEventListener('change', () => {
            showFractions = toggleFractions.checked;
            queueChartRender(true);
        });
    }
    
    if (toggleDecimation) {
        toggleDecimation.addEventListener('change', () => {
            queueChartRender(true);
        });
    }

    if (toggleMolarMass) {
        toggleMolarMass.addEventListener('change', () => {
            showMolarMassOverlay = toggleMolarMass.checked;
            queueChartRender(true);
        });
    }

    if (colorPeakInput) colorPeakInput.addEventListener('input', syncPeakColor);

    const triggerResetZoom = () => {
        if (chartInstance) {
            chartInstance.resetZoom();
        }
        if (figureEditorChartInstance) {
            figureEditorChartInstance.resetZoom();
        }
        setResetZoomButtonsDisabled(true);
    };

    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', triggerResetZoom);
    }
    if (chartResetZoomBtn) {
        chartResetZoomBtn.addEventListener('click', triggerResetZoom);
    }

    // Chart Interaction Mode (Box Zoom vs Select Peak)
    const modeZoomBtn = document.getElementById('chart-mode-zoom-btn');
    const modePeakBtn = document.getElementById('chart-mode-peak-btn');
    if (modeZoomBtn) {
        modeZoomBtn.addEventListener('click', () => setChartInteractionMode('zoom'));
    }
    if (modePeakBtn) {
        modePeakBtn.addEventListener('click', () => setChartInteractionMode('peak'));
    }

    // Auto-switch to Peak mode when clicking on peak inputs
    if (peakStartInput) {
        peakStartInput.addEventListener('focus', () => setChartInteractionMode('peak'));
    }
    if (peakEndInput) {
        peakEndInput.addEventListener('focus', () => setChartInteractionMode('peak'));
    }

    // Double-click to reset zoom on chart canvases
    if (mainCanvas) {
        mainCanvas.addEventListener('dblclick', triggerResetZoom);
    }
    const v3Canvas = document.getElementById('figure-editor-chart');
    if (v3Canvas) {
        v3Canvas.addEventListener('dblclick', triggerResetZoom);
    }

    // Interactive mouse drag on Baseline Preview Chart to set tare window
    const baselineCanvas = document.getElementById('baseline-preview-chart');
    let _isDraggingStudioTare = false;
    let _tareDragStartMl = null;

    if (baselineCanvas) {
        baselineCanvas.style.cursor = 'col-resize';

        baselineCanvas.addEventListener('mousedown', (e) => {
            if (!baselineChartInstance || !baselineChartInstance.chartArea || !baselineChartInstance.scales.x) return;
            const rect = baselineCanvas.getBoundingClientRect();
            const xPix = e.clientX - rect.left;
            const chartArea = baselineChartInstance.chartArea;
            if (xPix < chartArea.left || xPix > chartArea.right) return;
            _isDraggingStudioTare = true;
            _tareDragStartMl = baselineChartInstance.scales.x.getValueForPixel(xPix);
        });

        baselineCanvas.addEventListener('mousemove', (e) => {
            if (!_isDraggingStudioTare || !baselineChartInstance || _tareDragStartMl === null) return;
            const rect = baselineCanvas.getBoundingClientRect();
            const xPix = e.clientX - rect.left;
            const valX = baselineChartInstance.scales.x.getValueForPixel(xPix);
            const startMl = Math.round(Math.min(_tareDragStartMl, valX) * 100) / 100;
            const endMl = Math.round(Math.max(_tareDragStartMl, valX) * 100) / 100;
            _studioBaselineState.start = startMl;
            _studioBaselineState.end = endMl;

            if (studioBaselineStart) studioBaselineStart.value = startMl.toFixed(2);
            if (studioBaselineEnd) studioBaselineEnd.value = endMl.toFixed(2);
            if (studioBaselineStartSlider) studioBaselineStartSlider.value = startMl;
            if (studioBaselineEndSlider) studioBaselineEndSlider.value = endMl;
            if (studioBaseStartVal) studioBaseStartVal.textContent = `${startMl.toFixed(2)} mL`;
            if (studioBaseEndVal) studioBaseEndVal.textContent = `${endMl.toFixed(2)} mL`;

            baselineChartInstance.update('none');
        });

        const handleTareDragEnd = () => {
            if (_isDraggingStudioTare) {
                _isDraggingStudioTare = false;
                _tareDragStartMl = null;
                if (Math.abs(_studioBaselineState.end - _studioBaselineState.start) >= 0.05) {
                    queueRecalculateMals();
                    showToast(`Tare window set to ${_studioBaselineState.start.toFixed(2)} - ${_studioBaselineState.end.toFixed(2)} mL`, "info");
                }
            }
        };

        baselineCanvas.addEventListener('mouseup', handleTareDragEnd);
        baselineCanvas.addEventListener('mouseleave', handleTareDragEnd);
    }

    // Publication Normalization Handlers
    const toggleCurveNorm = document.getElementById('toggle-curve-normalization');
    const v3ToggleCurveNorm = document.getElementById('v3-toggle-curve-normalization');

    const handleNormChange = (val) => {
        normalizeCurves = val;
        if (toggleCurveNorm) toggleCurveNorm.checked = val;
        if (v3ToggleCurveNorm) v3ToggleCurveNorm.checked = val;
        queueChartRender(true);
        if (typeof renderFigureEditorChart === 'function') renderFigureEditorChart();
        showToast(val ? "Normalized curves to 0 - 100% apex" : "Returned curves to raw signal units", "info");
    };

    if (toggleCurveNorm) {
        toggleCurveNorm.addEventListener('change', () => handleNormChange(toggleCurveNorm.checked));
    }
    if (v3ToggleCurveNorm) {
        v3ToggleCurveNorm.addEventListener('change', () => handleNormChange(v3ToggleCurveNorm.checked));
    }

    // SEC Column Calibration Handlers
    const toggleColCal = document.getElementById('toggle-column-calibration');
    const secColPreset = document.getElementById('sec-column-preset');
    const openColCalModalBtn = document.getElementById('open-column-cal-modal-btn');
    const colCalModal = document.getElementById('column-cal-modal');
    const closeColCalModal = document.getElementById('close-column-cal-modal');
    const cancelColCalBtn = document.getElementById('cancel-column-cal-btn');
    const applyColCalBtn = document.getElementById('apply-column-cal-btn');
    const modalSecPreset = document.getElementById('modal-sec-preset');
    const modalSecUnit = document.getElementById('modal-sec-unit');
    const modalSecFlowRate = document.getElementById('modal-sec-flowrate');
    const addStdRowBtn = document.getElementById('add-std-row-btn');

    if (toggleColCal) {
        toggleColCal.addEventListener('change', () => {
            columnCalibrationState.enabled = toggleColCal.checked;
            syncColumnCalibrationUI();
            showToast(columnCalibrationState.enabled ? "SEC Column Calibration enabled" : "SEC Column Calibration disabled", "info");
        });
    }

    const applyPreset = (presetKey) => {
        const p = COLUMN_CALIBRATION_PRESETS[presetKey];
        if (!p) return;
        columnCalibrationState.preset = presetKey;
        columnCalibrationState.flowRate = p.flowRate || 0.5;
        columnCalibrationState.unit = p.unit || 'ml';
        columnCalibrationState.points = JSON.parse(JSON.stringify(p.points));
        if (secColPreset) secColPreset.value = presetKey;
        if (modalSecPreset) modalSecPreset.value = presetKey;
        if (modalSecFlowRate) modalSecFlowRate.value = columnCalibrationState.flowRate;
        if (modalSecUnit) modalSecUnit.value = columnCalibrationState.unit;
        renderColumnCalModalTable();
        syncColumnCalibrationUI();
    };

    if (secColPreset) {
        secColPreset.addEventListener('change', () => {
            applyPreset(secColPreset.value);
            showToast(`Loaded ${COLUMN_CALIBRATION_PRESETS[secColPreset.value]?.name || 'preset'}`, "info");
        });
    }

    if (openColCalModalBtn) {
        openColCalModalBtn.addEventListener('click', () => {
            if (colCalModal) colCalModal.style.display = 'flex';
            if (modalSecPreset) modalSecPreset.value = columnCalibrationState.preset;
            if (modalSecUnit) modalSecUnit.value = columnCalibrationState.unit;
            if (modalSecFlowRate) modalSecFlowRate.value = columnCalibrationState.flowRate;
            renderColumnCalModalTable();
            syncColumnCalibrationUI();
        });
    }

    if (closeColCalModal) closeColCalModal.addEventListener('click', () => { if (colCalModal) colCalModal.style.display = 'none'; });
    if (cancelColCalBtn) cancelColCalBtn.addEventListener('click', () => { if (colCalModal) colCalModal.style.display = 'none'; });

    if (modalSecPreset) {
        modalSecPreset.addEventListener('change', () => applyPreset(modalSecPreset.value));
    }

    if (modalSecUnit) {
        modalSecUnit.addEventListener('change', () => {
            columnCalibrationState.unit = modalSecUnit.value;
            renderColumnCalModalTable();
            syncColumnCalibrationUI();
        });
    }

    if (modalSecFlowRate) {
        modalSecFlowRate.addEventListener('input', () => {
            columnCalibrationState.flowRate = parseFloat(modalSecFlowRate.value) || 0.5;
            syncColumnCalibrationUI();
        });
    }

    if (addStdRowBtn) {
        addStdRowBtn.addEventListener('click', () => {
            columnCalibrationState.points.push({
                active: true,
                name: `Standard ${columnCalibrationState.points.length + 1}`,
                mw: 50.0,
                volume: 12.0
            });
            renderColumnCalModalTable();
            syncColumnCalibrationUI();
        });
    }

    if (applyColCalBtn) {
        applyColCalBtn.addEventListener('click', () => {
            columnCalibrationState.enabled = true;
            if (toggleColCal) toggleColCal.checked = true;
            syncColumnCalibrationUI();
            if (colCalModal) colCalModal.style.display = 'none';
            showToast("SEC Column Calibration applied!", "success");
        });
    }

    syncColumnCalibrationUI();

    if (clearPeaksBtn) {
        clearPeaksBtn.addEventListener('click', () => {
            peaks = [];
            currentSelection = { start: null, end: null };
            updatePeaksTable();
            queueChartRender(true);
            showToast("All integrated peaks cleared.", "info");
        });
    }

    if (addPeakBtn) {
        addPeakBtn.addEventListener('click', () => {
            const targetName = targetCurveSelect ? targetCurveSelect.value : (rawData && rawData.curves ? Object.keys(rawData.curves)[0] : '');
            const startVal = peakStartInput ? parseFloat(peakStartInput.value) : NaN;
            const endVal = peakEndInput ? parseFloat(peakEndInput.value) : NaN;
            const mode = baselineMode ? baselineMode.value : 'linear';

            if (isNaN(startVal) || isNaN(endVal)) {
                showToast("Please enter valid start and end volumes in mL or click on the chart.", "warning");
                return;
            }
            if (startVal === endVal) {
                showToast("Peak start and end volumes must be different.", "warning");
                return;
            }

            const newPk = integrateSelection(targetName, startVal, endVal, mode);
            if (newPk) {
                peaks.push(newPk);
                if (rawData && rawData.mals && rawData.mals.rawGridMals) {
                    recalculateMalsData();
                } else {
                    updatePeaksTable();
                    if (chartInstance) chartInstance.update('none');
                }
                showToast(`Integrated ${newPk.name}! Mw = ${newPk.mwKda ? newPk.mwKda.toFixed(1) + ' kDa' : 'N/A'}`, "success");
            } else {
                showToast("Could not calculate peak AUC for this region.", "error");
            }
        });
    }

    const malsBaselineStart = document.getElementById('mals-baseline-start');
    const malsBaselineEnd = document.getElementById('mals-baseline-end');
    [malsDndc, malsWavelength, malsN0, malsFitModel, malsBaselineStart, malsBaselineEnd].forEach(elem => {
        if (elem) {
            elem.addEventListener('change', queueRecalculateMals);
            elem.addEventListener('input', queueRecalculateMals);
        }
    });

    [subunitAMw, subunitBMw, subunitTagMw].forEach(elem => {
        if (elem) {
            elem.addEventListener('input', queueStoichiometryUpdate);
        }
    });

    if (malsPreset) {
        malsPreset.addEventListener('change', () => {
            if (malsPreset.value !== 'custom') {
                if (malsDndc) {
                    malsDndc.value = malsPreset.value;
                    queueRecalculateMals();
                }
            }
        });
    }

    if (exportPeaksCsvBtn) {
        exportPeaksCsvBtn.addEventListener('click', () => {
            if (peaks.length === 0) return;
            let csv = "Peak Name,Target Curve,Start (mL),End (mL),Apex (mL),Height,AUC,Baseline Mode,Mw MALS (kDa),SEC Apparent Mw (kDa),App/MALS Ratio,Mn (kDa),PDI,Stoichiometry,Theoretical Mw (kDa),Error (%)\n";
            peaks.forEach(pk => {
                const stoichDesc = pk.stoich ? pk.stoich.desc : '—';
                const stoichCalc = pk.stoich && pk.stoich.calcMw ? pk.stoich.calcMw.toFixed(1) : '—';
                const stoichErr = pk.stoich && pk.stoich.errorPct !== null ? pk.stoich.errorPct.toFixed(2) : '—';
                const secMwStr = pk.secApparentMw !== null && pk.secApparentMw !== undefined ? pk.secApparentMw.toFixed(2) : '';
                const ratioStr = pk.shapeRatio !== null && pk.shapeRatio !== undefined ? pk.shapeRatio.toFixed(2) : '';
                csv += `${sanitizeCsvCell(pk.name)},${sanitizeCsvCell(pk.targetCurve)},${sanitizeCsvCell(pk.start.toFixed(3))},${sanitizeCsvCell(pk.end.toFixed(3))},${sanitizeCsvCell(pk.apex.toFixed(3))},${sanitizeCsvCell(pk.height.toFixed(3))},${sanitizeCsvCell(pk.auc.toFixed(3))},${sanitizeCsvCell(pk.mode)},${sanitizeCsvCell(pk.mwKda !== null ? pk.mwKda.toFixed(2) : '')},${sanitizeCsvCell(secMwStr)},${sanitizeCsvCell(ratioStr)},${sanitizeCsvCell(pk.mnKda !== null ? pk.mnKda.toFixed(2) : '')},${sanitizeCsvCell(pk.pdi !== null ? pk.pdi.toFixed(3) : '')},${sanitizeCsvCell(stoichDesc)},${sanitizeCsvCell(stoichCalc)},${sanitizeCsvCell(stoichErr)}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SEC_MALS_Peaks_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("Peaks exported to CSV!", "success");
        });
    }

    if (toggleLsScaling) {
        toggleLsScaling.addEventListener('change', () => {
            if (lsScaleSliderContainer) {
                lsScaleSliderContainer.style.display = toggleLsScaling.checked ? 'block' : 'none';
            }
            queueChartRender(true);
        });
    }

    if (lsHeightSlider) {
        lsHeightSlider.addEventListener('input', () => {
            if (lsHeightVal) {
                lsHeightVal.textContent = `${lsHeightSlider.value}%`;
            }
            queueChartRender(true);
        });
    }

    if (toggleCompactLegend) {
        toggleCompactLegend.addEventListener('change', () => {
            queueChartRender(true);
        });
    }

    // Guides Dropdown Toggle & Click Outside Logic (Zero Layout Thrashing & Passive Listener)
    const closeGuidesDropdown = () => {
        if (guidesDropdownMenu && guidesDropdownMenu.classList.contains('show')) {
            guidesDropdownMenu.classList.remove('show');
            if (guidesDropdownBtn) guidesDropdownBtn.setAttribute('aria-expanded', 'false');
            if (guidesDropdown) guidesDropdown.classList.remove('open');
        }
    };

    if (guidesDropdownBtn && guidesDropdownMenu) {
        guidesDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = guidesDropdownMenu.classList.toggle('show');
            guidesDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (guidesDropdown) {
                guidesDropdown.classList.toggle('open', isOpen);
            }
        });

        document.addEventListener('click', (e) => {
            if (guidesDropdown && !guidesDropdown.contains(e.target)) {
                if (guidesDropdownMenu.classList.contains('show')) {
                    closeGuidesDropdown();
                }
            }
        }, { passive: true });
    }

    // Guide Modal 1: How SEC-MALS Works
    [guideModalBtn, headerGuideModalBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                closeGuidesDropdown();
                if (guideModal) guideModal.style.display = 'flex';
            });
        }
    });
    if (closeGuideModal) closeGuideModal.addEventListener('click', () => { if (guideModal) guideModal.style.display = 'none'; });
    if (closeGuideBtn) closeGuideBtn.addEventListener('click', () => { if (guideModal) guideModal.style.display = 'none'; });

    // Guide Modal 2: Biophysical Reference Guide
    [biophysicalGuideBtn, headerBiophysicalGuideBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                closeGuidesDropdown();
                if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'flex';
            });
        }
    });
    if (closeBiophysicalModal) closeBiophysicalModal.addEventListener('click', () => { if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'none'; });
    if (closeBiophysicalBtn) closeBiophysicalBtn.addEventListener('click', () => { if (biophysicalGuideModal) biophysicalGuideModal.style.display = 'none'; });

    // Guide Modal 2B: SEC vs MALS vs SDS-PAGE Specific Direct Tab Link
    if (headerSecVsMalsGuideBtn) {
        headerSecVsMalsGuideBtn.addEventListener('click', () => {
            closeGuidesDropdown();
            if (biophysicalGuideModal) {
                biophysicalGuideModal.style.display = 'flex';
                const modalTabs = biophysicalGuideModal.querySelectorAll('.modal-tab-btn');
                const modalContents = biophysicalGuideModal.querySelectorAll('.modal-tab-content');
                modalTabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === 'guide-tab-sec-vs-mals'));
                modalContents.forEach(c => c.classList.toggle('active', c.id === 'guide-tab-sec-vs-mals'));
            }
        });
    }

    // Guide Modal 3: Detectors & Channels Reference Guide
    [detectorsGuideBtn, headerDetectorsGuideBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                closeGuidesDropdown();
                if (detectorsModal) detectorsModal.style.display = 'flex';
            });
        }
    });
    if (closeDetectorsModal) closeDetectorsModal.addEventListener('click', () => { if (detectorsModal) detectorsModal.style.display = 'none'; });
    if (closeDetectorsBtn) closeDetectorsBtn.addEventListener('click', () => { if (detectorsModal) detectorsModal.style.display = 'none'; });

    // Export Plot Modal & Multi-Point Access
    const exportModal = document.getElementById('export-modal');
    const closeExportModal = document.getElementById('close-export-modal');
    const cancelExportBtn = document.getElementById('cancel-export-btn');
    const confirmExportBtn = document.getElementById('confirm-export-btn');

    [exportChartBtn, chartExportBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (exportModal) exportModal.style.display = 'flex';
            });
        }
    });
    if (closeExportModal) closeExportModal.addEventListener('click', () => { if (exportModal) exportModal.style.display = 'none'; });
    if (cancelExportBtn) cancelExportBtn.addEventListener('click', () => { if (exportModal) exportModal.style.display = 'none'; });

    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', () => {
            const format = document.querySelector('input[name="export-format"]:checked')?.value || 'png';
            const bgStyle = document.querySelector('input[name="export-bg"]:checked')?.value || 'publication';
            if (exportModal) exportModal.style.display = 'none';
            exportPublicationFigure(300, format, bgStyle);
        });
    }

    // ==========================================================================
    // 3-Window View Switcher & Studio Event Handlers
    // ==========================================================================

    document.querySelectorAll('.view-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.getAttribute('data-view');
            if (v) switchView(v);
        });
    });

    // View 1: Baseline Studio Handlers
    const studioAutodetectBaseline = document.getElementById('studio-auto-baseline-btn') || document.getElementById('studio-autodetect-baseline');
    if (studioAutodetectBaseline) {
        studioAutodetectBaseline.addEventListener('click', autoDetectSolventBaseline);
    }

    const studioApplyBaselineBtn = document.getElementById('studio-apply-baseline-btn');
    if (studioApplyBaselineBtn) {
        studioApplyBaselineBtn.addEventListener('click', () => {
            if (!rawData || !rawData.mals || !rawData.mals.rawGridMals) {
                showToast("Please load a Wyatt MALS dataset first.", "warning");
                return;
            }
            recalculateMalsData();
            showToast("Solvent baseline tare applied and all channels recalculated!", "success");
        });
    }

    const studioBaselineStart = document.getElementById('studio-baseline-start');
    const studioBaselineEnd = document.getElementById('studio-baseline-end');
    const studioBaselineStartSlider = document.getElementById('studio-baseline-start-slider');
    const studioBaselineEndSlider = document.getElementById('studio-baseline-end-slider');
    const studioBaseStartVal = document.getElementById('studio-base-start-val');
    const studioBaseEndVal = document.getElementById('studio-base-end-val');

    if (studioBaselineStart) {
        studioBaselineStart.addEventListener('input', () => {
            const val = parseFloat(studioBaselineStart.value) || 0.5;
            _studioBaselineState.start = val;
            if (studioBaselineStartSlider) studioBaselineStartSlider.value = val;
            if (studioBaseStartVal) studioBaseStartVal.textContent = `${val.toFixed(2)} mL`;
            const malsBaselineStart = document.getElementById('mals-baseline-start');
            if (malsBaselineStart) malsBaselineStart.value = val.toFixed(2);
            queueRecalculateMals();
        });
    }

    if (studioBaselineEnd) {
        studioBaselineEnd.addEventListener('input', () => {
            const val = parseFloat(studioBaselineEnd.value) || 2.5;
            _studioBaselineState.end = val;
            if (studioBaselineEndSlider) studioBaselineEndSlider.value = val;
            if (studioBaseEndVal) studioBaseEndVal.textContent = `${val.toFixed(2)} mL`;
            const malsBaselineEnd = document.getElementById('mals-baseline-end');
            if (malsBaselineEnd) malsBaselineEnd.value = val.toFixed(2);
            queueRecalculateMals();
        });
    }

    if (studioBaselineStartSlider) {
        studioBaselineStartSlider.addEventListener('input', () => {
            const val = parseFloat(studioBaselineStartSlider.value) || 0.5;
            _studioBaselineState.start = val;
            if (studioBaselineStart) studioBaselineStart.value = val.toFixed(2);
            if (studioBaseStartVal) studioBaseStartVal.textContent = `${val.toFixed(2)} mL`;
            const malsBaselineStart = document.getElementById('mals-baseline-start');
            if (malsBaselineStart) malsBaselineStart.value = val.toFixed(2);
            queueRecalculateMals();
        });
    }

    if (studioBaselineEndSlider) {
        studioBaselineEndSlider.addEventListener('input', () => {
            const val = parseFloat(studioBaselineEndSlider.value) || 2.5;
            _studioBaselineState.end = val;
            if (studioBaselineEnd) studioBaselineEnd.value = val.toFixed(2);
            if (studioBaseEndVal) studioBaseEndVal.textContent = `${val.toFixed(2)} mL`;
            const malsBaselineEnd = document.getElementById('mals-baseline-end');
            if (malsBaselineEnd) malsBaselineEnd.value = val.toFixed(2);
            queueRecalculateMals();
        });
    }

    // Baseline Studio Correction Plan & Post-Peak Drift Handlers
    const studioBaselinePlan = document.getElementById('studio-baseline-plan');
    const studioPostPeakGroup = document.getElementById('studio-post-peak-group');
    const studioPostStart = document.getElementById('studio-post-start');
    const studioPostEnd = document.getElementById('studio-post-end');
    const studioPostWindowVal = document.getElementById('studio-post-window-val');

    if (studioBaselinePlan) {
        studioBaselinePlan.addEventListener('change', () => {
            const isMultiPoint = studioBaselinePlan.value === 'plan2' || studioBaselinePlan.value === 'plan3';
            _studioBaselineState.plan = studioBaselinePlan.value;
            if (studioPostPeakGroup) studioPostPeakGroup.style.display = isMultiPoint ? 'flex' : 'none';
            queueRecalculateMals();
        });
    }

    const updatePostWindowText = () => {
        if (studioPostStart && studioPostEnd && studioPostWindowVal) {
            const ps = parseFloat(studioPostStart.value) || 18.0;
            const pe = parseFloat(studioPostEnd.value) || 20.0;
            studioPostWindowVal.textContent = `${ps.toFixed(1)} - ${pe.toFixed(1)} mL`;
        }
    };

    if (studioPostStart) {
        studioPostStart.addEventListener('input', () => {
            _studioBaselineState.postStart = parseFloat(studioPostStart.value) || 18.0;
            updatePostWindowText();
            queueRecalculateMals();
        });
    }

    if (studioPostEnd) {
        studioPostEnd.addEventListener('input', () => {
            _studioBaselineState.postEnd = parseFloat(studioPostEnd.value) || 20.0;
            updatePostWindowText();
            queueRecalculateMals();
        });
    }

    // Peak Gating Handlers (Both Studio & Sidebar Toggles)
    const toggleMwGating = document.getElementById('toggle-mw-peak-gating');
    const sidebarToggleMwGating = document.getElementById('sidebar-toggle-mw-peak-gating');

    const handlePeakGatingChange = (checked) => {
        mwGatingSettings.mode = checked ? 'peaks_only' : 'all';
        if (toggleMwGating) toggleMwGating.checked = checked;
        if (sidebarToggleMwGating) sidebarToggleMwGating.checked = checked;
        queueRecalculateMals();
        showToast(checked ? "Peak Gating enabled: molar mass calculated strictly across peak elution slices." : "Peak Gating disabled: showing all raw molar mass slices.", "info");
    };

    if (toggleMwGating) toggleMwGating.addEventListener('change', (e) => handlePeakGatingChange(e.target.checked));
    if (sidebarToggleMwGating) sidebarToggleMwGating.addEventListener('change', (e) => handlePeakGatingChange(e.target.checked));

    const studioSnrSlider = document.getElementById('studio-snr-slider');
    const studioSnrVal = document.getElementById('studio-snr-val');
    if (studioSnrSlider) {
        studioSnrSlider.addEventListener('input', () => {
            const snr = parseFloat(studioSnrSlider.value) || 3.0;
            mwGatingSettings.snrThreshold = snr;
            if (studioSnrVal) studioSnrVal.textContent = `${snr.toFixed(1)}σ`;
            queueRecalculateMals();
        });
    }

    const studioConcFractionSlider = document.getElementById('studio-conc-fraction-slider');
    const studioConcFractionVal = document.getElementById('studio-conc-fraction-val');
    if (studioConcFractionSlider) {
        studioConcFractionSlider.addEventListener('input', () => {
            const frac = (parseInt(studioConcFractionSlider.value) || 5) / 100.0;
            mwGatingSettings.concApexFraction = frac;
            if (studioConcFractionVal) studioConcFractionVal.textContent = `${Math.round(frac * 100)}% Apex`;
            queueRecalculateMals();
        });
    }

    // View 3: Live Split Figure Editor Form Listeners
    const v3Title = document.getElementById('v3-plot-title');
    const v3Subtitle = document.getElementById('v3-plot-subtitle');
    const v3XAxis = document.getElementById('v3-plot-xaxis');
    const v3YPrimary = document.getElementById('v3-plot-yprimary');
    const v3YSecondary = document.getElementById('v3-plot-ysecondary');
    const v3YMolarMass = document.getElementById('v3-plot-ymolarmass');
    const v3FontFamily = document.getElementById('v3-plot-font-family');
    const v3FontWeight = document.getElementById('v3-plot-font-weight');
    const v3TitleSize = document.getElementById('v3-plot-title-size');
    const v3AxisSize = document.getElementById('v3-plot-axis-size');
    const v3TicksSize = document.getElementById('v3-plot-ticks-size');
    const v3LegendSize = document.getElementById('v3-plot-legend-size');
    const v3LegendPos = document.getElementById('v3-plot-legend-pos');
    const v3AspectPreset = document.getElementById('v3-plot-aspect-preset');
    const v3CustomW = document.getElementById('v3-plot-custom-w');
    const v3CustomH = document.getElementById('v3-plot-custom-h');
    const v3CustomDimsRow = document.getElementById('v3-custom-dims-row');
    const v3ExportDownloadBtn = document.getElementById('v3-export-download-btn');
    const v3ResetZoomBtn = document.getElementById('v3-reset-zoom-btn');
    const v3QuickExportBtn = document.getElementById('v3-quick-export-btn');
    const v3AspectBadge = document.getElementById('v3-aspect-badge');

    const updateV3 = () => {
        queueFigureEditorMetadataUpdate();
    };

    if (v3Title) v3Title.addEventListener('input', () => { plotSettings.title = v3Title.value; if (plotTitleInput) plotTitleInput.value = v3Title.value; updateV3(); });
    if (v3Subtitle) v3Subtitle.addEventListener('input', () => { plotSettings.subtitle = v3Subtitle.value; if (plotSubtitleInput) plotSubtitleInput.value = v3Subtitle.value; updateV3(); });
    if (v3XAxis) v3XAxis.addEventListener('input', () => { plotSettings.xAxisTitle = v3XAxis.value; if (plotXAxisTitle) plotXAxisTitle.value = v3XAxis.value; updateV3(); });
    if (v3YPrimary) v3YPrimary.addEventListener('input', () => { plotSettings.yPrimaryTitle = v3YPrimary.value; if (plotYPrimaryTitle) plotYPrimaryTitle.value = v3YPrimary.value; updateV3(); });
    if (v3YSecondary) v3YSecondary.addEventListener('input', () => { plotSettings.ySecondaryTitle = v3YSecondary.value; if (plotYSecondaryTitle) plotYSecondaryTitle.value = v3YSecondary.value; updateV3(); });
    if (v3YMolarMass) v3YMolarMass.addEventListener('input', () => { plotSettings.yMolarMassTitle = v3YMolarMass.value; if (plotYMolarMassTitle) plotYMolarMassTitle.value = v3YMolarMass.value; updateV3(); });
    if (v3FontFamily) v3FontFamily.addEventListener('change', () => { plotSettings.fontFamily = v3FontFamily.value; if (plotFontFamily) plotFontFamily.value = v3FontFamily.value; updateV3(); });
    if (v3FontWeight) v3FontWeight.addEventListener('change', () => { plotSettings.fontWeight = v3FontWeight.value; if (plotFontWeight) plotFontWeight.value = v3FontWeight.value; updateV3(); });
    if (v3TitleSize) v3TitleSize.addEventListener('input', () => { plotSettings.titleFontSize = parseInt(v3TitleSize.value) || 16; if (plotTitleSize) plotTitleSize.value = v3TitleSize.value; updateV3(); });
    if (v3AxisSize) v3AxisSize.addEventListener('input', () => { plotSettings.axisTitleFontSize = parseInt(v3AxisSize.value) || 12; if (plotAxisSize) plotAxisSize.value = v3AxisSize.value; updateV3(); });
    if (v3TicksSize) v3TicksSize.addEventListener('input', () => { plotSettings.ticksFontSize = parseInt(v3TicksSize.value) || 11; if (plotTicksSize) plotTicksSize.value = v3TicksSize.value; updateV3(); });
    if (v3LegendSize) v3LegendSize.addEventListener('input', () => { plotSettings.legendFontSize = parseInt(v3LegendSize.value) || 12; if (plotLegendSize) plotLegendSize.value = v3LegendSize.value; updateV3(); });
    if (v3LegendPos) v3LegendPos.addEventListener('change', () => { plotSettings.legendPosition = v3LegendPos.value; if (plotLegendPos) plotLegendPos.value = v3LegendPos.value; updateV3(); });

    if (v3AspectPreset) {
        v3AspectPreset.addEventListener('change', () => {
            plotSettings.aspectRatioPreset = v3AspectPreset.value;
            if (plotAspectPreset) plotAspectPreset.value = v3AspectPreset.value;
            if (v3CustomDimsRow) v3CustomDimsRow.style.display = v3AspectPreset.value === 'custom' ? 'grid' : 'none';
            if (v3AspectBadge) v3AspectBadge.textContent = `Aspect: ${v3AspectPreset.value.toUpperCase()}`;
            applyChartAspectRatio();
            queueChartRender(true);
        });
    }

    if (v3CustomW) {
        v3CustomW.addEventListener('input', () => {
            plotSettings.customWidth = parseInt(v3CustomW.value) || 900;
            if (plotCustomW) plotCustomW.value = v3CustomW.value;
            if (plotSettings.aspectRatioPreset === 'custom') {
                applyChartAspectRatio();
                queueChartRender(true);
            }
        });
    }

    if (v3CustomH) {
        v3CustomH.addEventListener('input', () => {
            plotSettings.customHeight = parseInt(v3CustomH.value) || 500;
            if (plotCustomH) plotCustomH.value = v3CustomH.value;
            if (plotSettings.aspectRatioPreset === 'custom') {
                applyChartAspectRatio();
                queueChartRender(true);
            }
        });
    }

    // Dynamic Y-Axis Clamping Listeners
    const yAutoscaleToggle = document.getElementById('plot-y-primary-autoscale');
    const yPrimaryMinIn = document.getElementById('plot-y-primary-min');
    const yPrimaryMaxIn = document.getElementById('plot-y-primary-max');
    const ySecondaryMinIn = document.getElementById('plot-y-secondary-min');
    const ySecondaryMaxIn = document.getElementById('plot-y-secondary-max');

    if (yAutoscaleToggle) {
        yAutoscaleToggle.addEventListener('change', (e) => {
            plotSettings.yPrimaryAutoscale = e.target.checked;
            queueChartRender(true);
        });
    }

    if (yPrimaryMinIn) {
        yPrimaryMinIn.addEventListener('input', () => {
            plotSettings.yPrimaryMin = yPrimaryMinIn.value !== '' ? parseFloat(yPrimaryMinIn.value) : null;
            updateV3();
        });
    }

    if (yPrimaryMaxIn) {
        yPrimaryMaxIn.addEventListener('input', () => {
            plotSettings.yPrimaryMax = yPrimaryMaxIn.value !== '' ? parseFloat(yPrimaryMaxIn.value) : null;
            updateV3();
        });
    }

    if (ySecondaryMinIn) {
        ySecondaryMinIn.addEventListener('input', () => {
            plotSettings.ySecondaryMin = ySecondaryMinIn.value !== '' ? parseFloat(ySecondaryMinIn.value) : null;
            updateV3();
        });
    }

    if (ySecondaryMaxIn) {
        ySecondaryMaxIn.addEventListener('input', () => {
            plotSettings.ySecondaryMax = ySecondaryMaxIn.value !== '' ? parseFloat(ySecondaryMaxIn.value) : null;
            updateV3();
        });
    }

    if (v3ExportDownloadBtn) {
        v3ExportDownloadBtn.addEventListener('click', () => {
            const dpi = parseInt(document.getElementById('v3-plot-export-dpi')?.value || 300) || 300;
            const format = document.getElementById('v3-plot-export-format')?.value || 'png';
            const bg = document.getElementById('v3-plot-export-bg')?.value || 'publication';
            exportPublicationFigure(dpi, format, bg);
        });
    }

    if (v3ResetZoomBtn) {
        v3ResetZoomBtn.addEventListener('click', triggerResetZoom);
    }

    if (v3QuickExportBtn) {
        v3QuickExportBtn.addEventListener('click', () => {
            exportPublicationFigure(300, 'png', 'publication');
        });
    }
}

// ==========================================================================
// Application Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Chart.js zoom plugin registration
    try {
        if (typeof Chart !== 'undefined') {
            if (typeof ChartZoom !== 'undefined') {
                Chart.register(ChartZoom);
            } else if (typeof window['chartjs-plugin-zoom'] !== 'undefined') {
                Chart.register(window['chartjs-plugin-zoom']);
            }
        }
    } catch (err) {
        console.warn('Failed to register Chart zoom plugin:', err);
    }

    // 2. Theme initialization
    try {
        let initialTheme = 'light';
        try {
            initialTheme = localStorage.getItem('sec_mals_theme') || 'light';
        } catch (e) {}
        document.body.setAttribute('data-theme', initialTheme);
    } catch (err) {
        console.warn('Failed to initialize theme:', err);
    }

    // 3. Event listeners registration (100% guarantee)
    try {
        setupEventListeners();
    } catch (err) {
        console.error('Failed to setup event listeners:', err);
    }

    // 4. Color synchronization & UI updates
    try {
        syncPeakColor();
    } catch (err) {
        console.warn('Failed to sync peak color:', err);
    }

    try {
        updateThemeUI();
    } catch (err) {
        console.warn('Failed to update theme UI:', err);
    }

    // 5. Lucide icons rendering
    try {
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } catch (err) {
        console.warn('Failed to render Lucide icons:', err);
    }
});


    // ==========================================================================
    // Size & MW Multi-Model Estimator Interactive Handlers
    // ==========================================================================
    const sizeEstimatorModal = document.getElementById('size-estimator-modal');
    const openSizeEstimatorBtn = document.getElementById('open-size-estimator-btn');
    const sidebarOpenSizeEstimatorBtn = document.getElementById('sidebar-open-size-estimator-btn');
    const closeSizeEstimatorModal = document.getElementById('close-size-estimator-modal');
    const closeSizeEstimatorBtn = document.getElementById('close-size-estimator-btn');
    const sizeEstimatorFillPeakBtn = document.getElementById('size-estimator-fill-peak-btn');
    const sizeEstimatorCalcBtn = document.getElementById('size-estimator-calc-btn');
    const sizeEstimatorColPreset = document.getElementById('size-estimator-col-preset');
    const sizeEstimatorFlowRate = document.getElementById('size-estimator-flowrate');
    const sizeEstimatorInputMode = document.getElementById('size-estimator-input-mode');
    const sizeEstimatorInputVal = document.getElementById('size-estimator-input-val');
    const lblSizeEstimatorVal = document.getElementById('lbl-size-estimator-val');
    const headerSizeVsConcGuideBtn = document.getElementById('header-size-vs-conc-guide-btn');

    function calculateSizeEstimator() {
        if (!sizeEstimatorInputVal) return;
        const mode = sizeEstimatorInputMode ? sizeEstimatorInputMode.value : 'vol';
        const presetKey = sizeEstimatorColPreset ? sizeEstimatorColPreset.value : 'superdex200';
        const fr = (sizeEstimatorFlowRate && parseFloat(sizeEstimatorFlowRate.value) > 0) ? parseFloat(sizeEstimatorFlowRate.value) : 0.5;
        const val = parseFloat(sizeEstimatorInputVal.value) || 0;
        const col = COLUMN_CALIBRATION_PRESETS[presetKey] || COLUMN_CALIBRATION_PRESETS.superdex200;

        let volMl = 0;
        let rhNm = 0;
        let diamNm = 0;

        if (mode === 'vol') {
            volMl = val;
            const sz = elutionToHydrodynamicRadius(volMl, presetKey);
            rhNm = sz ? sz.rhNm : 0;
            diamNm = sz ? sz.diamNm : 0;
        } else if (mode === 'time') {
            volMl = val * fr;
            const sz = elutionToHydrodynamicRadius(volMl, presetKey);
            rhNm = sz ? sz.rhNm : 0;
            diamNm = sz ? sz.diamNm : 0;
        } else if (mode === 'diam') {
            diamNm = val;
            rhNm = val / 2.0;
            // Approximate elution volume from Rh
            const globMw = rhToMolecularWeightGlobular(rhNm);
            const fit = fitStandardPoints(col.points, fr, 'ml');
            if (fit && fit.m !== null && globMw > 0) {
                volMl = (Math.log10(globMw) - fit.b) / fit.m;
            }
        } else if (mode === 'rh') {
            rhNm = val;
            diamNm = val * 2.0;
            const globMw = rhToMolecularWeightGlobular(rhNm);
            const fit = fitStandardPoints(col.points, fr, 'ml');
            if (fit && fit.m !== null && globMw > 0) {
                volMl = (Math.log10(globMw) - fit.b) / fit.m;
            }
        }

        // 1. Column apparent MW
        let colMw = null;
        if (volMl > 0) {
            const fit = fitStandardPoints(col.points, fr, 'ml');
            if (fit && fit.m !== null) {
                const logMw = fit.m * volMl + fit.b;
                if (!isNaN(logMw) && logMw >= -1 && logMw <= 7) colMw = Math.pow(10, logMw);
            }
        }

        // 2. Globular MW
        const globMw = rhToMolecularWeightGlobular(rhNm);

        // 3. Disordered MW
        const disMw = rhToMolecularWeightDisordered(rhNm);

        // 4. Kav
        const kav = volMl > 0 ? calculateKav(volMl, presetKey) : null;

        // Update UI
        const resColMw = document.getElementById('res-col-mw');
        const resGlobMw = document.getElementById('res-glob-mw');
        const resDisMw = document.getElementById('res-dis-mw');
        const resParticleSize = document.getElementById('res-particle-size');
        const resParticleSub = document.getElementById('res-particle-sub');
        const resKavBadge = document.getElementById('res-kav-badge');
        const resKavExplanation = document.getElementById('res-kav-explanation');

        if (resColMw) resColMw.textContent = colMw ? `${colMw.toFixed(1)} kDa` : 'Out of Range';
        if (resGlobMw) resGlobMw.textContent = globMw ? `${globMw.toFixed(1)} kDa` : '—';
        if (resDisMw) resDisMw.textContent = disMw ? `${disMw.toFixed(1)} kDa` : '—';
        if (resParticleSize) resParticleSize.textContent = diamNm > 0 ? `${diamNm.toFixed(2)} nm` : '—';
        if (resParticleSub) resParticleSub.textContent = rhNm > 0 ? `Stokes Radius Rh: ${rhNm.toFixed(2)} nm (Diam: ${diamNm.toFixed(2)} nm)` : '—';

        if (resKavBadge && resKavExplanation) {
            if (kav !== null && !isNaN(kav)) {
                resKavBadge.textContent = `Kav = ${kav.toFixed(3)}`;
                const v0 = col.v0 || 8.0;
                const vt = col.vt || 24.0;
                if (kav <= 0.05) {
                    resKavBadge.style.color = 'var(--danger)';
                    resKavExplanation.innerHTML = `<strong>Excluded (Void Volume):</strong> Elutes at ${volMl.toFixed(2)} mL (&le; V0 ${v0} mL). Molecule is larger than column exclusion limit (Aggregate / Giant complex > ${col.maxMw} kDa).`;
                } else if (kav >= 0.95) {
                    resKavBadge.style.color = 'var(--warning)';
                    resKavExplanation.innerHTML = `<strong>Permeated (Total Bed Volume):</strong> Elutes at ${volMl.toFixed(2)} mL (&ge; Vt ${vt} mL). Molecule is small (&le; ${col.minMw} kDa) or delayed by non-specific column matrix interactions.`;
                } else {
                    resKavBadge.style.color = 'var(--success)';
                    resKavExplanation.innerHTML = `<strong>Active Fractionation Window:</strong> Elutes at ${volMl.toFixed(2)} mL (Optimal separation zone between V0=${v0} mL and Vt=${vt} mL).`;
                }
            } else {
                resKavBadge.textContent = '—';
                resKavExplanation.textContent = 'Enter an elution volume or diameter to see fractionation kinetics.';
            }
        }
    }

    function openSizeEstimator() {
        if (sizeEstimatorModal) sizeEstimatorModal.style.display = 'flex';
        // If there are integrated peaks, prefill with first peak or apex
        if (peaks.length > 0 && sizeEstimatorInputVal) {
            sizeEstimatorInputVal.value = peaks[0].apex.toFixed(2);
        }
        calculateSizeEstimator();
    }

    if (openSizeEstimatorBtn) openSizeEstimatorBtn.addEventListener('click', openSizeEstimator);
    if (sidebarOpenSizeEstimatorBtn) sidebarOpenSizeEstimatorBtn.addEventListener('click', openSizeEstimator);
    if (closeSizeEstimatorModal) closeSizeEstimatorModal.addEventListener('click', () => { if (sizeEstimatorModal) sizeEstimatorModal.style.display = 'none'; });
    if (closeSizeEstimatorBtn) closeSizeEstimatorBtn.addEventListener('click', () => { if (sizeEstimatorModal) sizeEstimatorModal.style.display = 'none'; });

    if (sizeEstimatorInputMode) {
        sizeEstimatorInputMode.addEventListener('change', () => {
            const mode = sizeEstimatorInputMode.value;
            if (lblSizeEstimatorVal) {
                if (mode === 'vol') lblSizeEstimatorVal.textContent = 'Elution Volume (mL)';
                else if (mode === 'time') lblSizeEstimatorVal.textContent = 'Retention Time (min)';
                else if (mode === 'diam') lblSizeEstimatorVal.textContent = 'Particle Diameter (nm)';
                else if (mode === 'rh') lblSizeEstimatorVal.textContent = 'Stokes Radius Rh (nm)';
            }
            calculateSizeEstimator();
        });
    }

    if (sizeEstimatorCalcBtn) sizeEstimatorCalcBtn.addEventListener('click', calculateSizeEstimator);
    if (sizeEstimatorInputVal) sizeEstimatorInputVal.addEventListener('input', calculateSizeEstimator);
    if (sizeEstimatorColPreset) sizeEstimatorColPreset.addEventListener('change', calculateSizeEstimator);
    if (sizeEstimatorFlowRate) sizeEstimatorFlowRate.addEventListener('input', calculateSizeEstimator);

    if (sizeEstimatorFillPeakBtn) {
        sizeEstimatorFillPeakBtn.addEventListener('click', () => {
            if (peaks.length > 0) {
                const pk = peaks[peaks.length - 1];
                if (sizeEstimatorInputMode) sizeEstimatorInputMode.value = 'vol';
                if (lblSizeEstimatorVal) lblSizeEstimatorVal.textContent = 'Elution Volume (mL)';
                if (sizeEstimatorInputVal) sizeEstimatorInputVal.value = pk.apex.toFixed(2);
                calculateSizeEstimator();
                showToast(`Loaded ${pk.name} apex (${pk.apex.toFixed(2)} mL)`, "info");
            } else {
                showToast("No integrated peaks found. Click on a peak in the chart first!", "warning");
            }
        });
    }

    if (headerSizeVsConcGuideBtn) {
        headerSizeVsConcGuideBtn.addEventListener('click', () => {
            const bioModal = document.getElementById('biophysical-guide-modal');
            if (bioModal) {
                bioModal.style.display = 'flex';
                // Switch to size vs conc tab
                const tabs = bioModal.querySelectorAll('.modal-tab-btn');
                const contents = bioModal.querySelectorAll('.modal-tab-content');
                tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === 'guide-tab-size-vs-conc'));
                contents.forEach(c => c.classList.toggle('active', c.id === 'guide-tab-size-vs-conc'));
            }
        });
    }
