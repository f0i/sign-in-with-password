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

### 3. Update IC-Hosted Version Hash (Optional)

If you're hosting the library on the Internet Computer and want to update the README with the new version hash:

**Note:** Builds are deterministic - the hash you calculate locally will match the GitHub Actions build.

```bash
# Build the library
npm run build

# Calculate the SHA-256 hash
sha256sum dist/ic-password-auth.js

# The output will be something like:
# 3d01d502e2062b649ce8618253622169c7fc6a715421cedd289795d31dfedf6a  dist/ic-password-auth.js

# Update README.md with:
# 1. New version number in the IC-hosted URL
# 2. New integrity hash (base64-encoded SHA-256)
# 3. New hash in the documentation

# Convert to base64 for integrity attribute (if needed):
echo -n "3d01d502e2062b649ce8618253622169c7fc6a715421cedd289795d31dfedf6a" | xxd -r -p | base64

# Commit the README update
git add README.md
git commit -m "Update IC-hosted version to v1.0.0"
```

### 4. Push Tags

Push the version tag to GitHub to trigger the release workflow:

```bash
git push github main --tags
```

### 5. Monitor Release

The GitHub Actions workflow will automatically:
1. Build the library
2. Create a GitHub Release
3. Upload `ic-password-auth.js` and related files
4. Generate release notes
5. Publish to npm (via OIDC Trusted Publisher)

Check the progress at: `https://github.com/f0i/sign-in-with-password/actions`

### 6. Verify Release

Once complete, verify the release at:
`https://github.com/f0i/sign-in-with-password/releases`

The release should include:
- `ic-password-auth.js` - Main library file
- `ic-password-auth.d.ts` - TypeScript definitions
- `ic-password-auth.js.LICENSE.txt` - License information

Also verify on npm:
`https://www.npmjs.com/package/ic-password-auth`

The package should show the new version.

### 7. Post-Release Documentation (Optional)

If you need to update documentation after the release:

```bash
git add README.md
git commit -m "Update documentation for v1.0.0 release"
git push github main
```

## Quick Reference

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch
git push github main --tags

# Minor release (1.0.0 -> 1.1.0)
npm version minor
git push github main --tags

# Major release (1.0.0 -> 2.0.0)
npm version major
git push github main --tags
```

## Troubleshooting

### Release workflow failed

1. Check the GitHub Actions logs
2. Common issues:
   - Build errors: Fix and commit, then re-tag
   - Permission errors: Ensure `contents: write` and `id-token: write` permissions in workflow
   - npm publish errors: Verify OIDC Trusted Publisher is configured

### npm publishing failed

If the npm publish step fails:
1. Verify Trusted Publisher is configured at https://www.npmjs.com/package/ic-password-auth/access
2. Check that the workflow has `id-token: write` permission
3. Ensure the repository, owner, and workflow filename match exactly
4. Review the Actions logs for OIDC authentication errors

### Need to delete a bad release

```bash
# Delete the tag locally
git tag -d v1.0.0

# Delete the tag remotely
git push github :refs/tags/v1.0.0

# Delete the GitHub release via the web UI

# Note: You cannot unpublish from npm after 72 hours
# You can only deprecate: npm deprecate ic-password-auth@1.0.0 "message"

# Then recreate with a new version (increment the version number)
```

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (1.X.0): New features, backward compatible
- **PATCH** (1.0.X): Bug fixes, backward compatible

## Deterministic Builds

The webpack build process is configured to produce deterministic output. This means:

- **Same source code** → **Same binary output**
- **Same hash** locally and in GitHub Actions
- You can **calculate hashes in advance** before releasing

### Why This Matters

If you host the library on the Internet Computer or other CDN, you can:
1. Build locally
2. Calculate the SHA-256 hash
3. Update documentation with the hash
4. Commit changes
5. Release - GitHub Actions will produce the identical file

### How to Verify

```bash
# Build twice and compare hashes
npm run build
sha256sum dist/ic-password-auth.js > hash1.txt

rm -rf dist
npm run build
sha256sum dist/ic-password-auth.js > hash2.txt

diff hash1.txt hash2.txt
# No output = hashes match!
```

### Technical Details

Deterministic builds are achieved through:
- Webpack production mode with consistent settings
- No build timestamps in output
- Deterministic module ordering
- Fixed dependency versions (package-lock.json)
