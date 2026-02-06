module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15' }
    });

    const finalUrl = response.url;
    const html = await response.text();
    const urlObj = new URL(finalUrl);
    
    // --- 1. 店名與全地址提取 (核心優化) ---
    let searchQuery = urlObj.searchParams.get('q');
    
    // 如果 URL 沒參數，直接從 HTML 的初始化狀態 JSON 陣列中硬挖全名
    if (!searchQuery || searchQuery.includes('Google')) {
      // 這個 Regex 專門對準 Google Maps 內部儲存地點名稱與地址的 JS 位置
      const fullInfoMatch = html.match(/window\.APP_INITIALIZATION_STATE=\[\[\[.*?\],\[.*?\],\[.*?\],.*?\],\[\[\["(.*?)",/);
      if (fullInfoMatch && fullInfoMatch[1]) {
        searchQuery = fullInfoMatch[1]; // 這裡會拿到最完整的：店名 + 詳細地址
      } else {
        // 備援：從 link 標籤的 q 參數挖
        const deepQMatch = html.match(/[\?&]q=([^&" ]+)/);
        if (deepQMatch) searchQuery = decodeURIComponent(deepQMatch[1].replace(/\+/g, ' '));
      }
    }

    // 再次確認不是無效字眼
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 2. 座標補完：DDG 校正 (使用全名搜尋) ---
    let lat, lng;
    const urlCoordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    if (urlCoordMatch) {
      [_, lat, lng] = urlCoordMatch;
    } else if (searchQuery) {
      try {
        // 使用剛才抓到的「完整店名+地址」去問 DDG
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 若 DDG 有更精確的名稱，更新它
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Error"); }
    }

    // --- 3. 輸出跳轉 (改用搜尋提示 sll) ---
    if (lat && lng && searchQuery) {
      // sll 告訴 Apple Maps「就在清邁這附近找這串全名」
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法解析地點。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('API 錯誤: ' + err.message);
  }
};