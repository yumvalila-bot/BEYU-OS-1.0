/**
 * BEYU OS — the pinned Supabase CA trust anchors, embedded as source.
 *
 * WHY EMBEDDED RATHER THAN READ FROM DISK
 *   These certificates are PUBLIC, non-secret material. Reading them from
 *   config/tls/supabase/*.crt at runtime would make the production trust store
 *   depend on the deployment bundler copying an unreferenced directory — an
 *   assumption that cannot be verified from a development sandbox, and whose
 *   failure mode is an outage ("CA bundle directory not found"). Embedding them
 *   removes that entire failure class: the anchors are part of the compiled
 *   bundle, exactly like any other constant.
 *
 *   The .crt files in config/tls/supabase/ remain the canonical provenance
 *   artifact. A test asserts that every PEM below is byte-identical to its .crt
 *   file and that its recomputed SHA-256 equals the approved allowlist, so the
 *   two can never silently diverge.
 *
 * NEVER put a private key in this file. A CA certificate is public.
 *
 * Provenance, full field listing and the rotation procedure:
 *   config/tls/supabase/README.md
 */

export type EmbeddedTrustAnchor = {
  label: string;
  /** SHA-256 over the DER encoding; lowercase hex, no separators. */
  fingerprintSha256: string;
  pem: string;
};

export const SUPABASE_TRUST_ANCHOR_PEMS: readonly EmbeddedTrustAnchor[] = [
  {
    label: "prod-ca-2021",
    fingerprintSha256: "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
    // subject=C = US, ST = Delware, L = New Castle, O = Supabase Inc, CN = Supabase Root 2021 CA | notBefore=Apr 28 10:56:53 2021 GMT | notAfter=Apr 26 10:56:53 2031 GMT | serial=6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6
    pem: `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----\n`,
  },
  {
    label: "prod-ca-2025",
    fingerprintSha256: "5f9b77951a7aa1303f9b58eea9bfa89e358cfdc15f9786ff10d4930a722c9ae2",
    // subject=C = US, ST = Delware, L = New Castle, O = Supabase Inc, CN = Supabase Root 2021 CA | notBefore=Sep  3 08:01:25 2025 GMT | notAfter=Sep  1 08:01:25 2035 GMT | serial=797FA0A5F9AC456F5AB05911BE3C978C7C5B7E07
    pem: `-----BEGIN CERTIFICATE-----
MIIDxzCCAq+gAwIBAgIUeX+gpfmsRW9asFkRvjyXjHxbfgcwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTI1MDkwMzA4MDEyNVoXDTM1MDkwMTA4MDEyNVow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5Ve7
i9UAmc7luUilELPtqzEk8nGHxg7nY0aCStr625M7+K4OPO6RUllTsHh47k1jWyzm
LXLlyYwCsYCjQp+3vn06H+F/HRUxBt6CK2B7bNng230exTunk0xFvfkX6YgHR7B3
1B7L25Rq3PhuRFPV4hnGYRam2XBZC4UNPqoAgrhV0HOYzXXAVoTr2yaBTMnB331Z
RwOmINh7eqTCk/JRZbb6vfZOhZRAVAe9AoRLoG8aKwmeoLGwlu0UuFx6z3E+6bmA
fSNa8Lx02GEoCdPLw9IRKUFq/SgBpQUKm44H1fDwTjH2CMM0N4p0mL/6wXnNeHvt
C40MmKZ0RcVmHE5wBwIDAQABo2MwYTAdBgNVHQ4EFgQUjvEE541toZcwtXQlZlcB
YOBRTnowHwYDVR0jBBgwFoAUjvEE541toZcwtXQlZlcBYOBRTnowDwYDVR0TAQH/
BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAYYwDQYJKoZIhvcNAQELBQADggEBACD5IcGP
XKvS9qg0CgEQPFqYavt5c7P+0xxFgiZe+xoG8fUw58yNeK2APtgGPRpxEOGfAlNx
z9HDt4gcyHEE00B3qAVDm49pqNxioFWzNqU2LGfM/HL1QmN6urR7hCOkVCJddvOc
FhFX4nZDuRfaBboDvS5HlK3Pzxddp9hvrJi2bemr8HLqYc3HzmVckgPGSLML6t+h
4LRCXSlQsDgQ1LZ4KHsl4cq7K51N6FOXQBLB5q4lMKhs0VUhCT8Pdsj12+84laCV
c22q6p2mdT9SaernCSRnWazXWisgpjv3H7Ex4S1DCYjJIwn3PUToGFv1r8YRN2/S
O19yVSxxCIf64Sg=
-----END CERTIFICATE-----\n`,
  },
] as const;
