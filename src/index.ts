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
