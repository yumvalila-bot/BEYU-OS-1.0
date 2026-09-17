/**
 * GENERATED FILE — do not edit; the generated content must NOT be committed.
 *
 * This module is overwritten by `scripts/build-health-spa.mjs` on every root
 * build: it compiles the EXISTING Health OS single-file SPA (`sectors/health`,
 * Vite + vite-plugin-singlefile, built with the documented
 * `VITE_API_BASE_URL=/health-os` knob) and inlines the resulting document
 * here so the governed `/health/os` route can serve it.
 *
 * The checked-in state of this file is a small truthful placeholder so that
 * typecheck/lint resolve the module before any build has run. It contains no
 * patient data and no credentials.
 */
export const healthSpaHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Health OS — BEYU OS</title>
  </head>
  <body style="margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a">
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem">
      <div style="max-width:28rem;text-align:center">
        <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Health OS bundle not compiled</h1>
        <p style="color:#475569;font-size:0.95rem;line-height:1.5">
          This document is the build-time placeholder for the compiled Health OS
          single-file SPA. Run <code>npm run build</code> (or
          <code>npm run build:health-spa</code>) in the repository to generate the
          real bundle from <code>sectors/health</code>.
        </p>
        <p style="margin-top:1.5rem">
          <a href="/launcher" style="color:#9b7410;font-size:0.9rem">Back to the BEYU launcher</a>
        </p>
      </div>
    </main>
  </body>
</html>
`;
