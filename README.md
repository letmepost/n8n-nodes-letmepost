# n8n-nodes-letmepost

This is an n8n community node. It lets you publish to social media platforms with [letmepost.dev](https://letmepost.dev) in your n8n workflows.

letmepost.dev is an open-source social media publishing API for developers and agents. One endpoint publishes to Bluesky, X/Twitter, LinkedIn, Instagram, Threads, Facebook, Pinterest, and TikTok — with preflight validation that catches platform-specific problems before they fail, and transparent, structured errors when a platform rejects a post.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. Install the package `n8n-nodes-letmepost`.

## Operations

This package ships two nodes.

### Letmepost

| Resource | Operation | Description |
| --- | --- | --- |
| Post | Publish | Create and publish a post to one or more connected accounts. Returns the per-target result, including any preflight warnings or rejections. |
| Post | Get | Retrieve a single post and its attempt history. |
| Post | Get Many | Retrieve many posts, filtered by profile, platform, status, or error code. |
| Account | Get Many | List the social accounts connected to your organization. |
| Media | Get Many | List previously uploaded media assets. |

When publishing, you can attach media by public URL, by an existing letmepost media ID, or directly from a binary property on the incoming item (sent inline). Set an **Idempotency Key** to make retries safe — reusing the same key never publishes twice.

To reply to a Bluesky post, expand **Bluesky Reply** (targets a Bluesky account) and provide the parent post's strong ref from a prior publish response: **Reply To URI** and **Reply To CID** (both required, sent together). For replies deeper than the first, also set **Thread Root URI** and **Thread Root CID** (both required together); omit them to reply to a top-level post and the root defaults to the parent.

### Letmepost Trigger

Starts a workflow when letmepost.dev sends a webhook event (for example `post.published` or `post.failed`). When the workflow is activated, the trigger registers a webhook endpoint with letmepost.dev automatically and verifies the HMAC signature on every delivery; deactivating the workflow removes the endpoint. Leave **Events** empty to receive all events, or select specific ones.

## Credentials

You need a letmepost.dev account and an API key.

1. Sign in to the [letmepost.dev dashboard](https://app.letmepost.dev).
2. Go to **Settings → API Keys** and create a key. Use an `lmp_live_` key for production or `lmp_test_` for the test environment.
3. In n8n, create new **Letmepost API** credentials and paste the key.

The credential also has a **Base URL** field. Leave it as `https://api.letmepost.dev` unless you run a self-hosted instance, in which case point it at your own API.

## Compatibility

Tested against n8n 1.x. Requires an n8n version that supports community node tools (`usableAsTool`). No external runtime dependencies.

## Usage

- **Publish to several platforms at once:** select multiple accounts in one Publish operation. The same text and media are sent to every selected account; the response lists the result per target so you can branch on partial failures.
- **React to delivery outcomes:** pair the Letmepost Trigger with the action node — for example, post to Slack when a `post.failed` event arrives, including the transparent error from the event payload.
- **Idempotent retries:** set an Idempotency Key (e.g. an expression derived from the upstream item) so a re-run of the workflow does not double-publish.

For more on building workflows, see the n8n [Try it out](https://docs.n8n.io/try-it-out/) guide.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [letmepost.dev documentation](https://docs.letmepost.dev)
* [letmepost.dev on GitHub](https://github.com/letmepost/letmepost.dev)

## Version history

### 0.1.0

Initial release. Letmepost node (Post: Publish / Get / Get Many; Account: Get Many; Media: Get Many) and Letmepost Trigger (auto-registering webhook trigger with HMAC verification).
