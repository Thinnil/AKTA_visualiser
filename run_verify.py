import os
import subprocess
import shutil

test_js = """
<script>
window.addEventListener('load', () => {
    try {
        if (!window.COLUMN_CALIBRATION_PRESETS) {
            throw new Error('window.COLUMN_CALIBRATION_PRESETS is undefined');
        }
        const keys = Object.keys(window.COLUMN_CALIBRATION_PRESETS);
        
        // 1. Superdex 200 Fit
        window.columnCalibrationState.enabled = true;
        window.fitColumnCalibration();
        const mw13 = window.predictApparentSecMw(13.0);

        // 2. Custom min-based Fit (70 kDa at 26 min at 0.5 mL/min = 13.0 mL)
        window.columnCalibrationState.preset = 'custom';
        window.columnCalibrationState.unit = 'min';
        window.columnCalibrationState.flowRate = 0.5;
        window.columnCalibrationState.points = [
            { active: true, name: 'Std A', mw: 669, volume: 17.0 },
            { active: true, name: 'Std B', mw: 70, volume: 26.0 },
            { active: true, name: 'Std C', mw: 13.7, volume: 35.0 }
        ];
        window.fitColumnCalibration();
        const mwCustom = window.predictApparentSecMw(13.0); // 13.0 mL = 26.0 min -> ~70 kDa

        document.title = 'TEST_PASSED_OK: Presets=' + keys.length + ', S200=' + Math.round(mw13) + 'kDa, Custom=' + Math.round(mwCustom) + 'kDa';
    } catch(e) {
        document.title = 'TEST_FAILED: ' + e.message;
    }
});
</script>
"""

with open(r'E:\Programs\antigravity\Akta_visualizer\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

scratch_dir = r'C:\Users\g_san\.gemini\antigravity\brain\c8f0157f-1b6e-4352-bf19-a3b517c73fa3\scratch'
os.makedirs(scratch_dir, exist_ok=True)

# Copy app.js and styles.css so relative paths work
shutil.copy(r'E:\Programs\antigravity\Akta_visualizer\app.js', os.path.join(scratch_dir, 'app.js'))
shutil.copy(r'E:\Programs\antigravity\Akta_visualizer\styles.css', os.path.join(scratch_dir, 'styles.css'))

test_html = html.replace('</body>', test_js + '\n</body>')
test_path = os.path.join(scratch_dir, 'test_runner.html')
with open(test_path, 'w', encoding='utf-8') as f:
    f.write(test_html)

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
cmd = [edge, '--headless', '--dump-dom', test_path]
proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
for line in proc.stdout.splitlines():
    if '<title>' in line:
        print('Page title:', line.strip())
