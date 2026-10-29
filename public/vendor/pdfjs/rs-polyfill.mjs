// Safari'de ReadableStream "for await" ile okunamıyor (async iterator yok). pdf.js bunu kullandığı için ekliyoruz.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const values = function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const r = await reader.read();
          if (r.done) reader.releaseLock();
          return r;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return(value) {
        if (!preventCancel) {
          const p = reader.cancel(value);
          reader.releaseLock();
          await p;
        } else reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  Object.defineProperty(ReadableStream.prototype, 'values', { value: values, writable: true, configurable: true });
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}
