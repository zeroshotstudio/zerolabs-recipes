#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'How the Anthropic Public Benefit Fund would work'
ARTICLE_URL = 'https://labs.zeroshot.studio/news/oct-18-2026announcementsinvesting-in-the-public'
SOURCE_URLS = ('https://www.anthropic.com/news/public-benefit-fund',)


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
