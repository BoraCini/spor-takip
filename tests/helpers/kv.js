// Cloudflare KV'nin testler için bellek içi taklidi (kullanılan yüzey kadar)
export function makeKV() {
  const m = new Map();
  const enc = new TextEncoder();
  const toOut = (v, type) => {
    if (v == null) return null;
    if (type === 'json') return JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v));
    if (type === 'arrayBuffer') return typeof v === 'string' ? enc.encode(v).buffer : v.slice(0);
    if (type === 'stream') return new Blob([v]).stream();
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  };
  const kv = {
    _map: m,
    async get(k, type) {
      const e = m.get(k);
      return e ? toOut(e.value, typeof type === 'object' ? type.type : type) : null;
    },
    async getWithMetadata(k, type) {
      const e = m.get(k);
      return e ? { value: toOut(e.value, type), metadata: e.metadata ?? null } : { value: null, metadata: null };
    },
    async put(k, value, opts = {}) {
      let v = value;
      if (value instanceof ArrayBuffer) v = value.slice(0);
      else if (ArrayBuffer.isView(value)) v = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      m.set(k, { value: v, metadata: opts.metadata ?? null, ttl: opts.expirationTtl ?? null });
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const all = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const keys = all.slice(start, start + limit).map((name) => ({ name, metadata: m.get(name).metadata }));
      const done = start + limit >= all.length;
      return { keys, list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
  return kv;
}
