import csv
import os

def load_data(filepath):
    data = []
    with open(filepath, 'r') as f:
        reader = csv.reader(f)
        header_index = -1
        rows = list(reader)
        for i, row in enumerate(rows):
            if any('ml' in col.lower() for col in row) and any('mau' in col.lower() for col in row):
                header_index = i
                break
        
        if header_index == -1:
            raise ValueError("Headers not found")
            
        headers = [h.strip().lower() for h in rows[header_index]]
        ml_idx = next(i for i, h in enumerate(headers) if 'ml' in h)
        mau_idx = next(i for i, h in enumerate(headers) if 'mau' in h or 'abs' in h)
        b_idx = next((i for i, h in enumerate(headers) if '%b' in h or 'buffer' in h), -1)
        
        for row in rows[header_index+1:]:
            if not row or len(row) <= max(ml_idx, mau_idx):
                continue
            try:
                ml = float(row[ml_idx])
                mau = float(row[mau_idx])
                b_val = float(row[b_idx]) if b_idx != -1 else 0.0
                data.append((ml, mau, b_val))
            except ValueError:
                continue
    return sorted(data, key=lambda x: x[0])

def calculate_auc_py(data, start_ml, end_ml, mode='linear'):
    points = [p for p in data if start_ml <= p[0] <= end_ml]
    if len(points) < 2:
        return None
        
    start_pt = points[0]
    end_pt = points[-1]
    
    auc = 0.0
    for i in range(len(points) - 1):
        p1 = points[i]
        p2 = points[i+1]
        
        y1, y2 = p1[1], p2[1]
        
        if mode == 'linear':
            f1 = (p1[0] - start_pt[0]) / (end_pt[0] - start_pt[0])
            f2 = (p2[0] - start_pt[0]) / (end_pt[0] - start_pt[0])
            
            baseline_y1 = start_pt[1] + f1 * (end_pt[1] - start_pt[1])
            baseline_y2 = start_pt[1] + f2 * (end_pt[1] - start_pt[1])
            
            y1 -= baseline_y1
            y2 -= baseline_y2
            
        area = 0.5 * (y1 + y2) * (p2[0] - p1[0])
        auc += area
        
    apex = max(points, key=lambda x: x[1])
    f_apex = (apex[0] - start_pt[0]) / (end_pt[0] - start_pt[0])
    baseline_apex = start_pt[1] + f_apex * (end_pt[1] - start_pt[1]) if mode == 'linear' else 0
    height = apex[1] - baseline_apex
    
    return auc, apex[0], height, len(points)

if __name__ == '__main__':
    csv_path = r"C:\Users\g_san\Desktop\mL_abs_B_percentage.csv"
    if not os.path.exists(csv_path):
        print(f"File not found at: {csv_path}")
    else:
        print(f"Loading data from {csv_path}...")
        data = load_data(csv_path)
        print(f"Loaded {len(data)} data points.")
        print(f"Volume range: {data[0][0]} mL to {data[-1][0]} mL")
        print(f"Absorbance range: {min(d[1] for d in data)} mAU to {max(d[1] for d in data)} mAU")
        
        test_ranges = [(5.0, 15.0), (10.0, 20.0), (15.0, 25.0)]
        for r_start, r_end in test_ranges:
            if r_start >= data[0][0] and r_end <= data[-1][0]:
                print(f"\n--- Testing Range: {r_start} - {r_end} mL ---")
                for mode in ['zero', 'linear']:
                    result = calculate_auc_py(data, r_start, r_end, mode)
                    if result:
                        auc, apex, height, pts = result
                        print(f"Mode: {mode.upper()}")
                        print(f"  Points in range: {pts}")
                        print(f"  Peak Apex Volume: {apex:.3f} mL")
                        print(f"  Peak Height: {height:.4f} mAU")
                        print(f"  AUC: {auc:.6f} mAU*mL")
