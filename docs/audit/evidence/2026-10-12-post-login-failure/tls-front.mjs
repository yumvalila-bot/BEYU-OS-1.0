/**
 * Minimal TLS front door for the screenshot harness.
 *
 * WHY: the session cookie is `Secure` in production mode (and forced `Secure`
 * whenever a canonical cookie domain is configured — see
 * src/lib/session-cookie.ts). A real browser therefore refuses to STORE it over
 * plain HTTP, so the browser-form sign-in flow cannot be captured on
 * http://…:3100. This proxy serves the same Next.js server over HTTPS with a
 * throwaway self-signed certificate (valid for the canonical hostnames only)
 * and forwards the ORIGINAL canonical Host header plus the standard
 * X-Forwarded-* facts. The application is unchanged: same build, same port,
 * same cookie policy, same authorization.
 */
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";

const PORT = 8443;

createServer(
  {
    key: readFileSync("/tmp/proxy-key.pem"),
    cert: readFileSync("/tmp/proxy-cert.pem"),
  },
  (req, res) => {
    // Strip the :8443 port so the application resolves the CANONICAL hostname
    // exactly as it does in production behind TLS termination.
    const hostname = (req.headers.host ?? "").split(":")[0];
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: 3100,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: hostname,
          "x-forwarded-proto": "https",
          "x-forwarded-host": hostname,
          "x-forwarded-port": "8443",
        },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("upstream unavailable");
    });
    req.pipe(upstream);
  },
).listen(PORT, "127.0.0.1", () => console.log(`tls front door on https://127.0.0.1:${PORT} -> http://127.0.0.1:3100`));
