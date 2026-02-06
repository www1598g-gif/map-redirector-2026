module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }
    });

    const finalUrl = response.url;
    // --- 新增：讀取 HTML 以應付黑箱網址 ---
    const html = await response.text(); 
    const urlObj = new URL(finalUrl);
    
    // 1. 先抓座標（維持你的主邏輯）
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) [_, lat, lng] = coordMatch;

    // 2. 抓店名（維持你的主邏輯，但增加「標題補償」）
    let searchQuery = urlObj.searchParams.get('q');
    if (!searchQuery) {
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } else {
        // --- 核心補強：如果網址完全沒店名，從 HTML Title 挖 (解決 6eugLJo4 等連結) ---
        const titleMatch = html.match(/<title>(.*?) - Google (?:Maps|地圖)<\/title>/);
        if (titleMatch) searchQuery = titleMatch[1];
      }
    }

    // 3. DDG 深度校正（維持你的主邏輯）
    if (!lat && searchQuery) {
      try {
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Error"); }
    }

    // 4. 組合連結（維持你的主邏輯）
    let appleMapsUrl;
    if (lat && lng) {
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
    } else if (searchQuery) {
      appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
    }

    if (appleMapsUrl) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`無法解析座標或店名。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};