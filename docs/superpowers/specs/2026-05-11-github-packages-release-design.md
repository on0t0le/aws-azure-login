# npmjs.org OIDC Release Design

**Date:** 2026-05-11  
**Author:** on0t0le

## Summary

Publish `@on0t0le/aws-azure-login` to npmjs.org using GitHub Actions OIDC (no stored tokens, no rotation). Remove Docker and Snap distribution. Standardize CI on npm (drop yarn).

## Scope

- Publish npm package to `registry.npmjs.org` as `@on0t0le/aws-azure-login`
- Use OIDC provenance publishing — zero secrets required
- Remove Docker and Snap publish jobs from CI
- Delete Docker/Snap related files from repo
- Update README installation instructions

## Changes

### package.json

- `name`: `"aws-azure-login"` → `"@on0t0le/aws-azure-login"`
- Add `"publishConfig": {"registry": "https://registry.npmjs.org/", "access": "public"}`
- `repository.url`: `https://github.com/on0t0le/aws-azure-login.git`
- `bugs`: `https://github.com/on0t0le/aws-azure-login/issues`

### .github/workflows/release.yml

**build job**: replace `yarn install && yarn test && yarn build` with `npm ci && npm test && npm run build`

**publish-npm job**:
- Add `permissions: id-token: write` (enables OIDC)
- `registry-url`: `https://registry.npmjs.org/`
- `npm publish --provenance --access public` — no `NODE_AUTH_TOKEN`
- Fix inconsistent action versions to `@v5`

**Removed jobs**:
- `publish-docker` — entire job deleted
- `publish-snap` — entire job deleted

### README.md

- Remove Docker install section and all `docker run` commands
- Remove Snap install section and snapcraft.io link
- Update install command: `npm install -g @on0t0le/aws-azure-login`
- Update badges to point to `@on0t0le/aws-azure-login` on npmjs.org

### File deletions

| File | Reason |
|------|--------|
| `Dockerfile` | Docker support removed |
| `docker-launch.sh` | Docker support removed |
| `.dockerignore` | Docker support removed |
| `snapcraft.yaml` | Snap support removed |

## Auth / Secrets

**No secrets required.** GitHub Actions authenticates to npmjs.org via OpenID Connect.

### One-time npmjs.org setup (manual)

1. First publish: run `npm publish` locally after `npm login` to create the package on npmjs.org
2. Go to `npmjs.com/package/@on0t0le/aws-azure-login` → Settings tab
3. Under "Publishing Access" → "Add a publisher" → GitHub Actions
4. Fill in: owner=`on0t0le`, repo=`aws-azure-login`, workflow=`release.yml`, environment=(blank)

After this, all future releases use OIDC with no token rotation needed.

## Release Trigger

Push a git tag (any string) or trigger `workflow_dispatch` manually.

## Out of Scope

- No deprecation stub for old `aws-azure-login` package
- No dual-publishing
- No changes to build/test logic or source code
