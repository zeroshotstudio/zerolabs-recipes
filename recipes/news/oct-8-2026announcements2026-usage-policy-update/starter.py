#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'What changed in Anthropic’s Usage Policy'
ARTICLE_URL = 'https://labs.zeroshot.studio/news/oct-8-2026announcements2026-usage-policy-update'
SOURCE_URLS = ('https://www.anthropic.com/news/2026-usage-policy-update',)


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
