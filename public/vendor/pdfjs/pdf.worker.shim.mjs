// pdf.js işçisi: önce Safari uyumluluk yaması, sonra asıl işçi (dışa aktarımlar korunur)
import './rs-polyfill.mjs';
export * from './pdf.worker.min.mjs';
