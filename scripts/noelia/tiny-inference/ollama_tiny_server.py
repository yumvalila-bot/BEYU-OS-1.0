#!/usr/bin/env python3
"""
An Ollama-API-compatible inference server backed by a REAL neural network.

This is a MECHANISM TEST, and it says so in every response.

What it serves
--------------
`/api/tags` and `/api/chat`, the two endpoints `src/lib/noelia/ollama-provider.ts`
actually calls, implemented against the same request and response shapes the
real runtime uses. The generation is a genuine forward pass through the
transformer-like network trained by `train_tiny_model.py` — embeddings, an
attention gate and an output projection running on real weights. It is not a
canned reply: the tokens are produced by the model.

What it is not
--------------
It is not Ollama, and it does not pretend to be. The reported model name and the
`system_fingerprint` field both carry a `SIMULATED_` / `tiny-neural` marker so
that no audit record can later be mistaken for evidence that a production model
ran. `verifyInference()` in the adapter is what confirms the round-trip; this
server exists so that round-trip can be executed without a weight download.

Run:
    python3 train_tiny_model.py
    python3 ollama_tiny_server.py --port 11434
"""
import argparse
import json
import math
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noelia-tiny-model.json")
SERVED_MODEL = "noelia-tiny-neural:mechanism-test"


def load_model(path=MODEL_FILE):
    with open(path) as f:
        a = json.load(f)
    return a


def forward(a, ids):
    emb = a["weights"]["emb"]
    wq, wk, wv, w_out = (a["weights"][k] for k in ("wq", "wk", "wv", "w_out"))
    V = a["dims"]["vocab"]
    D = a["dims"]["emb"]
    ctx = [0.0] * D
    for i in ids:
        for d in range(D):
            ctx[d] += emb[i][d]
    n = max(len(ids), 1)
    ctx = [c / n for c in ctx]
    q = [sum(wq[i][j] * ctx[j] for j in range(D)) for i in range(D)]
    k = [sum(wk[i][j] * ctx[j] for j in range(D)) for i in range(D)]
    v = [sum(wv[i][j] * ctx[j] for j in range(D)) for i in range(D)]
    score = sum(q[d] * k[d] for d in range(D)) / math.sqrt(D)
    gate = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, score))))
    hid = [gate * v[d] + (1.0 - gate) * ctx[d] for d in range(D)]
    logits = [sum(hid[d] * w_out[d][o] for d in range(D)) for o in range(V)]
    return logits


def generate(a, prompt_ids, max_tokens=16):
    """Autoregressive decoding — each token is a real forward pass."""
    vocab = a["vocab"]
    stoi = {w: i for i, w in enumerate(vocab)}
    unk = stoi.get("<unk>", 1)
    ids = list(prompt_ids)
    out = []
    for _ in range(max_tokens):
        logits = forward(a, ids[-32:])
        best = max(range(len(logits)), key=lambda i: logits[i])
        tok = vocab[best]
        if tok in ("<pad>", "<unk>"):
            break
        out.append(tok)
        ids.append(best)
    return out


def make_handler(model):
    stoi = {w: i for i, w in enumerate(model["vocab"])}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass  # keep stdout clean for the test harness

        def _send(self, code, payload):
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.startswith("/api/tags"):
                self._send(200, {
                    "models": [{
                        "name": SERVED_MODEL,
                        "model": SERVED_MODEL,
                        "modified_at": "2026-11-25T00:00:00Z",
                        "size": os.path.getsize(MODEL_FILE),
                        "digest": "tiny-neural-mechanism-test",
                        "details": {
                            "format": "tiny-neural",
                            "family": "noelia-mechanism-test",
                            "parameter_size": f"{model['dims']['vocab'] * model['dims']['emb']}",
                            "quantization_level": "F32",
                        },
                    }]
                })
                return
            self._send(404, {"error": "not found"})

        def do_HEAD(self):
            self.send_response(200)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):
            if not self.path.startswith("/api/chat"):
                self._send(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                req = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid json"})
                return

            messages = req.get("messages") or []
            text = " ".join(str(m.get("content", "")) for m in messages)
            prompt_ids = [stoi.get(t, 1) for t in text.lower().split()] or [1]
            max_tokens = int((req.get("options") or {}).get("num_predict") or 16)
            tokens = generate(model, prompt_ids, max_tokens=min(max_tokens, 64))
            content = " ".join(tokens)
            self._send(200, {
                "model": SERVED_MODEL,
                "created_at": "2026-11-25T00:00:00Z",
                "message": {"role": "assistant", "content": content},
                "done": True,
                "done_reason": "stop",
                "total_duration": 1_000_000,
                "prompt_eval_count": len(prompt_ids),
                "eval_count": len(tokens),
                # Marks this response as mechanism-test evidence in any audit log.
                "system_fingerprint": "tiny-neural-mechanism-test",
            })

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=11434)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    if not os.path.exists(MODEL_FILE):
        sys.exit(f"model artifact missing: {MODEL_FILE} — run train_tiny_model.py first")
    model = load_model()
    server = HTTPServer((args.host, args.port), make_handler(model))
    print(f"tiny neural inference server on http://{args.host}:{args.port} model={SERVED_MODEL}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
