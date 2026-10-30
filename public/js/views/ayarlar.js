// Ayarlar sayfası: Profil ile aynı modülü kullanır, sadece ayar bölümlerini gösterir
import { renderPage } from './profil.js';
export const render = (root, params) => renderPage(root, params, 'settings');
