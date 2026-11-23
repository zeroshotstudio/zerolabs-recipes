# Verify Git repository access on macOS

Use this check after updating the credential for an HTTPS remote. [macOS Git credentials guide](https://labs.zeroshot.studio/resources/how-to-manage-git-credentials-in-macos-keychain).

Run from a checkout with a trusted `origin` for a private repository you are authorized to read. Use a repository with an established default branch.

```sh
GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/usr/bin/false \
  git ls-remote --exit-code origin HEAD
```

A commit ID and `HEAD` confirm read access through Git's current authentication path. Exit status 2 means no ref matched. Report the outcome without copying credential values or private repository details. [Git command reference](https://git-scm.com/docs/git-ls-remote)
