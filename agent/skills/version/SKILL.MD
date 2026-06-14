---
name: version
description: Cut a new release for Remix Studio — inspect git changes since the last version tag, bump the semver version in package.json, write a CHANGELOG.md entry, commit, and create the matching git tag. Use when the user asks to "release", "bump the version", "cut a version", "tag a release", or "update the changelog".
---

# Release a new version

This skill walks through cutting a new version of Remix Studio. Versions follow
[semver](https://semver.org) (`MAJOR.MINOR.PATCH`), the changelog follows the
[Keep a Changelog](https://keepachangelog.com) format, and each release is tagged
`vMAJOR.MINOR.PATCH`.

## Steps

### 1. Find the current version and the last tag

```bash
node -p "require('./package.json').version"   # current version in package.json
git describe --tags --abbrev=0                 # most recent release tag
```

The `version` field in `package.json` and the latest `v*` tag should normally match.
If they disagree, stop and ask the user which is the real last release before continuing.

### 2. Inspect what changed since the last release

Review the commits and diff between the last tag and `HEAD`:

```bash
git log --oneline <last-tag>..HEAD
git diff --stat <last-tag>..HEAD
```

Read the commit messages (and the diff where a message is unclear) to understand what
actually changed. Group the changes into the Keep a Changelog categories:

- **Added** — new features
- **Changed** — changes to existing behavior
- **Deprecated** — soon-to-be-removed features
- **Removed** — removed features
- **Fixed** — bug fixes
- **Security** — vulnerability fixes

Only include categories that have entries.

### 3. Decide the new version number

Pick the bump from the nature of the changes, unless the user already specified one:

- **PATCH** (`x.y.Z`) — only bug fixes / internal changes, no behavior changes for users.
- **MINOR** (`x.Y.0`) — new backward-compatible features.
- **MAJOR** (`X.0.0`) — breaking changes.

State the version you chose and why before writing files. If it's a judgment call, ask.

### 4. Bump `package.json`

Update the `version` field. Prefer `npm` so the value is written consistently (do **not**
let it create the tag or commit yet — this skill controls those):

```bash
npm version <new-version> --no-git-tag-version
```

### 5. Write the CHANGELOG.md entry

Add a new section at the top of the version list (just under the intro, above the previous
release). Use today's date in `YYYY-MM-DD` format:

```markdown
## [<new-version>] - <YYYY-MM-DD>

### Added

- **Short Title**: One-sentence, user-facing description of the change.

### Fixed

- **Short Title**: One-sentence description.
```

Match the existing style: bold short titles, concise sentences, user-facing framing
(describe the outcome, not the implementation detail or file names). Look at the entries
already in `CHANGELOG.md` and mirror their tone and granularity.

### 6. Show the user, then commit and tag

Before committing, summarize the version bump and the changelog entry for the user and get
confirmation. Then:

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v<new-version>"
git tag -a v<new-version> -m "v<new-version>"
```

### 7. Report

Tell the user the new version, the tag created, and remind them to push when ready:

```bash
git push && git push origin v<new-version>
```

Do **not** push automatically — leave that to the user unless they explicitly ask.

## Notes

- Never invent changelog entries. Everything in the changelog must trace back to a real
  commit or diff between the last tag and `HEAD`.
- If the working tree has uncommitted changes, point them out before starting — they may
  belong in this release (commit them first) or may be unrelated.
- Keep the version in `package.json`, the `## [version]` heading in `CHANGELOG.md`, and the
  `v<version>` git tag in sync — all three must reference the same number.
