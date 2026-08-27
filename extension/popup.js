const query = document.getElementById('query');
const search = document.getElementById('search');
const status = document.getElementById('status');
const results = document.getElementById('results');

search.addEventListener('click', async () => {
  const q = query.value.trim();
  if (!q) return;
  status.textContent = 'กำลังค้นหาใน Shopee...';
  results.innerHTML = '';

  const tabs = await chrome.tabs.query({ url: ['https://shopee.co.th/*'] });
  const tab = tabs.find((t) => t.active) || tabs[0];
  if (!tab?.id) {
    status.textContent = 'ไม่พบแท็บ Shopee — เปิด Shopee ก่อน';
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'STANDALONE_SEARCH', query: q });
    if (response?.error) throw new Error(response.error);
    const products = response?.products || [];
    status.textContent = `พบ ${products.length} สินค้า`;
    results.innerHTML = products.map((p) => `<div class="item"><div>${escapeHtml(p.name)}</div><div class="price">${p.price ? `฿${Number(p.price).toLocaleString()}` : '-'}</div><div class="muted"><a href="${escapeAttr(p.url)}" target="_blank">เปิดสินค้า</a></div></div>`).join('');
  } catch (error) {
    status.textContent = `ผิดพลาด: ${String(error.message || error)}`;
  }
});

function escapeHtml(v) { return String(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(v) { return escapeHtml(v); }
