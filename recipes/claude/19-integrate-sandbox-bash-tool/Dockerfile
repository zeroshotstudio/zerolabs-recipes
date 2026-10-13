# syntax=docker/dockerfile:1
FROM bash:5.3.20@sha256:61962062d969cb46dfc2bad061d36342406fa485f64f246aa7e95693ca07df1f
# Exact Alpine security revisions required by the release vulnerability scan.
# A managed proxy CA may be mounted for this step; it is never copied into a layer.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    apk add --no-cache libcrypto3=3.5.9-r0 libssl3=3.5.9-r0 zlib=1.3.2-r1
USER 65534:65534
WORKDIR /workspace
