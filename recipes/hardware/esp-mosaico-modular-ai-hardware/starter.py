#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'ESP-Mosaico CoreBoard identification guide'
ARTICLE_URL = 'https://labs.zeroshot.studio/hardware/esp-mosaico-modular-ai-hardware'
SOURCE_URLS = ('https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s31/esp-mosaico/index.html', 'https://github.com/espressif/esp-dev-kits/blob/8caaff046bfa477d19cdcc2dad02a012eb25556b/docs/en/esp-mosaico/index.rst')


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
