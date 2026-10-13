#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
require_tools docker python3
compose ps
compose exec -T api node -e "fetch('http://127.0.0.1:3000/health/ready').then(async r=>{console.log(JSON.stringify(await r.json(),null,2));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
