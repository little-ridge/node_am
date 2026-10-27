# node_am

Auction Manager module for the Little Ridge Node host. WordPress (`spruce_am`) remains the bid authority. After a bid is stored, WordPress posts a signed webhook here and this module fans the new price out to live clients.

## Rooms

- `auction:{id}` — every lot card on an auction page
- `lot:{id}` — a single lot view

Watching rooms does not require a JWT.

## Webhook

`POST /webhooks/am/bid`

```
X-Webhook-Signature: sha256=<hmac of raw JSON>
X-Webhook-Event: bid.created
X-Spruce-Origin: https://am.local
```

```json
{
  "bid_id": 12,
  "auction_id": 3,
  "lot_id": 44,
  "amount": "150.00",
  "lot_title": "Vintage Rolex Submariner",
  "lot_url": "https://am.local/lot/44",
  "image": "https://am.local/wp-content/uploads/lot-44.jpg",
  "focal_x": 0.5,
  "focal_y": 0.33
}
```

`lot_title`, `lot_url`, `image`, `focal_x`, `focal_y`, and `image_fit` are optional and are broadcast as `lotTitle`, `lotUrl`, `image`, `focalX`, `focalY`, and `imageFit` (`focalX`/`focalY` only when an image is included; `imageFit` only when it is `contain`). `user_id` is broadcast as `userId`.

## Snapshot

The live socket only accepts `auth`, `subscribe`, and `unsubscribe`. After that socket connects, the lot page asks Node for the current state of the lots already in the document:

`GET /am/snapshot?lots=44,45`

Send `Authorization: Bearer <jwt>` when the visitor is logged in. Node checks the token, then asks WordPress `GET /wp-json/spruce-am/v1/lot-snapshot` with `X-Spruce-Snapshot: sha256=<hmac>` over `userId\nlotIds` using that site's webhook secret. The JSON `lots` array is the current bid, close, counts, watch heart, Winning/Outbid sash, and whether this visitor gets a bid form. Later `bid.created` and `lot.counters` events are unchanged. The response is `Cache-Control: private, no-store`.
