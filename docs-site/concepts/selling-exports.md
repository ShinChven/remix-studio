# Selling Exports

Remix Studio can publish a finished [export](/concepts/exports) package as a **paid product** on a connected store. This turns a generated archive into a sellable digital product without leaving the app.

## Connecting a Store

Connect a store account under **Exports → Stores**. The connection uses OAuth, and the store's access token is stored encrypted.

**Supported store:** **Gumroad** — connected via Gumroad's OAuth flow (`gumroad.com/oauth/authorize`).

## Creating a Product

A product is created from an existing export task. When you publish, you provide:

| Field | Description |
| :--- | :--- |
| Store | The connected store to publish to |
| Export task | The completed export archive to sell |
| Title | Product title |
| Price | Price in cents, with a currency |
| Description | Optional product description |
| Tags | Optional tags (up to 30) |
| Cover items | Album items used as the listing cover (optionally watermarked) |
| Publish immediately | Whether to publish on creation or keep as a draft |

The export archive is uploaded to the store using its multipart upload API, so large packages are supported.

## Cover Watermarking

Listing covers support **per-product watermark settings**, with automated image processing handled in the delivery queue — the same watermarking pipeline used for [album exports](/concepts/exports).

## Upload History

A **Store Upload History** view tracks what has been published, so you can see which exports became products and their status.

## Related

- [Exports & Delivery](/concepts/exports) — produce the archive you sell.
- [Storage](/concepts/storage) — where the source archive lives.
