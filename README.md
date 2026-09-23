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

`lot_title`, `lot_url`, `image`, `focal_x`, and `focal_y` are optional and are broadcast as `lotTitle`, `lotUrl`, `image`, `focalX`, and `focalY` (`focalX`/`focalY` only when an image is included). `user_id` is broadcast as `userId`.
