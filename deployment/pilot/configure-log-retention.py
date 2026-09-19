"""Run as root on the Nomuvia host; preserve package hooks and back up config."""
from pathlib import Path
import datetime
import shutil
import subprocess
import re

paths = [Path('/etc/logrotate.d') / name for name in
         ('rsyslog', 'ufw', 'postgresql-common', 'btmp', 'wtmp', 'tour-pilot')]
dropin = Path('/etc/systemd/journald.conf.d/nomuvia-retention.conf')
backup = Path('/root/nomuvia-retention-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f'))
backup.mkdir(mode=0o700)
originals = {p: p.read_bytes() if p.exists() else None for p in [*paths, dropin]}
for index, (p, content) in enumerate(originals.items()):
    if content is not None:
        (backup / str(index)).write_bytes(content)
(backup / 'paths.txt').write_text('\n'.join(str(p) for p in originals))

try:
    for p in paths:
        content = p.read_text()
        days = 7 if p.name == 'tour-pilot' else 30
        content = re.sub(r'(?m)^\s*(?:weekly|monthly|daily)\s*$', '    daily', content)
        content = re.sub(r'(?m)^\s*rotate\s+\d+\s*$', f'    rotate {days}', content)
        content = re.sub(r'(?m)^\s*(?:notifempty|ifempty|minsize\s+\S+|maxage\s+\d+)\s*$', '', content)
        content = content.replace('{', '{\n    ifempty\n    maxage ' + str(days), 1)
        p.write_text(content)
    dropin.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(Path(__file__).with_name('journald-retention.conf'), dropin)
    subprocess.run(['logrotate', '--debug', '/etc/logrotate.conf'], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    subprocess.run(['systemctl', 'restart', 'systemd-journald'], check=True)
    subprocess.run(['systemctl', 'is-active', '--quiet', 'systemd-journald'], check=True)
except BaseException:
    for p, content in originals.items():
        if content is None:
            p.unlink(missing_ok=True)
        else:
            p.write_bytes(content)
    subprocess.run(['systemctl', 'restart', 'systemd-journald'], check=False)
    raise
print('Retention configuration installed; original configuration in', backup)
