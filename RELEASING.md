# Release Process

This document describes how to create a new release of IC Password Auth.

## Prerequisites

- Push access to the repository
- Clean working directory (all changes committed)

## Release Steps

### 1. Update Version

Update the version in `package.json`:

```bash
# For a patch release (bug fixes)
npm version patch

# For a minor release (new features, backward compatible)
npm version minor

# For a major release (breaking changes)
npm version major
```

This will automatically:
- Update `package.json` version
- Create a git commit with the version bump
- Create a git tag (e.g., `v1.0.0`)

### 2. Update CHANGELOG.md

Edit `CHANGELOG.md` to document the changes in this release:

```markdown
## [1.0.0] - 2025-11-28

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix Z
```

Commit the changelog:

```bash
git add CHANGELOG.md
git commit -m "Update CHANGELOG for v1.0.0"
```

### 3. Push Tags

Push the version tag to GitHub to trigger the release workflow:

```bash
git push origin main --tags
```

### 4. Monitor Release

The GitHub Actions workflow will automatically:
1. Build the library
2. Create a GitHub Release
3. Upload `ic-password-auth.js` and related files
4. Generate release notes

Check the progress at: `https://github.com/f0i/sign-in-with-password/actions`

### 5. Verify Release

Once complete, verify the release at:
`https://github.com/f0i/sign-in-with-password/releases`

The release should include:
- `ic-password-auth.js` - Main library file
- `ic-password-auth.d.ts` - TypeScript definitions
- `ic-password-auth.js.LICENSE.txt` - License information

### 6. Update Documentation (Optional)

If needed, update the README.md with the new release version:

```bash
git add README.md
git commit -m "Update README for v1.0.0 release"
git push origin main
```

## Quick Reference

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch
git push origin main --tags

# Minor release (1.0.0 -> 1.1.0)
npm version minor
git push origin main --tags

# Major release (1.0.0 -> 2.0.0)
npm version major
git push origin main --tags
```

## Troubleshooting

### Release workflow failed

1. Check the GitHub Actions logs
2. Common issues:
   - Build errors: Fix and commit, then re-tag
   - Permission errors: Ensure `contents: write` permission in workflow

### Need to delete a bad release

```bash
# Delete the tag locally
git tag -d v1.0.0

# Delete the tag remotely
git push origin :refs/tags/v1.0.0

# Delete the GitHub release via the web UI
# Then recreate with the correct version
```

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (1.X.0): New features, backward compatible
- **PATCH** (1.0.X): Bug fixes, backward compatible
