# Cloudflare Pages + Google OAuth Setup

Deploy pi-transcript HTML files to Cloudflare Pages, protected by Google OAuth via Cloudflare Access.

## Status

- [x] Google OAuth app created (Google Cloud Console)
- [x] Google IdP connected in Cloudflare Zero Trust
- [x] `--pages` flag implemented in CLI
- [x] `wrangler login` authenticated
- [ ] **Fix: Enable Access from Pages project settings (not Zero Trust Applications)**
- [ ] Verify auth blocks anonymous access
- [ ] Clean up the self-hosted Access Application in Zero Trust (it doesn't work for `*.pages.dev`)

## What went wrong

`pages.dev` is a Cloudflare-shared domain. You **cannot** protect it by creating a "Self-hosted" Access Application in Zero Trust pointing to `pi-transcripts.pages.dev`. Cloudflare ignores Access policies on shared domains configured this way.

Instead, Access must be enabled **from the Pages project settings** in the main Cloudflare dashboard.

## Steps to complete

### 1. Recreate the Pages project

```bash
bunx wrangler pages project create pi-transcripts --production-branch=main
```

### 2. Enable Access from the Pages project settings

1. Go to **https://dash.cloudflare.com**
2. Navigate to **Workers & Pages** (left sidebar, under "Build" section)
3. Click on **pi-transcripts**
4. Go to **Settings**
5. Look for **Access Policy** / **Security** / **General** section
6. Enable **Cloudflare Access** and select/create a policy that allows `@comp.vc` emails
7. This protects both `pi-transcripts.pages.dev` AND all `*.pi-transcripts.pages.dev` deployment URLs

### 3. Clean up Zero Trust

1. Go to **https://one.dash.cloudflare.com**
2. **Access controls** → **Applications**
3. Delete the `pi-transcripts` self-hosted application (it doesn't work for `pages.dev`)

### 4. Test the full flow

```bash
# Deploy a small session
npx @psg2/pi-transcript 7 --pages --no-open

# Verify auth is required (should get 302 redirect, not 200)
curl -sL -o /dev/null -w "%{http_code}" https://<deployment-hash>.pi-transcripts.pages.dev

# Open in browser — should show Google login
open https://<deployment-hash>.pi-transcripts.pages.dev
```

## What's already done

### Google OAuth App (Google Cloud Console)
- Project created at https://console.cloud.google.com
- OAuth 2.0 client configured (Web application)
- Authorized JavaScript origins: `https://compvc.cloudflareaccess.com`
- Authorized redirect URIs: `https://compvc.cloudflareaccess.com/cdn-cgi/access/callback`

### Cloudflare Zero Trust
- Team name: `compvc` (domain: `compvc.cloudflareaccess.com`)
- Google identity provider connected and tested ✅

### CLI (`--pages` flag)
```bash
# Deploy to Cloudflare Pages
npx @psg2/pi-transcript 3 --pages

# Custom project name
npx @psg2/pi-transcript 3 --pages --pages-project my-project

# Or via env var
PI_TRANSCRIPT_PAGES_PROJECT=my-project npx @psg2/pi-transcript 3 --pages
```

## Reference docs

- Cloudflare Pages Access integration: https://developers.cloudflare.com/pages/configuration/access/
- Google IdP setup: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/
