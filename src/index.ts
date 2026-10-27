import { createHmac } from 'node:crypto';
import type { SpruceNodeApp, SpruceNodeModule } from '../../node_core/src/types.ts';

export const name = '@little-ridge/node_am';

export async function register(app: SpruceNodeApp): Promise<void> {
  app.rooms.allow(/^auction:\d+$/, 'am');
  app.rooms.allow(/^lot:\d+$/, 'am');

  app.webhooks.on('am/bid', (payload, live) => {
    const auctionId = asPositiveInt(payload.auction_id ?? payload.auctionId);
    const lotId = asPositiveInt(payload.lot_id ?? payload.lotId);
    const amount = asAmount(payload.amount);
    const bidId = asPositiveInt(payload.bid_id ?? payload.bidId);

    if (auctionId === 0 || lotId === 0 || amount === '') {
      live.http.log.warn({ payload }, 'ignored am/bid webhook');
      return;
    }

    const closesAt = asPositiveInt(payload.closes_at ?? payload.closesAt);
    const closedAt = asClosedAt(payload.closed_at ?? payload.closedAt);
    const userId = asPositiveInt(payload.user_id ?? payload.userId);
    const watchCount = asCount(payload.watch_count ?? payload.watchCount);
    const bidCount = asCount(payload.bid_count ?? payload.bidCount);
    const lotTitle = asText(payload.lot_title ?? payload.lotTitle, 500);
    const lotUrl = asUrl(payload.lot_url ?? payload.lotUrl, 2048);
    const image = asUrl(payload.image ?? payload.image_url ?? payload.imageUrl, 2048);
    const focalX = asUnitInterval(payload.focal_x ?? payload.focalX);
    const focalY = asUnitInterval(payload.focal_y ?? payload.focalY);
    const imageFit = asImageFit(payload.image_fit ?? payload.imageFit);
    const rooms = [`auction:${auctionId}`, `lot:${lotId}`];
    const eventPayload: {
      bidId: number;
      auctionId: number;
      lotId: number;
      amount: string;
      userId?: number;
      watchCount?: number;
      bidCount?: number;
      closesAt?: number;
      closedAt?: string;
      lotTitle?: string;
      lotUrl?: string;
      image?: string;
      focalX?: number;
      focalY?: number;
      imageFit?: 'contain';
    } = {
      bidId,
      auctionId,
      lotId,
      amount,
    };
    if (userId > 0) {
      eventPayload.userId = userId;
    }
    if (watchCount !== undefined) {
      eventPayload.watchCount = watchCount;
    }
    if (bidCount !== undefined) {
      eventPayload.bidCount = bidCount;
    }
    if (closesAt > 0) {
      eventPayload.closesAt = closesAt;
      if (closedAt !== '') {
        eventPayload.closedAt = closedAt;
      }
    }
    if (lotTitle !== '') {
      eventPayload.lotTitle = lotTitle;
    }
    if (lotUrl !== '') {
      eventPayload.lotUrl = lotUrl;
    }
    if (image !== '') {
      eventPayload.image = image;
      if (focalX !== undefined) {
        eventPayload.focalX = focalX;
      }
      if (focalY !== undefined) {
        eventPayload.focalY = focalY;
      }
      if (imageFit === 'contain') {
        eventPayload.imageFit = 'contain';
      }
    }

    live.hub.broadcast(rooms, {
      type: 'event',
      event: 'bid.created',
      rooms,
      payload: eventPayload,
    });
  });

  app.webhooks.on('am/watch', (payload, live) => {
    const auctionId = asPositiveInt(payload.auction_id ?? payload.auctionId);
    const lotId = asPositiveInt(payload.lot_id ?? payload.lotId);
    const watchCount = asCount(payload.watch_count ?? payload.watchCount);
    const bidCount = asCount(payload.bid_count ?? payload.bidCount);

    if (auctionId === 0 || lotId === 0 || watchCount === undefined || bidCount === undefined) {
      live.http.log.warn({ payload }, 'ignored am/watch webhook');
      return;
    }

    const rooms = [`auction:${auctionId}`, `lot:${lotId}`];
    live.hub.broadcast(rooms, {
      type: 'event',
      event: 'lot.counters',
      rooms,
      payload: {
        auctionId,
        lotId,
        watchCount,
        bidCount,
      },
    });
  });

  // The socket host only routes auth and subscribe. After the browser's
  // socket connects, it GETs this for the lots already on the page.
  app.http.get('/am/snapshot', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');

    const origin = headerValue(request.headers.origin);
    const site = (origin ? app.sites.resolve(origin) : undefined) ?? app.sites.defaultSite();
    if (!site) {
      return reply.code(400).send({ error: 'unknown_origin' });
    }
    if (site.webhookSecret === '') {
      return reply.code(503).send({ error: 'webhook_unconfigured' });
    }

    const query = isQuery(request.query) ? request.query : {};
    const lotIds = parseLotIds(query.lots);
    if (lotIds === null) {
      return reply.code(400).send({ error: 'lots' });
    }

    let userId = 0;
    const token = bearer(request.headers.authorization);
    if (token !== '') {
      try {
        const claims = await app.jwt.verify(token, site.origin);
        userId = asPositiveInt(claims.sub);
      } catch {
        return reply.code(401).send({ error: 'invalid_token' });
      }
      if (userId <= 0) {
        return reply.code(401).send({ error: 'invalid_token' });
      }
    }

    const canonical = lotIds.join(',');
    const signature = createHmac('sha256', site.webhookSecret)
      .update(`${userId}\n${canonical}`)
      .digest('hex');
    const root = (site.wpBaseUrl || site.origin).replace(/\/+$/, '');
    const url = `${root}/wp-json/spruce-am/v1/lot-snapshot?lots=${encodeURIComponent(canonical)}&user=${userId}`;

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
        headers: {
          Accept: 'application/json',
          'X-Spruce-Snapshot': `sha256=${signature}`,
        },
      });
    } catch {
      return reply.code(502).send({ error: 'snapshot_unavailable' });
    }

    if (response.status >= 300 && response.status < 400) {
      return reply.code(502).send({ error: 'snapshot_unavailable' });
    }
    if (!response.ok) {
      return reply.code(response.status === 401 || response.status === 503 ? response.status : 502).send({
        error: 'snapshot_unavailable',
      });
    }

    const body = await response.json();
    if (!isRecord(body) || !Array.isArray(body.lots)) {
      return reply.code(502).send({ error: 'snapshot_unavailable' });
    }

    return { lots: body.lots };
  });
}

export default {
  name,
  register,
} satisfies SpruceNodeModule;

function asCount(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

function asPositiveInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function asClosedAt(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}[ap]m$/.test(raw)) {
    return '';
  }

  return raw;
}

function asAmount(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  const raw = String(value ?? '').trim();
  if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw)) {
    return '';
  }

  const [whole, frac = ''] = raw.split('.');
  return `${whole}.${frac.padEnd(2, '0')}`;
}

function asText(value: unknown, max: number): string {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (raw === '') {
    return '';
  }

  return raw.length > max ? raw.slice(0, max) : raw;
}

function asUrl(value: unknown, max: number): string {
  const raw = String(value ?? '').trim();
  if (raw === '' || raw.length > max) {
    return '';
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : '';
}

function asUnitInterval(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

function asImageFit(value: unknown): 'contain' | '' {
  return String(value ?? '').trim() === 'contain' ? 'contain' : '';
}

function parseLotIds(value: unknown): number[] | null {
  const raw = typeof value === 'string' ? value : '';
  if (raw === '' || raw.length > 400) {
    return null;
  }

  const ids = new Set<number>();
  for (const part of raw.split(',')) {
    const id = asPositiveInt(part.trim());
    if (id <= 0) {
      return null;
    }
    ids.add(id);
    if (ids.size > 48) {
      return null;
    }
  }

  return ids.size === 0 ? null : [...ids].sort((a, b) => a - b);
}

function bearer(value: unknown): string {
  const header = headerValue(value);
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : '';
}

function headerValue(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : '';
  }

  return typeof value === 'string' ? value : '';
}

function isQuery(value: unknown): value is { lots?: unknown } {
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is { lots?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
