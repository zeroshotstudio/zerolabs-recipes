# Re-record the product walkthrough

This pipeline records the real application using Playwright, then adds title cards, chapter labels and captions using FFmpeg. The recording-only provider scripts the model side of the Responses protocol; the application performs the document access, calculation, artifact creation and storage itself. Never configure this fixture in a production deployment.

Requirements: the monorepo checkout, Linux, Docker/Compose, Chromium, Node, Python 3, FFmpeg/ffprobe with libx264, and the DejaVu Sans font. Install the kit's locked browser dependencies with `npm ci --prefix kits/self-hosted-agent-kit/tests` and the recording binary with `node kits/self-hosted-agent-kit/tests/node_modules/playwright/cli.js install ffmpeg`.

1. Extract a clean copy of the kit to a **separate disposable directory**, using `git archive HEAD:kits/self-hosted-agent-kit`. Do not use a real installation. Run that copy's `scripts/config.py init` to generate private local credentials; do not print or commit them.
2. In the copy's `.env`, set `COMPOSE_PROJECT_NAME=agentkit-walkthrough-test`, `PUBLIC_ORIGIN=http://localhost:18082` and `PORT=18082`. Create `state/` and `backups/`.
3. Copy `recording/demo-provider.mjs` over the disposable copy's `tests/fixture.mjs`. In the disposable `tests/compose.test.yml`, set `OPENAI_MODEL: scripted-demo-provider` and `MAX_TASK_SECONDS: 120`. The fixed fixture key in that test override is not a real provider credential.
4. From the disposable directory, start `TEST_PORT=18082 docker compose -f docker-compose.yml -f tests/compose.test.yml up -d --build --wait`. In a managed environment, use its documented Docker proxy/CA settings. The fixture uses the kit's existing application image.
5. From the monorepo root, run:

   ```sh
   DEMO_ROOT=/absolute/path/to/disposable-kit \
   WALKTHROUGH_OUTPUT=/absolute/path/outside-the-repo \
   node marketing/agent-kit/recording/record.cjs

   python3 marketing/agent-kit/recording/render.py \
     --recording /absolute/path/outside-the-repo/recording.json \
     --output marketing/agent-kit/assets
   ```

The recorder requires the exact disposable project name above and refuses a database containing tasks. It signs in off-camera, never displays an operator key or API-token secret, and checks the resulting task, artifact, cancellation, token revocation and backup status. Its only visual addition to the dashboard is a cursor highlight. CSP bypass is confined to the recording browser to allow that overlay; server code and security headers remain unchanged.

The resulting `recording.json` and raw WebM remain outside the repository. Keep them privately if needed. `assets/walkthrough.json` contains safe published metadata, checksums and chapter timestamps. If re-recording changes the timing, update the chapter buttons, displayed duration and transcript timestamps in `index.html` to match. Review the rendered frames and test playback, seeking, captions, downloads and the narrow layout before publishing.

For another take, stop **only this disposable Compose project** and remove its generated test volumes; also clear its generated backup/status files. Never point the recorder or cleanup commands at a production installation. Keep the scripted-model disclosure in the video, GIF and sales page.
