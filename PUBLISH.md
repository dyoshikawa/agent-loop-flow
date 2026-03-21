# Publishing to npm

## Pre-publish Checklist

- [ ] All tests pass: `pnpm test`
- [ ] Linting and type checks pass: `pnpm check`
- [ ] Build succeeds: `pnpm build`
- [ ] Verify package contents: `npm pack --dry-run`
- [ ] Version is updated in `package.json`
- [ ] CHANGELOG or release notes are up to date

## Version Bump

Use npm's built-in versioning:

```bash
# Patch release (0.1.0 -> 0.1.1) -- bug fixes
npm version patch

# Minor release (0.1.0 -> 0.2.0) -- new features, backward-compatible
npm version minor

# Major release (0.1.0 -> 1.0.0) -- breaking changes
npm version major

# Specific version
npm version 1.0.0

# Pre-release
npm version prerelease --preid=beta   # 0.1.0 -> 0.1.1-beta.0
```

`npm version` automatically creates a git commit and tag.

## Publish

```bash
# Dry run to verify what will be published
npm pack --dry-run

# Publish to npm (runs prepublishOnly -> pnpm build automatically)
npm publish

# Publish a pre-release with a tag
npm publish --tag beta
```

## Post-publish

```bash
# Push the version commit and tag to remote
git push --follow-tags
```
