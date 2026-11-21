#!/usr/bin/env python3
"""List the ZeroLabs article and its primary references."""

TITLE = 'Anthropic revises its Cyber Verification Program'
ARTICLE_URL = 'https://labs.zeroshot.studio/news/oct-6-2026announcementsexpanding-the-cyber'
SOURCE_URLS = ('https://www.anthropic.com/news/cyber-verification-program',)


def main():
    print(TITLE)
    print(ARTICLE_URL)
    for url in SOURCE_URLS:
        print(url)


if __name__ == "__main__":
    main()
