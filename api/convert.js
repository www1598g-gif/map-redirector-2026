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
    const urlObj = new URL(finalUrl);
    
    // 1. 先從網址抓座標 (維持你的主邏輯)
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) [_, lat, lng] = coordMatch;

    // 2. 抓店名 (維持你的主邏輯)
    let searchQuery = urlObj.searchParams.get('q');
    if (!searchQuery) {
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    }

    // --- 【新增：座標補強邏輯】 ---
    // 如果網址沒座標 (你說的 9 成狀況)，但有店名，就去 DDG 抓座標
    if (!lat && searchQuery) {
      try {
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
        }
      } catch (e) { console.error("DDG Error"); }
    }
    // ----------------------------

    // 3. 組合連結 (維持你的主邏輯)
    let appleMapsUrl;
    if (lat && lng) {
      // 綜合模式：ll 定位插針，q 顯示店名
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
    } else if (searchQuery) {
      appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
    }

    if (appleMapsUrl) {
      // 大流量關鍵：設定快取 1 小時，相同的搜尋不必跑兩次
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`解析失敗。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};