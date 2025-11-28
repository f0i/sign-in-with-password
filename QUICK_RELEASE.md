# Quick Release Guide

## Create Your First Release (v1.0.0)

Once you've pushed this repository to GitHub, follow these steps:

### 1. Push to GitHub

```bash
# Create a new repository on GitHub (don't initialize with README)
# Then push your local repo:

git remote add origin https://github.com/YOUR_USERNAME/ic-password-auth.git
git push -u origin main
```

### 2. Create the First Release

```bash
# Update version to 1.0.0
npm version 1.0.0

# This creates:
# - A commit with "1.0.0" message
# - A git tag "v1.0.0"

# Push everything
git push origin main --tags
```

### 3. Automatic Release Process

The GitHub Actions workflow will automatically:
1. ✅ Detect the new `v1.0.0` tag
2. ✅ Install dependencies
3. ✅ Build the library (`npm run build`)
4. ✅ Create a GitHub Release with auto-generated notes
5. ✅ Upload these files:
   - `ic-password-auth.js` (main library)
   - `ic-password-auth.d.ts` (TypeScript definitions)
   - `ic-password-auth.js.LICENSE.txt` (license info)

### 4. Verify

Check your release at:
```
https://github.com/YOUR_USERNAME/ic-password-auth/releases
```

Users can now download `ic-password-auth.js` directly from the release!

---

## Future Releases

For subsequent releases:

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch && git push origin main --tags

# Minor release (1.0.0 → 1.1.0)
npm version minor && git push origin main --tags

# Major release (1.0.0 → 2.0.0)
npm version major && git push origin main --tags
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
- Check that you pushed the tag: `git push origin main --tags`
- Verify the workflow exists: `.github/workflows/release.yml`
- Check Actions tab: `https://github.com/YOUR_USERNAME/REPO/actions`

**Build failed?**
- Check the Actions logs for errors
- Test locally: `npm ci && npm run build`
- Fix issues, commit, and create a new tag

**Need to delete a release?**
1. Delete the release on GitHub (via web UI)
2. Delete the tag locally: `git tag -d v1.0.0`
3. Delete the tag remotely: `git push origin :refs/tags/v1.0.0`
4. Fix issues and recreate the release
