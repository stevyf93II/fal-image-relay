# fal-image-relay

Your own image-generation endpoint — any model in the [fal.ai](https://fal.ai) catalog, one URL, one passphrase, deployable free on Netlify in minutes.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/stevyf93II/fal-image-relay)

## Why

You want to call image models from shell scripts, phone shortcuts, and AI assistants — but you do not want your fal.ai key pasted into any of them. This relay puts the key in exactly one place, server-side, behind a passphrase you can rotate. One place to gate access, pin an allowlist of models you're willing to pay for, and cut off spend by rotating a single value.

Every client — curl, an iOS Shortcut, an AI assistant's HTTP tool — talks to your relay with a passphrase header. Only the relay talks to fal.

## How it works

```
client ──POST {action, model, prompt, ...} + x-relay-pass──▶ Netlify function ──▶ queue.fal.run
```

One serverless function, three moves:

1. **submit** — forwards your request to fal's queue for the model you name; returns fal's `status_url` and `response_url`.
2. **poll** — proxies any `queue.fal.run` URL back to you, so you can watch status and fetch the result without ever holding the key.
3. That's it. The fal key never leaves the function; clients only ever hold the relay passphrase.

The function forwards every parameter you send (minus the relay's own control keys), so image-to-image, upscalers, and outpainting models work exactly like text-to-image — pass whatever fields the model expects (`image_url`, `strength`, `scale`, ...).

## Setup

1. Click the Deploy to Netlify button above (or fork this repo and connect it to a new Netlify site).
2. Set two environment variables when prompted (Site configuration → Environment variables if doing it by hand):
   - `FAL_KEY` — your fal.ai API key.
   - `RELAY_PASS` — a passphrase you invent. Every client must send it in the `x-relay-pass` header.
3. Optionally set `ALLOWED_MODELS` — comma-separated model ids (e.g. `fal-ai/flux-2-pro,fal-ai/esrgan`). Unset means the whole catalog is callable.
4. Deploy. Your endpoint is `https://<your-site>.netlify.app/generate`.

## API

Everything is a `POST` to `/generate` with header `x-relay-pass: <your passphrase>` and a JSON body.

**Submit a job:**

```json
{ "action": "submit", "model": "fal-ai/flux-2-pro", "prompt": "a ripe red apple on white, product photo", "image_size": "square_hd" }
```

Response (from fal's queue): includes `status_url` and `response_url`.

**Poll status until done:**

```json
{ "action": "poll", "url": "<status_url>" }
```

Repeat until `status` is `"COMPLETED"`.

**Fetch the result:**

```json
{ "action": "poll", "url": "<response_url>" }
```

Most text-to-image and image-to-image models return `images: [{url, width, height, content_type}]`; upscalers and expand/outpaint models return a single `image: {...}`. Handle both shapes.

**Image operations:** pass `image_url` (any publicly fetchable URL — a fal.media URL from a prior generation works directly) plus that model's own fields, e.g. `strength` for img2img or `scale` for an upscaler. When a source image is present the relay forwards your fields untouched; plain text-to-image requests get sensible defaults injected (1024×1024, 30 steps, guidance 3.5).

**Errors:** `401` bad or missing passphrase, `403` model not in your allowlist, `400` malformed JSON / unknown action / non-fal poll URL, `405` non-POST. fal's own errors pass through with fal's status codes — a `422` usually means a parameter mismatch for that model family (some take `image_size`, others take `aspect_ratio`).

See [`examples/`](examples/) for a copy-paste curl script, a Python helper, and an iOS Shortcut recipe.

## Security notes, honestly

This is a shared-passphrase gate, not an enterprise auth system. What that buys you and what it doesn't:

- A leaked `RELAY_PASS` lets someone generate images on your fal balance until you rotate it — one environment variable change. It never exposes your fal key, your fal account, or anything else.
- The `poll` action only proxies URLs on `queue.fal.run`, so the relay cannot be used as a general-purpose fetch proxy for someone holding the passphrase.
- `ALLOWED_MODELS` is your spend ceiling: pin it to the models you actually use, and a leaked passphrase can only spend at those models' rates. Set a spend limit on your fal account as the backstop.
- If you need per-client credentials, usage quotas, or audit logs, you have outgrown a shared passphrase — put a real API gateway in front or issue per-client keys at fal directly.

## Built because

This exact function fronts my own AI assistant's image-generation ability in daily production — every image it makes for me goes through this relay on my Netlify account.

More of my live projects: [craftmyresume.ai](https://craftmyresume.ai) · [getlotworth.com](https://getlotworth.com) · [arklatexrv.com](https://arklatexrv.com) · [docdrop](https://github.com/stevyf93II/docdrop)

## License

MIT
