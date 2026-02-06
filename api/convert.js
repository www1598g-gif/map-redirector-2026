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
    
    // --- 1. 先抓座標（維持你的主邏輯：最精準優先）---
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) [_, lat, lng] = coordMatch;

    // --- 2. 抓店名（維持你的主邏輯：當作標籤或搜尋關鍵字）---
    let searchQuery = urlObj.searchParams.get('q');
    if (!searchQuery) {
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    }

    // --- 3. DDG 深度校正（針對 9 成沒座標或地址不全的情況）---
    // 只有在網址沒座標時才執行，不影響有座標時的反應速度
    if (!lat && searchQuery) {
      try {
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 若地址太殘缺，改用 DDG 找回來的更完整名稱
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Error"); }
    }

    // --- 4. 組合連結（維持你的 ll+q 綜合模式）---
    let appleMapsUrl;
    if (lat && lng) {
      // ll 插針確保物理位置，q 確保圖釘標籤名稱
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
    } else if (searchQuery) {
      appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
    }

    if (appleMapsUrl) {
      // 大流量保護：快取 1 小時，減少對 Google/DDG 的負擔
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`無法解析座標或店名。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};