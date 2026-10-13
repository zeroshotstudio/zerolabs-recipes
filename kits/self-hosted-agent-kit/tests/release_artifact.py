"""Validate and extract the exact customer bundle before runtime acceptance."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile


def extract_verified_bundle(archive, destination, version):
    archive, destination = Path(archive), Path(destination)
    checksums = {}
    for line in (archive.parent / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert name not in checksums, 'Duplicate checksum entry'
        checksums[name] = digest
    assert checksums[archive.name] == hashlib.sha256(archive.read_bytes()).hexdigest()
    digest_file = archive.parent / 'CODEBASE_DIGEST.md'
    assert checksums[digest_file.name] == hashlib.sha256(digest_file.read_bytes()).hexdigest()
    prefix = 'self-hosted-agent-kit/'
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entry'
        manifest = json.loads(bundle.read(prefix + 'RELEASE-MANIFEST.json'))
        assert manifest['product'] == 'ZeroLabs Agent Kit' and manifest['version'] == version
        entries = {entry['path']: entry for entry in manifest['files']}
        assert len(entries) == len(manifest['files']), 'Duplicate manifest entry'
        expected = set(entries) | {'RELEASE-MANIFEST.json', 'CODEBASE_DIGEST.md'}
        assert set(names) == {prefix + name for name in expected}, 'Unexpected or missing ZIP member'
        assert bundle.read(prefix + 'CODEBASE_DIGEST.md') == digest_file.read_bytes()
        for info in bundle.infolist():
            path = PurePosixPath(info.filename)
            assert not path.is_absolute() and '..' not in path.parts and info.filename.startswith(prefix)
            assert stat.S_ISREG(info.external_attr >> 16), 'Non-regular ZIP member'
            relative = info.filename[len(prefix):]
            excluded = {'.git', 'node_modules', 'state', 'backups', 'data', 'logs', 'dist', 'release',
                        '__pycache__', 'test-results', 'playwright-report'}
            assert not any(part in excluded for part in path.parts)
            assert path.suffix not in {'.pyc', '.log', '.zip', '.pdf', '.png'}
            assert not any(part.startswith('.env') and part != '.env.example' for part in path.parts)
            mode = 0o755 if relative.endswith('.sh') else 0o644
            assert stat.S_IMODE(info.external_attr >> 16) == mode
            data = bundle.read(info)
            if relative in entries:
                entry = entries[relative]
                assert entry['bytes'] == len(data)
                assert entry['sha256'] == hashlib.sha256(data).hexdigest()
                assert entry['mode'] == f'{mode:04o}'
            target = destination.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(mode)
    assert json.loads((destination / prefix / 'app/package.json').read_text())['version'] == version
    return destination / 'self-hosted-agent-kit'
