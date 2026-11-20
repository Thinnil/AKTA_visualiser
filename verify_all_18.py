import gzip
import sqlite3
import tempfile
import os
import zlib
import numpy as np

def extract_wyatt_floats(blob):
    if not blob or len(blob) < 16:
        return None
    uint8 = bytes(blob)
    zlib_offset = -1
    for i in range(min(len(uint8) - 2, 64)):
        if uint8[i] == 0x78 and uint8[i+1] in [0x9c, 0xda, 0x01, 0x5e]:
            zlib_offset = i
            break
    
    data_bytes = None
    if zlib_offset != -1:
        try:
            data_bytes = zlib.decompress(uint8[zlib_offset:])
        except Exception:
            pass
    if data_bytes is None:
        data_bytes = uint8[16:]
        
    byte_len = len(data_bytes)
    if byte_len >= 8 and byte_len % 8 == 0:
        return np.frombuffer(data_bytes, dtype=np.float64)
    elif byte_len >= 4 and byte_len % 4 == 0:
        return np.frombuffer(data_bytes, dtype=np.float32).astype(np.float64)
    return None

folder = r'C:\Users\g_san\Desktop\Temp\Erase_10_days\wyatt'
for fname in sorted(os.listdir(folder)):
    if not (fname.endswith('.afe7') or fname.endswith('.afs7')):
        continue
    fpath = os.path.join(folder, fname)
    size = os.path.getsize(fpath)
    
    with tempfile.NamedTemporaryFile(suffix='.sqlite', delete=False) as tmp:
        tmp_path = tmp.name
        with gzip.open(fpath, 'rb') as f_in:
            tmp.write(f_in.read())
            
    conn = sqlite3.connect(tmp_path)
    cur = conn.cursor()
    
    print("=================================================================")
    print(f"FILE: {fname} ({size/1024:.1f} KB)")
    
    # 1. Experiment info
    exp_name = fname.replace('.afe7', '').replace('.afs7', '')
    flow_rate = 0.5
    dndc = 0.185
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='WSampleSetSampleDetails'")
    if cur.fetchone():
        cur.execute("SELECT m_ExperimentName, flowRate, m_dConcentration, m_dInjectedVolume, m_dDndc FROM WSampleSetSampleDetails")
        r = cur.fetchone()
        if r:
            if r[0]: exp_name = str(r[0])
            try:
                if r[1] is not None and float(r[1]) > 0: flow_rate = float(r[1])
            except Exception: pass
            try:
                if r[4] is not None and float(r[4]) > 0: dndc = float(r[4])
            except Exception: pass
    print(f"  Exp: '{exp_name}' | Flow: {flow_rate} mL/min | dn/dc: {dndc}")

    # 2. Heleos Profile
    wavelength = 660.5
    cal_const = 3.4815e-5
    angles = [32.0, 44.0, 57.0, 72.0, 90.0, 108.0, 126.0, 141.0]
    norm_coeffs = [1.545, 2.151, 0.858, 0.983, 1.0, 1.0, 0.812, 2.105]
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='WHeleos8Profile'")
    if cur.fetchone():
        cur.execute("SELECT m_dWavelength, m_dCalibrationConstant, m_vDetectorAngles, m_vNormalizationCoefficients FROM WHeleos8Profile")
        r = cur.fetchone()
        if r:
            if r[0]: wavelength = float(r[0])
            if r[1]: cal_const = float(r[1])
            a = extract_wyatt_floats(r[2])
            if a is not None and len(a) >= 8: angles = list(a[:8])
            n = extract_wyatt_floats(r[3])
            if n is not None and len(n) >= 8: norm_coeffs = list(n[:8])
            
    # 3. Check MALS Matrix
    has_mals = False
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='WMatrixData'")
    if cur.fetchone():
        cur.execute("SELECT m_vIndex, m_vColumnIndex, m_vvValue FROM WMatrixData WHERE m_sInstrumentClassName='WHeleos8Profile' AND m_nDataName=12022")
        r = cur.fetchone()
        if r:
            time_mals = extract_wyatt_floats(r[0])
            col_mals = extract_wyatt_floats(r[1])
            val_mals = extract_wyatt_floats(r[2])
            if time_mals is not None and val_mals is not None and col_mals is not None:
                if len(val_mals) == len(time_mals) * len(col_mals):
                    grid = val_mals.reshape((len(time_mals), len(col_mals)))
                    has_mals = True
                    det5 = grid[:, 4]
                    print(f"  [MALS DETECTED]: {len(time_mals)} slices (0 to {time_mals[-1]*flow_rate:.2f} mL) | 90° Peak: {det5.max():.3f} V (Baseline: {det5[:20].mean():.3f} V)")

    # 4. Check dRI Vector
    has_dri = False
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='WVectorData'")
    if cur.fetchone():
        cur.execute("SELECT m_vIndex, m_vValue FROM WVectorData WHERE m_sInstrumentClassName='WNGOInstrumentProfile' AND m_nDataName=12025")
        r = cur.fetchone()
        if r:
            time_dri = extract_wyatt_floats(r[0])
            val_dri = extract_wyatt_floats(r[1])
            if time_dri is not None and val_dri is not None:
                has_dri = True
                base = np.percentile(val_dri[:int(len(val_dri)*0.1)], 50)
                excess = val_dri - base
                conc_max = (excess.max() / dndc) * 1000.0
                print(f"  [dRI DETECTED]: {len(time_dri)} slices | Peak Δn: {val_dri.max()*1e6:.1f} μRIU | Peak Conc: {conc_max:.2f} mg/mL")

    conn.close()
    os.remove(tmp_path)
