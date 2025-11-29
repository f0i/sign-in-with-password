# Quick Release Guide

## Create Your First Release (v1.0.0)

Once you've pushed this repository to GitHub, follow these steps:

### 1. Push to GitHub

```bash
# Create a new repository on GitHub (don't initialize with README)
# Then push your local repo:

git remote add github https://github.com/f0i/sign-in-with-password.git
git push -u github main
```

### 2. Configure npm Trusted Publishers (One-time Setup)

To enable automatic npm publishing via OIDC (no tokens needed):

1. Go to https://www.npmjs.com/package/ic-password-auth/access
2. Click "Add trusted publisher"
3. Select "GitHub Actions"
4. Enter:
   - Repository owner: `f0i`
   - Repository name: `sign-in-with-password`
   - Workflow filename: `release.yml`
5. Click "Add"

This allows GitHub Actions to publish to npm securely without managing tokens!

### 3. Create the First Release

```bash
# Update version to 1.0.0
npm version 1.0.0

# This creates:
# - A commit with "1.0.0" message
# - A git tag "v1.0.0"

# Push everything
git push github main --tags
```

### 4. Automatic Release Process

The GitHub Actions workflow will automatically:
1. ✅ Detect the new `v1.0.0` tag
2. ✅ Install dependencies
3. ✅ Build the library (`npm run build`)
4. ✅ Create a GitHub Release with auto-generated notes
5. ✅ Upload these files:
   - `ic-password-auth.js` (main library)
   - `ic-password-auth.d.ts` (TypeScript definitions)
   - `ic-password-auth.js.LICENSE.txt` (license info)
6. ✅ Publish to npm (via OIDC Trusted Publisher)

### 5. Verify

Check your release at:
```
https://github.com/f0i/sign-in-with-password/releases
```

And on npm:
```
https://www.npmjs.com/package/ic-password-auth
```

Users can now:
- Download `ic-password-auth.js` directly from the release
- Install via npm: `npm install ic-password-auth`

---

## Future Releases

For subsequent releases:

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch && git push github main --tags

# Minor release (1.0.0 → 1.1.0)
npm version minor && git push github main --tags

# Major release (1.0.0 → 2.0.0)
npm version major && git push github main --tags
```

---

## What Users See

When the release is published, users will see:

**📦 Download Assets:**
- ic-password-auth.js
- ic-password-auth.d.ts
- ic-password-auth.js.LICENSE.txt

**📝 Release Notes:**
Automatically generated with installation instructions and links to documentation.

---

## Troubleshooting

**Workflow not running?**
- Check that you pushed the tag: `git push github main --tags`
- Verify the workflow exists: `.github/workflows/release.yml`
- Check Actions tab: `https://github.com/f0i/sign-in-with-password/actions`

**Build failed?**
- Check the Actions logs for errors
- Test locally: `npm ci && npm run build`
- Fix issues, commit, and create a new tag

**npm publish failed?**
- Verify Trusted Publisher is configured on npm
- Check that `id-token: write` permission is in workflow
- Review the Actions logs for OIDC authentication errors

**Need to delete a release?**
1. Delete the release on GitHub (via web UI)
2. Delete the tag locally: `git tag -d v1.0.0`
3. Delete the tag remotely: `git push github :refs/tags/v1.0.0`
4. If published to npm, you can't unpublish (only deprecate): `npm deprecate ic-password-auth@1.0.0 "Accidentally published"`
5. Fix issues and recreate the release with a new version
