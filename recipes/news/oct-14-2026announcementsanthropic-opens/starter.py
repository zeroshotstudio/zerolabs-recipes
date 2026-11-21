#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'Anthropic opens a Singapore office'
ARTICLE_URL = 'https://labs.zeroshot.studio/news/oct-14-2026announcementsanthropic-opens'
SOURCE_URLS = ('https://www.anthropic.com/news/singapore-office-opening',)


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
