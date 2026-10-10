#!/usr/bin/env python3
"""Small, non-executing reader for kit-owned dotenv configuration."""
import os, pathlib, re, secrets, sys
root = pathlib.Path(os.environ.get('ROOT', pathlib.Path(__file__).resolve().parent.parent))
def read(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            match = re.match(r'^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$', line)
            if match:
                value = match[2].strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'": value = value[1:-1]
                elif ' #' in value: value = value.split(' #', 1)[0].rstrip()
                result[match[1]] = value
    return result
if sys.argv[1] == 'get':
    print(read(root / '.env').get(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ''))
elif sys.argv[1] == 'init':
    path = root / '.env'
    if path.exists():
        values = read(path)
        for key, minimum in [('POSTGRES_ADMIN_PASSWORD',24),('DB_PASSWORD',24),('ADMIN_TOKEN',32)]:
            if len(values.get(key,'')) < minimum or re.search('REPLACE_ME|CHANGEME', values.get(key,''), re.I):
                sys.exit(f'{key} is missing or insecure in existing .env. Existing configuration was preserved; fix it before starting.')
    else:
        text = (root / '.env.example').read_text()
        for key in ['POSTGRES_ADMIN_PASSWORD','DB_PASSWORD','ADMIN_TOKEN']:
            text = text.replace(f'{key}=REPLACE_ME', f'{key}={secrets.token_hex(32)}')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd,'w') as f: f.write(text)
    path.chmod(0o600)
else: sys.exit('Usage: config.py get KEY [default] | init')
