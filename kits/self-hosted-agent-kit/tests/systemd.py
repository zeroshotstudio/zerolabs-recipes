#!/usr/bin/env python3
import os,pathlib,shutil,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parent.parent
if not shutil.which('systemd-analyze'):raise SystemExit('systemd-analyze is required for unit validation')
with tempfile.TemporaryDirectory() as tmp:
    tmp=pathlib.Path(tmp)
    # Dependency stub permits static validation on Docker hosts without systemd PID 1.
    (tmp/'docker.service').write_text('[Service]\nType=oneshot\nExecStart=/bin/true\n')
    for src in (root/'systemd').glob('agentkit-*'):(tmp/src.name).write_text(src.read_text().replace('@INSTALL_DIR@',str(root)))
    env={**os.environ,'SYSTEMD_UNIT_PATH':str(tmp)+':/lib/systemd/system:/usr/lib/systemd/system'}
    subprocess.run(['systemd-analyze','verify',str(tmp/'agentkit-backup.service'),str(tmp/'agentkit-backup.timer')],check=True,env=env)
print('PASS systemd unit syntax and dependencies (Docker dependency stub; not a live timer test)')
