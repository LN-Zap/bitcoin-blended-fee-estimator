import { expect, test } from "bun:test";
import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

const fixture = (name: string) =>
  readFileSync(`${import.meta.dir}/fixtures/tls/${name}`, "utf8");

test("bundled trust excludes the three removed emSign roots", () => {
  const subjects = rootCertificates.map(
    (pem) => new X509Certificate(pem).subject,
  );
  for (const name of [
    "emSign ECC Root CA - G3",
    "emSign Root CA - C1",
    "emSign ECC Root CA - C3",
  ]) {
    expect(
      subjects.some((subject) => subject.split("\n").includes(`CN=${name}`)),
    ).toBe(false);
  }
});

test("fetch rejects a peer carrying a real compromised eMudhra key with CERT_REVOKED", async () => {
  const blocked = fixture("blocked-public-key-cert.pem");
  const spki = new X509Certificate(blocked).publicKey.export({
    type: "spki",
    format: "der",
  });
  expect(createHash("sha256").update(spki).digest("hex")).toBe(
    "49dd353dc2b919a3770645117d0e60c16115e7d1bc259eefe734b00ea434fe5f",
  );
  // Like Bun's upstream regression: an untrusted local leaf plus the actual
  // compromised certificate. No compromised private key or external server.
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: {
      key: fixture("localhost-key.pem"),
      cert: fixture("localhost-cert.pem") + "\n" + blocked,
    },
    fetch: () => new Response("must not be accepted"),
  });
  try {
    await expect(
      fetch(`https://127.0.0.1:${server.port}`, {
        signal: AbortSignal.timeout(5000),
      }),
    ).rejects.toMatchObject({ code: "CERT_REVOKED" });
  } finally {
    server.stop(true);
  }
});

test("fetch accepts the local control certificate when explicitly trusted", async () => {
  const cert = fixture("localhost-cert.pem");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    tls: { key: fixture("localhost-key.pem"), cert },
    fetch: () => new Response("control accepted"),
  });
  try {
    const response = await fetch(`https://127.0.0.1:${server.port}`, {
      tls: { ca: cert },
      signal: AbortSignal.timeout(5000),
    });
    expect(await response.text()).toBe("control accepted");
  } finally {
    server.stop(true);
  }
});
