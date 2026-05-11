# GitHub Packages Release Design

**Date:** 2026-05-11  
**Author:** on0t0le

## Summary

Migrate `aws-azure-login` from publishing to npmjs.org to GitHub Packages. Remove Docker and Snap distribution. Standardize CI on npm (drop yarn).

## Scope

- Publish npm package to `npm.pkg.github.com` as `@on0t0le/aws-azure-login`
- Remove Docker and Snap publish jobs from CI
- Delete Docker/Snap related files from repo
- Update README installation instructions

## Changes

### package.json

- `name`: `"aws-azure-login"` → `"@on0t0le/aws-azure-login"`
- Add `"publishConfig": {"registry": "https://npm.pkg.github.com"}`
- `repository.url`: `https://github.com/on0t0le/aws-azure-login.git`
- `bugs`: `https://github.com/on0t0le/aws-azure-login/issues`

### .github/workflows/release.yml

**build job**: replace `yarn install && yarn test && yarn build` with `npm ci && npm test && npm run build`

**publish-npm job**:
- `registry-url`: `https://npm.pkg.github.com`
- `NODE_AUTH_TOKEN`: `${{ secrets.GITHUB_TOKEN }}` (built-in, no extra secret needed)
- Checkout action version: `@v5` (was inconsistently `@v4`)

**Removed jobs**:
- `publish-docker` — entire job deleted
- `publish-snap` — entire job deleted

### README.md

- Remove Docker install section and all `docker run` commands
- Remove Snap install section and snapcraft.io link
- Remove `docker-launch.sh` usage instructions
- Update install command: `npm install -g @on0t0le/aws-azure-login`
- Remove/update npmjs.org badges (they won't resolve for GitHub Packages)

### File deletions

| File | Reason |
|------|--------|
| `Dockerfile` | Docker support removed |
| `docker-launch.sh` | Docker support removed |
| `.dockerignore` | Docker support removed |
| `snapcraft.yaml` | Snap support removed |

## Auth / Secrets

GitHub Actions `GITHUB_TOKEN` is automatically provided. No additional repository secrets are required for publishing.

## Installation (after change)

Users must authenticate to GitHub Packages before installing:

```bash
npm login --registry=https://npm.pkg.github.com --scope=@on0t0le
npm install -g @on0t0le/aws-azure-login
```

Or configure `.npmrc`:

```
@on0t0le:registry=https://npm.pkg.github.com
```

## Release Trigger

Unchanged: push a git tag (any string) or trigger `workflow_dispatch` manually.

## Out of Scope

- No deprecation stub on npmjs.org
- No dual-publishing
- No changes to build/test logic or source code
