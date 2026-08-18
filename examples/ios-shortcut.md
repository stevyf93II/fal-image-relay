# Calling the relay from an iOS Shortcut

A minimal Shortcut that generates an image from a prompt and shows it. Built entirely from stock actions — nothing to install.

1. **Ask for Input** — Question: "Image prompt?", Input Type: Text.
2. **Get Contents of URL**
   - URL: `https://your-site.netlify.app/generate`
   - Method: `POST`
   - Headers: `x-relay-pass` = your passphrase
   - Request Body: JSON — `action`: `submit`, `model`: `fal-ai/flux-2-pro`, `prompt`: *Provided Input*
3. **Get Dictionary from Input**, then **Get Dictionary Value** — key `status_url` into a variable, and key `response_url` into another.
4. **Repeat 30 times**
   - **Get Contents of URL** — same URL, method, and header; body: `action`: `poll`, `url`: *status_url variable*
   - **Get Dictionary Value** — key `status`
   - **If** `status` **is** `COMPLETED` → **Exit Shortcut with Result** is not needed; instead use **Stop and Output** patterns or simply let the repeat finish. Simplest stock-action route: add **Wait 2 seconds** at the end of the loop; the extra polls after completion are harmless.
5. After the loop: **Get Contents of URL** — body: `action`: `poll`, `url`: *response_url variable*.
6. **Get Dictionary Value** — key `images`, then **Get Item from List** (First Item), then **Get Dictionary Value** — key `url`.
7. **Get Contents of URL** on that image URL, then **Quick Look** (or **Save to Photo Album**).

Notes:

- Store the passphrase inside the Shortcut once; every step reuses it.
- For upscaler or expand models the result key is `image` (a single dictionary) instead of `images` (a list) — adjust step 6 accordingly.
- Add the Shortcut to your home screen or invoke it from Siri: "generate an image".
