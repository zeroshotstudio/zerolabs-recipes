# Container image security

The release builds three local images from immutable official Node 22, PostgreSQL 17 and Caddy 2 base image digests. The Dockerfiles pin the added Alpine security revisions: `libcrypto3=3.5.9-r0`, `libssl3=3.5.9-r0` and `zlib=1.3.2-r1`. These versions were available from Alpine when the corresponding official image tags still contained older versions. Missing pinned packages fail the build; they do not trigger an unbounded package upgrade.

The application installs its locked dependencies in a separate stage. The final stage removes npm, npx, Corepack, Yarn and their global dependency trees. Caddy 2.11.7 is rebuilt with the pinned Go 1.27.2 image and committed `caddy/go.mod` and `caddy/go.sum`; `golang.org/x/net` is pinned to 0.60.0 to include the October HTTP/2 fixes. It retains Caddy's standard modules and official runtime layout. Unused curl and its nghttp2 dependency are removed. PostgreSQL retains the official entrypoint, user switching and data directory layout. Rebuild all images when preparing a restore: `docker compose build`.

An optional `proxy_ca` BuildKit secret supports managed HTTPS build proxies. It is mounted only during network steps, never copied into a layer or configured in a runtime environment variable. TLS certificate verification remains enabled.

## Scan evidence and remaining advisories

The remediation scan used Grype 0.120.1 and its database built on 2026-10-11, on Linux amd64. Before remediation the application had 51 matches (20 High), PostgreSQL 31 (9 High), and Caddy 49 (3 Critical, 20 High). The rebuilt application has 3 Medium matches, PostgreSQL 4 Medium matches and Caddy 3 Medium matches; no detected High or Critical matches remain. Recipe 19's separately built Bash sandbox image has 3 Medium matches and no detected High or Critical matches. Counts are package/advisory matches, so one CVE can appear multiple times.

The remaining matches are retained without scanner ignore rules:

| Advisory | Component | Exposure and follow-up |
| --- | --- | --- |
| [CVE-2025-60876](https://nvd.nist.gov/vuln/detail/CVE-2025-60876) | BusyBox wget, reported for `busybox`, `busybox-binsh` and `ssl_client` | Request header injection requires passing an attacker-controlled URL containing raw control bytes to wget. The kit uses wget only for Caddy's constant localhost health URL. Application HTTP requests use Node fetch. Recipe 19 disables sandbox networking. Track the Alpine/BusyBox fix and rescan on update. |
| [GHSA-mjcv-p78q-w5fw](https://github.com/moby/sys/security/advisories/GHSA-mjcv-p78q-w5fw) / CVE-2026-61801 | PostgreSQL's gosu includes `github.com/moby/sys/user` 0.1.0 | Unbounded parsing can exhaust memory when user/group database files are attacker-controlled. The official entrypoint reads image-owned account files; the kit mounts PostgreSQL data, not `/etc/passwd` or `/etc/group`. Track an official PostgreSQL/gosu update with module 0.4.1 or later. |

The scanner does **not** inventory Node's statically embedded OpenSSL accurately. Node 22.23.3 reports embedded OpenSSL 3.5.8; updating Alpine's shared libraries does not replace that copy. The [OpenSSL 2026-09-29 advisory](https://openssl-library.org/news/secadv/20260929.txt) includes CVE-2026-84782 (vendor High, DTLS retransmission) and vendor Low issues in QUIC, optional CRL/CMP handling, selected elliptic curves, and TLS server context switching. This product uses Node for HTTP and outbound HTTPS/TCP, exposes no OpenSSL DTLS or QUIC interface, and terminates incoming HTTPS in Caddy. No scanner suppression or claim that the embedded library is patched is made. Adopt a supported Node 22 release containing OpenSSL 3.5.9 or a later fixed version when upstream publishes it, then rebuild, rescan and rerun acceptance.

Run an updated scanner against the actual built images before release, preserving JSON evidence and database timestamp:

```sh
docker compose build
grype zerolabs-agentkit:2.0.0 --fail-on high -o json > app-image-audit.json
grype zerolabs-agentkit-postgres:2.0.0 --fail-on high -o json > postgres-image-audit.json
grype zerolabs-agentkit-caddy:2.0.0 --fail-on high -o json > caddy-image-audit.json
```

Inspect every result, including Medium and Unknown findings. npm audits, image scans and protocol reachability checks have different coverage; none establishes that the entire product or host is vulnerability-free. The run described here does not establish arm64 results or patch the customer's Docker daemon, kernel or host packages.
