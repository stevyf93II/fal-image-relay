import os, json, time, urllib.request

RELAY = os.environ.get("RELAY_URL", "https://your-site.netlify.app/generate")
PASS = os.environ["RELAY_PASS"]

def _post(body: dict) -> dict:
    req = urllib.request.Request(
        RELAY, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-relay-pass": PASS},
        method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())

def generate(prompt: str, model: str = "fal-ai/flux-2-pro", **fields) -> list:
    """Submit, poll to completion, return a list of image dicts ({url, ...}).

    Extra fields pass straight through to the model:
    image_size / aspect_ratio / seed / image_url / strength / scale ...
    """
    body = {"action": "submit", "model": model, "prompt": prompt}
    body.update(fields)
    sub = _post(body)
    status_url, response_url = sub["status_url"], sub["response_url"]
    for _ in range(90):
        if _post({"action": "poll", "url": status_url}).get("status") == "COMPLETED":
            break
        time.sleep(2)
    out = _post({"action": "poll", "url": response_url})
    return out.get("images") or [out["image"]]  # upscalers return a single image

if __name__ == "__main__":
    print(generate("a single ripe red apple on a plain white background, product photo",
                   image_size="square_hd")[0]["url"])
