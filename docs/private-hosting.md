# Private Hosting with S3 + CloudFront + Google OAuth

Host pi-transcript HTML files on AWS with authentication via Google OAuth.

## Architecture

```
User → CloudFront → Lambda@Edge (Google OAuth) → S3 (private)
         ↑
   Route53 (optional custom domain)
```

- **S3**: Private bucket storing HTML transcript files
- **CloudFront**: CDN serving from S3 (only access path)
- **Lambda@Edge**: Viewer-request function that checks for a valid session cookie
- **Google OAuth**: Users authenticate with their Google account; access is restricted to specific email domains
- **Route53** *(optional)*: Custom domain name (e.g. `transcripts.example.com`)

## Prerequisites

- AWS CLI configured (`aws configure`)
- A Google Cloud project with OAuth 2.0 credentials

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select existing)
3. Configure the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent):
   - User type: **External**
   - Fill in app name and email
4. Create credentials → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://<your-domain>` (add after Step 2)
   - Authorized redirect URIs: `https://<your-domain>/_auth/callback` (add after Step 2)
5. Save the **Client ID** and **Client Secret**

## Step 2: Deploy the AWS Infrastructure

Generate a cookie secret:

```bash
COOKIE_SECRET=$(openssl rand -base64 32)
echo "$COOKIE_SECRET"  # save this for future updates
```

### Basic deploy (CloudFront domain only)

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name pi-transcripts \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --parameter-overrides \
    BucketName=my-pi-transcripts \
    GoogleClientId=YOUR_CLIENT_ID \
    GoogleClientSecret=YOUR_CLIENT_SECRET \
    AllowedEmailDomains=yourdomain.com \
    CookieSecret="$COOKIE_SECRET"
```

### With custom domain (Route53 + ACM)

First, ensure you have:
- A Route53 hosted zone for your domain
- An ACM certificate in **us-east-1** covering your subdomain (e.g. `transcripts.example.com`)

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name pi-transcripts \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --parameter-overrides \
    BucketName=my-pi-transcripts \
    GoogleClientId=YOUR_CLIENT_ID \
    GoogleClientSecret=YOUR_CLIENT_SECRET \
    AllowedEmailDomains=yourdomain.com \
    CookieSecret="$COOKIE_SECRET" \
    DomainName=transcripts.example.com \
    CertificateArn=arn:aws:acm:us-east-1:123456789:certificate/abc-123 \
    HostedZoneId=Z1234567890
```

> **Important**: Must be deployed in `us-east-1` (required for Lambda@Edge).

To update an existing stack (e.g., changing allowed domains), run the same command — it creates or updates automatically.

Get the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name pi-transcripts \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

## Step 3: Update Google OAuth Redirect URIs

After deploying, go back to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) and update with the URL from the outputs:

- **Authorized JavaScript origins**: `https://<your-domain>`
- **Authorized redirect URIs**: `https://<your-domain>/_auth/callback`

## Step 4: Configure the CLI

Set the environment variables (add to your shell profile):

```bash
export PI_TRANSCRIPT_S3_BUCKET=my-pi-transcripts
export PI_TRANSCRIPT_CLOUDFRONT_URL=https://transcripts.example.com  # or the CloudFront domain
```

## Usage

```bash
# Upload a session transcript
pi-transcript 3 --s3

# Interactive picker + upload
pi-transcript --s3

# All sessions
pi-transcript --all --s3
```

The CLI uploads HTML files to S3 under short, readable paths (e.g. `project-name/2026-02-24-a1b2c3/`) and prints the URL. Visitors must authenticate via Google before viewing.

## Security Notes

- The S3 bucket has no public access; CloudFront is the only access path
- Lambda@Edge validates Google OAuth tokens and checks the email domain
- Session cookies are signed with HMAC-SHA256 and expire after 24 hours
- `AllowedEmailDomains` can be a domain (`yourdomain.com`) or a specific email (`user@gmail.com`)

## Updating the Lambda

If you modify `infra/auth-at-edge/index.mjs`, regenerate the template:

```bash
bun infra/build.ts
```

Then redeploy the stack with the same command from Step 2.

## Cleanup

```bash
# Empty the S3 bucket first
aws s3 rm s3://my-pi-transcripts --recursive

# Delete the stack
aws cloudformation delete-stack --stack-name pi-transcripts --region us-east-1
```
