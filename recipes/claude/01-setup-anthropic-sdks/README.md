# Claude & Anthropic SDK Setup Recipe

> Production-ready Python and TypeScript harnesses for the Anthropic Claude Messages API.
> Published as part of the ZeroLabs Claude Developer Curriculum: [How to Set Up Anthropic Python and TypeScript SDKs](https://labs.zeroshot.studio/resources/how-to-set-up-anthropic-python-and-typescript-sdks).

## Quickstart

### Python Harness
1. Create virtual environment and install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` and set your key:
   ```bash
   cp .env.example .env
   ```
3. Run the ping test:
   ```bash
   python3 test_anthropic.py
   ```

### TypeScript Harness
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the ping test directly:
   ```bash
   npm run check
   ```
