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
    
    // --- 1. 店名提取 (濾除雜訊並深挖訊號) ---
    let searchQuery = urlObj.searchParams.get('q');
    
    // 如果 URL 沒參數，或是參數是無效的 "Google Maps"
    if (!searchQuery || searchQuery.includes('Google')) {
      // (1) 核心修正：從 HTML 內部的 link 參數深挖真正的地點訊息 (解決清邁連結的關鍵)
      const deepQMatch = html.match(/[\?&]q=([^&" ]+)/);
      if (deepQMatch) {
        searchQuery = decodeURIComponent(deepQMatch[1].replace(/\+/g, ' '));
      }

      // (2) 備援：從初始化狀態 JSON 抓取全名
      if (!searchQuery || searchQuery.includes('Google')) {
        const initStateMatch = html.match(/window\.APP_INITIALIZATION_STATE=\[\[\[.*?\],\[.*?\],\[.*?\],.*?\],\[\[\["(.*?)",/);
        if (initStateMatch) searchQuery = initStateMatch[1];
      }
    }

    // 再次確認 searchQuery 不是無效字眼，否則會導致 DDG 搜尋偏向台中
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 2. 座標補完：DDG 校正 ---
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;

    if (coordMatch) {
      [_, lat, lng] = coordMatch;
    } else if (searchQuery) {
      try {
        // 拿這串長長的泰文/清邁地址去問 DDG
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 若 DDG 有精確名稱，更新標籤名稱
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Calibration Failed"); }
    }

    // --- 3. 輸出跳轉 ---
    if (lat && lng) {
      // ll 負責精確定位，q 負責在 Apple Maps 顯示店名
      const appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法解析。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};