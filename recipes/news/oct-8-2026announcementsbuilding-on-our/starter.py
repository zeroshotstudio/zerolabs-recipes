#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'What Anthropic pledged to the Genesis Mission'
ARTICLE_URL = 'https://labs.zeroshot.studio/news/oct-8-2026announcementsbuilding-on-our'
SOURCE_URLS = ('https://www.anthropic.com/news/genesis-mission-commitment',)


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
