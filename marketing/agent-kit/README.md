# Agent Kit landing page

`index.html` is a standalone, responsive sales/landing page for ZeroLabs Agent Kit 2.0. It contains its CSS, SVG icons and JavaScript, with no build step, external fonts, trackers or runtime dependencies. Open it directly in a browser, or serve this directory on any static host.

The visual direction follows the product's Linear-inspired neutral palette, fine borders, compact interface details and restrained violet accents. It is an independent implementation, not an official Linear template or plugin export.

## Sales configuration

Edit `SALES_CONFIG` near the end of `index.html`:

- `checkoutUrl`: an approved HTTPS checkout URL. Empty by default; all main calls to action then link to the kit source and setup documentation.
- `priceLabel`: the approved price and billing basis, such as a currency amount and “one-time”. Empty by default. Displayed only with a valid checkout URL.
- `purchaseLabel`: text used on purchase buttons once checkout is configured.

The page does not invent pricing, collect leads or simulate checkout. Validate payment, entitlement/download delivery, support and refund terms before enabling a public sales flow. When the kit's status changes, update the release-candidate copy, FAQ and all branch-specific documentation links together.

## Product claims and preview

Copy is grounded in `kits/self-hosted-agent-kit/README.md` and `docs/RELEASE-ACCEPTANCE.md`. It explains that model calls go to OpenAI, running costs are separate, the product is a single-operator workspace, and it does not install OpenClaw. The built-in walkthrough uses clearly labelled illustrative data; it is not a live dashboard or a model execution demo.

The walkthrough supports mouse, touch and keyboard tabs. The mobile menu, FAQ disclosures, section links and documentation links work without a backend. With JavaScript disabled, the default product view, FAQs and normal links remain usable.

## Preview

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory marketing/agent-kit
```

Open `http://127.0.0.1:8080`. The single HTML file can be copied into the ZeroLabs website without changing the Agent Kit runtime or release bundle.

Validated in Chromium at 1440, 900, 390 and 320 px. All three walkthrough views passed automated WCAG A/AA and horizontal-overflow checks at each width. Keyboard tab navigation, the mobile menu, FAQ disclosures, valid/invalid checkout configuration and the no-JavaScript fallback were also exercised. This is automated browser evidence, not a full accessibility certification or real-device Safari test.
