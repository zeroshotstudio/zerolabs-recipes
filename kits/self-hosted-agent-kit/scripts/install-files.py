#!/usr/bin/env python3
"""Install verified package files as the installer account, never the download owner."""
import os
import pathlib
import shutil
import stat
import sys
import tempfile

EXCLUDED_DIRS = {
    '.git', 'node_modules', '__pycache__', 'backups', 'state', 'data', 'logs',
    'dist', 'release', 'test-results', 'playwright-report',
}
RUNTIME_DIRS = {'backups': 0o700, 'state': 0o755}


def fail(message):
    raise ValueError(message)


def excluded(name):
    return (name in EXCLUDED_DIRS or name.endswith('.pyc')
            or (name.startswith('.env') and name != '.env.example'))


def entries(root, skip_excluded=True, protect_caches=False):
    """Do not traverse excluded directories or follow any package symlink."""
    result = []
    def omit(name):
        if protect_caches and (name == '__pycache__' or name.endswith('.pyc')):
            return False
        return skip_excluded and excluded(name)
    for directory, subdirs, files in os.walk(root, followlinks=False):
        subdirs[:] = [name for name in subdirs if not omit(name)]
        for name in subdirs + [name for name in files if not omit(name)]:
            path = pathlib.Path(directory) / name
            mode = path.lstat().st_mode
            if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                fail(f'Package paths must be ordinary files/directories, without symlinks: {path}')
            result.append(path)
    return result


def check_ancestors(destination):
    """Reject aliases and paths where another account can replace the installation."""
    chain = list(reversed(destination.parents)) + [destination]
    for index, path in enumerate(chain):
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISDIR(info.st_mode):
            fail(f'Installation path cannot contain a symlink or non-directory: {path}')
        if os.geteuid() != 0 or path == destination:
            continue
        if info.st_uid != 0:
            fail(f'Root installation requires root-owned ancestors: {path}')
        if info.st_mode & 0o022:
            # Root-owned sticky /tmp protects its root-owned direct children.
            # An operator-owned directory below /tmp does not provide that protection.
            child = chain[index + 1]
            protected = bool(info.st_mode & stat.S_ISVTX)
            if child.exists():
                protected = protected and child.lstat().st_uid == 0
            if not protected:
                fail(f'Root installation has an ancestor writable by another account: {path}')


def secure_directory(path, mode=0o755):
    path.mkdir(exist_ok=True)
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        if os.geteuid() == 0:
            os.fchown(fd, 0, 0)
        os.fchmod(fd, mode)
    finally:
        os.close(fd)


def replace_file(source, destination, mode):
    # Replace the inode, rather than truncating it. An old owner's open descriptor
    # or hardlink must not retain access to the installed executable/configuration.
    fd, temporary = tempfile.mkstemp(prefix='.install-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as output, source.open('rb') as input_file:
            shutil.copyfileobj(input_file, output)
            if os.geteuid() == 0:
                os.fchown(output.fileno(), 0, 0)
            os.fchmod(output.fileno(), mode)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def secure_runtime_file(path, mode):
    # Keep backup archive bytes and active lock inodes in place. Backups can be
    # large, and replacing .backup.lock would invalidate an in-progress lock.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fchown(fd, 0, 0)
        os.fchmod(fd, mode)
    finally:
        os.close(fd)


def install(source, destination):
    source = pathlib.Path(source).resolve(strict=True)
    destination = pathlib.Path(os.path.abspath(destination))
    if destination == pathlib.Path('/'):
        fail('Choose an empty directory or an existing Agent Kit v2 installation.')
    if source != destination and destination.is_relative_to(source):
        fail('Choose an installation directory outside the source directory.')
    check_ancestors(destination)
    package = entries(source)
    if destination.exists():
        # Source caches are excluded from copies; caches already in a same-dir
        # install must also lose the old owner's write access.
        existing = entries(destination, protect_caches=True)
        package_json = destination / 'app/package.json'
        if not package_json.exists() and any(p.name not in {'.env', '.gitkeep'} for p in destination.iterdir()):
            fail('Choose an empty directory or an existing Agent Kit v2 installation. Unrelated files were preserved.')
        if package_json.exists():
            import json
            if not str(json.loads(package_json.read_text()).get('version', '')).startswith('2.'):
                fail('Use a separate installation directory for v1 to v2 migration.')
    else:
        existing = []
    for name in ['.env', *RUNTIME_DIRS]:
        path = destination / name
        if path.is_symlink() or (path.exists() and not (path.is_file() if name == '.env' else path.is_dir())):
            fail(f'Configuration/runtime paths cannot be symlinks or special files: {path}')
    runtime_entries = {name: entries(destination / name, skip_excluded=False)
                       if (destination / name).exists() else [] for name in RUNTIME_DIRS}
    # Lock the directory hierarchy before touching files supplied by an old owner.
    for parent in reversed(destination.parents):
        if not parent.exists():
            secure_directory(parent)
    secure_directory(destination)
    for path in sorted(existing, key=lambda p: len(p.parts)):
        if path.is_dir():
            secure_directory(path)
        else:
            replace_file(path, path, 0o755 if path.stat().st_mode & 0o111 else 0o644)
    for path in sorted(package, key=lambda p: len(p.parts)):
        target = destination / path.relative_to(source)
        if path.is_dir():
            secure_directory(target)
        else:
            replace_file(path, target, 0o755 if path.stat().st_mode & 0o111 else 0o644)
    env = destination / '.env'
    if env.exists():
        replace_file(env, env, 0o600)
    for name, mode in RUNTIME_DIRS.items():
        secure_directory(destination / name, mode)
        if os.geteuid() == 0:
            for path in sorted(runtime_entries[name], key=lambda p: len(p.parts)):
                if path.is_dir():
                    secure_directory(path, mode)
                else:
                    secure_runtime_file(path, 0o600 if name == 'backups' else 0o644)
    check_ancestors(destination)
    print(destination)


if __name__ == '__main__':
    try:
        install(*sys.argv[1:])
    except (OSError, ValueError, TypeError) as error:
        sys.exit(f'Installation refused: {error}')
