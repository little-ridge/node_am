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
```

```json
{
  "bid_id": 12,
  "auction_id": 3,
  "lot_id": 44,
  "amount": "150.00"
}
```

`user_id` may be present on the webhook; it is not broadcast to browsers.
