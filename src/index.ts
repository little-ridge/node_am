import type { SpruceNodeApp, SpruceNodeModule } from '../../node_core/src/types.ts';

export const name = '@little-ridge/node_am';

export async function register(app: SpruceNodeApp): Promise<void> {
  app.rooms.allow(/^auction:\d+$/);
  app.rooms.allow(/^lot:\d+$/);

  app.webhooks.on('am/bid', (payload) => {
    const auctionId = asPositiveInt(payload.auction_id ?? payload.auctionId);
    const lotId = asPositiveInt(payload.lot_id ?? payload.lotId);
    const amount = asAmount(payload.amount);
    const bidId = asPositiveInt(payload.bid_id ?? payload.bidId);

    if (auctionId === 0 || lotId === 0 || amount === '') {
      app.http.log.warn({ payload }, 'ignored am/bid webhook');
      return;
    }

    const rooms = [`auction:${auctionId}`, `lot:${lotId}`];
    app.hub.broadcast(rooms, {
      type: 'event',
      event: 'bid.created',
      rooms,
      payload: {
        bidId,
        auctionId,
        lotId,
        amount,
      },
    });
  });
}

export default {
  name,
  register,
} satisfies SpruceNodeModule;

function asPositiveInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
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
