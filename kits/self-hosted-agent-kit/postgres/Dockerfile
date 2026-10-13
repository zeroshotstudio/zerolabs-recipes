# syntax=docker/dockerfile:1
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
# Preserve the official entrypoint and PGDATA layout while applying exact
# security revisions not yet included in the upstream image digest.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    apk add --no-cache libcrypto3=3.5.9-r0 libssl3=3.5.9-r0 zlib=1.3.2-r1
