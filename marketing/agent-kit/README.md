# Agent Kit landing page

`index.html` is a responsive sales/landing page for ZeroLabs Agent Kit 2.0. It contains its CSS, SVG icons and JavaScript, with no build step, external fonts, trackers or JavaScript dependencies. Serve it together with `assets/` on any static host so the video, captions and downloads work.

The visual direction follows the product's Linear-inspired neutral palette, fine borders, compact interface details and restrained violet accents. It is an independent implementation, not an official Linear template or plugin export.

## Sales configuration

Edit `SALES_CONFIG` near the end of `index.html`:

- `checkoutUrl`: an approved HTTPS checkout URL. Empty by default; all main calls to action then link to the kit source and setup documentation.
- `priceLabel`: the approved price and billing basis, such as a currency amount and “one-time”. Empty by default. Displayed only with a valid checkout URL.
- `purchaseLabel`: text used on purchase buttons once checkout is configured.

The page does not invent pricing, collect leads or simulate checkout. Validate payment, entitlement/download delivery, support and refund terms before enabling a public sales flow. When the kit's status changes, update the release-candidate copy, FAQ and all branch-specific documentation links together.

## Product claims and preview

Copy is grounded in `kits/self-hosted-agent-kit/README.md` and `docs/RELEASE-ACCEPTANCE.md`. It explains that model calls go to OpenAI, running costs are separate, the product is a single-operator workspace, and it does not install OpenClaw. The expandable interface preview uses clearly labelled illustrative data; it is not a live dashboard or a model execution demo.

The interface preview supports mouse, touch and keyboard tabs. The mobile menu, FAQ disclosures, section links and documentation links work without a backend. With JavaScript disabled, native video controls, the transcript, disclosures and normal links remain usable.

## Recorded walkthrough

`assets/` includes an 80-second silent MP4 with on-screen captions, a 13.5-second GIF teaser, poster image, English WebVTT captions, chapter track, transcript and a checksum/recording manifest. The MP4 uses H.264/yuv420p and fast-start metadata; the page does not autoplay it. The GIF is a download, not an automatic animation on the page.

The video records the actual dashboard in an isolated deployment. Model responses and token counts are scripted and labelled throughout. The application really reads the document, calculates 437, saves and downloads an artifact, cancels work, revokes a scoped token and verifies a local database backup. No credentials appear in the video. It does not establish live-model, offsite-storage or production-host readiness. See [recording instructions](recording/README.md) to reproduce it.

## Preview

```sh
python3 marketing/agent-kit/preview.py --port 8080
```

Open `http://127.0.0.1:8080`. The local preview helper supports byte-range requests and binds only to localhost; it is not a production server. The enhanced player buffers the small MP4 (about 1.4 MB) into a browser object URL so chapter seeking also works on hosts that ignore HTTP range requests. A host with range support is preferable for the native player when JavaScript is disabled. Copy `index.html` and `assets/` into the ZeroLabs website without changing the Agent Kit runtime or release bundle.

Validated in Chromium at 1440, 900, 390 and 320 px. All three walkthrough views passed automated WCAG A/AA and horizontal-overflow checks at each width. Keyboard tab navigation, the mobile menu, FAQ disclosures, valid/invalid checkout configuration and the no-JavaScript fallback were also exercised. This is automated browser evidence, not a full accessibility certification or real-device Safari test.

The video player also passed playback, chapter seeking, captions, replay, accessibility and overflow checks at all four widths, both with and without server support for range requests. Downloaded MP4/GIF hashes matched the source assets. Blocked-media fallback and no-JavaScript controls/transcript were verified, with no JavaScript page errors.
