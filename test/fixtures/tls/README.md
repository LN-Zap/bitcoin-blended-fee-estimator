The localhost certificate and private key are public test-only fixtures, generated for loopback TLS tests. They must never be used by a deployed server.

`blocked-public-key-cert.pem` is the public certificate from Bun v1.4.4's regression fixture, https://github.com/oven-sh/bun/blob/bun-v1.4.4/test/js/node/tls/fixtures/blocked-public-key-cert.pem (Bun is MIT licensed). Its SPKI hash is checked in the test against Bun's compiled blocklist at https://github.com/oven-sh/bun/blob/bun-v1.4.4/packages/bun-usockets/src/crypto/blocked_spkis.cpp.

The regression sends this certificate alongside an unrelated local leaf, following Bun's upstream test. It proves the real blocked-key rejection path returns CERT_REVOKED, rather than only observing that an untrusted leaf fails. It does not construct a forged chain or exercise all eight keys. Source inspection verifies the complete eight-key list. A positive local control verifies that TLS still accepts a trusted certificate.

Run `scripts/verify-tls.sh` with Docker to build and verify the production image, including both upstream providers. The default runtime uses Bun's bundled roots plus its compiled SPKI blocklist; no system-CA option is required.
