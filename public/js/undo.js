// Silinen kaydı toast'taki "Geri al" ile geri getir (kayıtlar yumuşak silindiği için geri alınabilir)
import * as db from './db.js';
import { toast } from './util.js';
import { refresh } from './app.js';

export async function removeWithUndo(store, id, msg = 'Silindi', { also = [] } = {}) {
  const rec = await db.get(store, id);
  if (!rec) return;
  const extra = [];
  for (const [st, fn] of also) for (const r of await db.list(st, fn)) extra.push([st, r]);
  await db.remove(store, id);
  for (const [st, r] of extra) await db.remove(st, r.id);
  await refresh();
  toast(msg, 4500, {
    label: 'Geri al',
    onClick: async () => {
      const { deleted_at, ...rest } = rec;
      await db.put(store, rest);
      for (const [st, r] of extra) {
        const { deleted_at: _d, ...x } = r;
        await db.put(st, x);
      }
      refresh();
    },
  });
}
