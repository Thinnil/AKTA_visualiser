import sys
import os

def parse_universal_csv(filepath):
    encodings = ['utf-16', 'utf-8', 'latin-1']
    content = None
    selected_enc = None
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                content = f.read()
            selected_enc = enc
            break
        except Exception:
            continue
            
    if not content:
        raise ValueError("Could not read file with any encoding.")
        
    lines = content.split('\n')
    header_index = -1
    delimiter = ','
    
    for i, line in enumerate(lines):
        line_str = line.strip()
        test_delim = '\t' if '\t' in line_str else ','
        parts = [p.strip().lower() for p in line_str.split(test_delim)]
        
        has_ml = any('ml' in p for p in parts)
        has_abs = any('mau' in p or 'abs' in p or 'absorbance' in p or 'uv' in p for p in parts)
        
        if has_ml and has_abs:
            header_index = i
            delimiter = test_delim
            break
            
    if header_index == -1:
        raise ValueError("Header not found")
        
    headers = [h.strip().replace('"', '') for h in lines[header_index].split(delimiter)]
    headers_lower = [h.lower() for h in headers]
    
    print(f"Detected Encoding: {selected_enc}")
    print(f"Detected Delimiter: {'TAB' if delimiter == '\t' else 'COMMA'}")
    print(f"Header Row Index: {header_index}")
    print(f"Total Columns: {len(headers)}")
    print(f"Headers: {headers}")
    
    if header_index == 0:
        ml_idx = headers_lower.index('ml')
        print("This is a simple CSV format.")
        return
        
    row_prev_parts = [p.strip().replace('"', '') for p in lines[header_index - 1].split(delimiter)]
    signal_names = []
    last_signal = "Unknown"
    for p in row_prev_parts:
        if p != "":
            last_signal = p
        signal_names.append(last_signal)
        
    curves = {}
    fractions_events = []
    
    for k in range(len(headers_lower) - 1):
        if 'ml' in headers_lower[k]:
            val_col = k + 1
            unit = headers[val_col]
            unit_lower = unit.lower()
            signal_name = signal_names[val_col] if val_col < len(signal_names) else signal_names[k]
            curve_name = f"{signal_name} ({unit})"
            
            if 'fraction' in unit_lower:
                for line in lines[header_index+1:]:
                    if not line.strip():
                        continue
                    parts = line.split(delimiter)
                    if len(parts) <= val_col:
                        continue
                    try:
                        ml = float(parts[k])
                        frac_val = parts[val_col].strip().replace('"', '')
                        if frac_val != '':
                            fractions_events.append((ml, frac_val))
                    except ValueError:
                        continue
            elif 'injection' in unit_lower or 'log' in unit_lower or 'event' in unit_lower:
                continue
            else:
                points = []
                for line in lines[header_index+1:]:
                    if not line.strip():
                        continue
                    parts = line.split(delimiter)
                    if len(parts) <= val_col:
                        continue
                    try:
                        ml = float(parts[k])
                        val = float(parts[val_col])
                        points.append((ml, val))
                    except ValueError:
                        continue
                if points:
                    curves[curve_name] = sorted(points, key=lambda x: x[0])
                    
    print("\n--- Parsed Curves Summary ---")
    for name, pts in curves.items():
        print(f"Curve: {name}")
        print(f"  Points: {len(pts)}")
        print(f"  X Range: {pts[0][0]:.3f} - {pts[-1][0]:.3f} mL")
        print(f"  Y Range: {min(p[1] for p in pts):.4f} - {max(p[1] for p in pts):.4f}")
        
    if fractions_events:
        fractions_events = sorted(fractions_events, key=lambda x: x[0])
        unique_fractions = []
        last_val = None
        for ml, val in fractions_events:
            if val != last_val:
                unique_fractions.append((ml, val))
                last_val = val
        print(f"\n--- Parsed Fraction Swapping Events ({len(unique_fractions)}) ---")
        for ml, val in unique_fractions[:20]:
            print(f"  At {ml:.3f} mL -> Switched to {val}")
        if len(unique_fractions) > 20:
            print(f"  ... and {len(unique_fractions) - 20} more events")

if __name__ == '__main__':
    parse_universal_csv(r"C:\Users\g_san\Desktop\04062026_sumovspet_artic.csv")
