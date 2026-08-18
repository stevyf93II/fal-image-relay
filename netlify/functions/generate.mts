import type { Context, Config } from "@netlify/functions";

const QUEUE_BASE = "https://queue.fal.run/";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }
  const pass = req.headers.get("x-relay-pass");
  if (!pass || pass !== Netlify.env.get("RELAY_PASS")) {
    return new Response(JSON.stringify({ error: "bad pass" }), { status: 401 });
  }
  const falKey = Netlify.env.get("FAL_KEY");
  if (!falKey) {
    return new Response(JSON.stringify({ error: "no key configured" }), { status: 500 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  const auth = { "Authorization": `Key ${falKey}`, "Content-Type": "application/json" };

  if (body.action === "submit") {
    // Model id validation: lower-case alphanumerics plus . _ - / — dots are
    // required because real fal model ids carry version numbers
    // (e.g. "xai/grok-imagine-image/v2.0/text-to-image"). Without the dot the
    // regex silently rejected such ids and fell back to fal-ai/flux/dev, so a
    // caller asking for a versioned model got a different model billed instead.
    const model = typeof body.model === "string" && /^[a-z0-9._\-\/]+$/.test(body.model)
      ? body.model : "fal-ai/flux/dev";

    // Optional model allowlist: set ALLOWED_MODELS to a comma-separated list
    // (e.g. "fal-ai/flux-2-pro,fal-ai/esrgan") to pin which models this relay
    // will pay for. Unset or empty = the whole fal catalog is callable.
    const allowlist = (Netlify.env.get("ALLOWED_MODELS") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    if (allowlist.length && !allowlist.includes(model)) {
      return new Response(JSON.stringify({ error: "model not in allowlist" }), { status: 403 });
    }

    // Forward every caller-supplied parameter to fal EXCEPT the relay's own
    // control keys. A fixed parameter whitelist silently drops image_url,
    // strength, scale, mask_url, etc., which breaks image-to-image,
    // outpainting/expand, and upscale models. Control keys are stripped so
    // they never leak to fal (action/url are ours; model rides in the URL
    // path; the passphrase is a header and was never in the body).
    const payload: any = { ...body };
    delete payload.action;
    delete payload.url;
    delete payload.model;

    // Inject classic text-to-image defaults ONLY for a from-scratch generation
    // (no source image supplied). Image-operation requests forward the
    // caller's fields untouched so each fal model gets exactly the parameters
    // it expects and nothing spurious.
    const isImageOp = body.image_url !== undefined || body.image_urls !== undefined;
    if (!isImageOp) {
      payload.prompt = String(body.prompt || "");
      if (payload.image_size === undefined) payload.image_size = { width: 1024, height: 1024 };
      if (payload.num_inference_steps === undefined) payload.num_inference_steps = 30;
      if (payload.guidance_scale === undefined) payload.guidance_scale = 3.5;
    }

    const r = await fetch(QUEUE_BASE + model, {
      method: "POST", headers: auth, body: JSON.stringify(payload),
    });
    return new Response(await r.text(), {
      status: r.status, headers: { "Content-Type": "application/json" },
    });
  }

  if (body.action === "poll") {
    const url = String(body.url || "");
    if (!url.startsWith(QUEUE_BASE)) {
      return new Response(JSON.stringify({ error: "url must be a fal queue url" }), { status: 400 });
    }
    const r = await fetch(url, { headers: { "Authorization": `Key ${falKey}` } });
    return new Response(await r.text(), {
      status: r.status, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "action must be submit or poll" }), { status: 400 });
};

export const config: Config = {
  path: "/generate",
};
