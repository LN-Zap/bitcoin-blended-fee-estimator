import { getCACertificates, rootCertificates } from "node:tls";
import { strict as assert } from "node:assert";

assert.equal(Bun.version, "1.4.4");
const bundled = getCACertificates("bundled");
const effective = getCACertificates("default");
assert.deepEqual(bundled, rootCertificates);
console.log(
  JSON.stringify({
    bun: Bun.version,
    bundled: bundled.length,
    effective: effective.length,
    systemCA: process.env.NODE_USE_SYSTEM_CA ?? "unset",
    extraCA: process.env.NODE_EXTRA_CA_CERTS ?? "unset",
    execArgv: process.execArgv,
  }),
);
for (const host of ["mempool.space", "blockstream.info"]) {
  const response = await fetch(`https://${host}/api/blocks/tip/height`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^\d+$/);
  console.log(`${host}: HTTPS 200, valid height`);
}
