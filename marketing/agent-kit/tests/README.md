# Marketing browser acceptance

From the repository root:

```sh
npm ci --prefix kits/self-hosted-agent-kit/tests
cd kits/self-hosted-agent-kit/tests
npx playwright install --with-deps chromium
cd ../../..
node marketing/agent-kit/tests/browser.mjs
```

The test also requires Python 3 and `ffprobe` (provided by the `ffmpeg` package).
Set `CHROMIUM_PATH` to use an existing Chromium binary. `SCREENSHOT_DIR` selects
the evidence directory; the default is `/tmp/agentkit-marketing`.

The test starts the real local preview handler on an ephemeral localhost port
and checks media hashes, HTTP ranges, codec metadata, playback, chapters,
captions, replay, MP4/GIF downloads, valid and invalid checkout configuration,
keyboard/touch navigation, fallbacks, and accessibility/overflow at four widths.
It uses the kit's pinned Playwright and axe dependencies, with no additional
dependency lockfile. API accounts, checkout payments, and production hosting
are not exercised by these browser checks.
