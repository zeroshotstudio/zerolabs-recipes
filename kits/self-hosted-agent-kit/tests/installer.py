#!/usr/bin/env python3
"""Exercise the real installer and UID boundaries without Docker/services/secrets.

Run with sudo on Linux, or in an isolated Python/Debian container as root.
All writes stay inside one temporary directory; no systemd unit is installed.
"""
import fcntl
import os
import pathlib
import py_compile
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OMIT = {'.git', 'node_modules', '__pycache__', 'backups', 'state', 'data',
        'logs', 'dist', 'release', 'test-results', 'playwright-report'}


def copy_source(destination):
    def ignore(directory, names):
        return [name for name in names if name in OMIT or name.endswith('.pyc')
                or (name.startswith('.env') and name != '.env.example')]
    shutil.copytree(ROOT, destination, ignore=ignore)


def run(source, destination, ok=True, uid=None):
    def drop_uid():
        os.setgroups([])
        os.setgid(uid)
        os.setuid(uid)
    result = subprocess.run(
        ['bash', str(source / 'scripts/setup.sh'), '--dest', str(destination), '--no-start', '--no-timer'],
        text=True, capture_output=True, preexec_fn=drop_uid if uid is not None else None,
    )
    if ok:
        assert result.returncode == 0, result.stderr
    else:
        assert result.returncode != 0, 'Unsafe installation unexpectedly succeeded'
    return result


def ownership(root, uid):
    for path in [root, *root.rglob('*')]:
        if path.is_symlink():
            continue
        os.chown(path, uid, uid)


def denied_mutations(install, parent):
    # This subprocess has no root groups/capabilities. Both writes and replacement
    # attempts must fail, even though every source file belonged to this account.
    probe = r'''
import os,pathlib,sys
p=pathlib.Path(sys.argv[1]);parent=pathlib.Path(sys.argv[2])
actions=[lambda name=name: (p/name).open('ab') for name in [
    'scripts/backup.sh','scripts/lib.sh','scripts/config.py','docker-compose.yml','.env',
    'backups/retained.tar.gz','state/backup-status.json','scripts/secrets.pyc']]
actions += [lambda: (p/'scripts/new-script.sh').write_text('replacement'),
            lambda: os.rename(p/'scripts',p/'replaced-scripts'),
            lambda: os.rename(p,parent/'replaced-install'),
            lambda: (p/'.env').read_bytes()]
for action in actions:
    try: action()
    except PermissionError: continue
    raise AssertionError('Unprivileged account can mutate/replace root installation')
'''
    def drop_uid():
        os.setgroups([])
        os.setgid(1000)
        os.setuid(1000)
    result = subprocess.run(['python3', '-c', probe, str(install), str(parent)],
                            capture_output=True, text=True, preexec_fn=drop_uid)
    assert result.returncode == 0, result.stderr


def check_root_tree(install):
    for path in [install, *install.rglob('*')]:
        if any(part in OMIT - {'backups', 'state', '__pycache__'} for part in path.relative_to(install).parts):
            continue
        info = path.stat()
        assert info.st_uid == info.st_gid == 0, path
        assert not info.st_mode & 0o022, path
    assert (install / '.env').stat().st_mode & 0o777 == 0o600
    assert (install / 'backups').stat().st_mode & 0o777 == 0o700
    assert (install / 'scripts/backup.sh').stat().st_mode & 0o111


def poisoned_caches(install, temp):
    source = temp / 'poison.py'
    source.write_text("import os\nwith open(os.environ['IMPORT_MARKER'], 'a') as f: f.write(str(os.geteuid()))\nraise RuntimeError('Untrusted import cache executed')\n")
    cache = install / 'scripts/__pycache__'
    cache.mkdir()
    for destination in [install / 'scripts/secrets.pyc', install / 'scripts/pathlib.pyc',
                        install / 'scripts/json.pyc', install / 'json.pyc', cache / 'legacy.pyc']:
        py_compile.compile(str(source), cfile=str(destination), doraise=True)
    return source


def timer_backup_path(install, temp):
    # Execute the root timer's actual ExecStart script. A fixture Docker CLI emits
    # a fake dump; the kit's archive/checksum/config/lock paths execute unchanged.
    fixture_bin = temp / 'fixture-bin'
    fixture_bin.mkdir()
    docker = fixture_bin / 'docker'
    docker.write_text('''#!/usr/bin/env bash
set -eu
if [[ "$*" == *pg_dump* ]]; then
  printf 'PGDMP isolated installer regression dump bytes; not a database backup'
elif [[ "$*" == *pg_restore* ]]; then
  cat >/dev/null
else
  echo 'Unexpected fixture Docker request' >&2
  exit 1
fi
''')
    docker.chmod(0o755)
    import_path = temp / 'untrusted-imports'
    import_path.mkdir()
    shutil.copyfile(temp / 'poison.py', import_path / 'json.py')
    ownership(import_path, 1000)
    marker = temp / 'import-marker'
    environment = dict(os.environ, PATH=str(fixture_bin) + os.pathsep + os.environ['PATH'],
                       PYTHONPATH=str(import_path), IMPORT_MARKER=str(marker))
    result = subprocess.run(['bash', str(install / 'scripts/backup.sh')], cwd=install,
                            env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert 'Verified backup:' in result.stdout
    assert not marker.exists(), 'Root timer path imported an untrusted local/cache/PYTHONPATH module'


def main():
    if os.geteuid() != 0:
        raise SystemExit('Installer ownership tests require root: sudo python3 tests/installer.py')
    with tempfile.TemporaryDirectory(prefix='agentkit-installer-') as directory:
        temp = pathlib.Path(directory)
        temp.chmod(0o755)
        source = temp / 'download'
        copy_source(source)
        ownership(source, 1000)
        install = temp / 'installed'
        run(source, install)
        saved = (install / '.env').read_bytes()
        assert not (source / '.env').exists()
        (install / 'backups/retained.tar.gz').write_bytes(b'private archive contents')
        (install / 'state/backup-status.json').write_text('{"status":"verified"}')
        backup_lock = (install / 'backups/.backup.lock').open('wb')
        fcntl.flock(backup_lock, fcntl.LOCK_EX)
        lock_inode = os.fstat(backup_lock.fileno()).st_ino
        poisoned_caches(install, temp)
        # Recreate ownership from the vulnerable installer, including a hardlink
        # held by the old owner. The fixed reinstall must replace that inode.
        ownership(install, 1000)
        alias = source / 'old-backup-alias.sh'
        os.link(install / 'scripts/backup.sh', alias)
        run(install, install)
        assert (install / '.env').read_bytes() == saved
        assert (install / 'backups/retained.tar.gz').read_bytes() == b'private archive contents'
        assert (install / 'backups/.backup.lock').stat().st_ino == lock_inode
        with (install / 'backups/.backup.lock').open('rb') as competing_lock:
            try:
                fcntl.flock(competing_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                pass
            else:
                raise AssertionError('Reinstall invalidated the active backup lock')
        backup_lock.close()
        check_root_tree(install)
        denied_mutations(install, temp)
        installed_backup = (install / 'scripts/backup.sh').read_bytes()
        alias.write_text('old descriptor/link cannot alter installed code\n')
        assert (install / 'scripts/backup.sh').read_bytes() == installed_backup
        timer_backup_path(install, temp)
        print('PASS root fresh/same-directory install removes old owner access and detaches old inodes')
        print('PASS root timer backup ignores retained sourceless caches and untrusted PYTHONPATH')

        update = temp / 'update'
        copy_source(update)
        ownership(update, 1000)
        (update / 'README.md').write_text('updated package\n')
        (update / '.env').write_text('download secrets must not be copied\n')
        run(update, install)
        assert (install / 'README.md').read_text() == 'updated package\n'
        assert (install / '.env').read_bytes() == saved
        check_root_tree(install)
        denied_mutations(install, temp)
        print('PASS update copy secures trusted code/configuration and preserves credentials/runtime data')

        writable = temp / 'writable'
        writable.mkdir(mode=0o777)
        writable.chmod(0o777)
        assert 'writable' in run(source, writable / 'kit', ok=False).stderr
        assert not (writable / 'kit').exists()
        writable.chmod(0o755)
        os.chown(writable, 1000, 1000)
        assert 'root-owned ancestors' in run(source, writable / 'kit', ok=False).stderr
        print('PASS root installs reject writable and operator-owned ancestors before creating files')

        outside = temp / 'outside'
        outside.mkdir()
        marker = outside / 'keep'
        marker.write_text('preserved')
        link = temp / 'alias'
        link.symlink_to(outside, target_is_directory=True)
        run(source, link, ok=False)
        run(source, link / 'kit', ok=False)
        assert marker.read_text() == 'preserved' and not (outside / 'kit').exists()
        (install / 'scripts/unsafe-link').symlink_to(marker)
        run(source, install, ok=False)
        (install / 'scripts/unsafe-link').unlink()
        (source / 'scripts/unsafe-link').symlink_to(marker)
        run(source, temp / 'unsafe-source', ok=False)
        assert not (temp / 'unsafe-source').exists()
        (source / 'scripts/unsafe-link').unlink()
        (install / 'backups/unsafe-link').symlink_to(marker)
        run(source, install, ok=False)
        (install / 'backups/unsafe-link').unlink()
        assert marker.read_text() == 'preserved'
        print('PASS symlinked destinations, ancestors, package files and runtime paths fail safely')

        home = temp / 'operator-home'
        home.mkdir(mode=0o700)
        ownership(home, 1000)
        local = home / 'kit'
        run(source, local, uid=1000)
        local_env = (local / '.env').read_bytes()
        run(local, local, uid=1000)
        assert (local / '.env').read_bytes() == local_env
        assert all(path.stat().st_uid == 1000 for path in [local, *local.rglob('*')])
        print('PASS deliberate unprivileged installs retain operator ownership and private credentials')


if __name__ == '__main__':
    main()
