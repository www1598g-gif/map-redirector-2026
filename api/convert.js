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
    
    // --- 1. 店名提取：多重感測器邏輯 ---
    let searchQuery = urlObj.searchParams.get('q');
    
    if (!searchQuery) {
      // (1) 嘗試從網址路徑提取
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } else {
        // (2) 網址沒訊號，啟動 HTML 深度掃描
        // 同時檢查 og:title, twitter:title 以及 <title> 標籤
        const ogTitle = html.match(/property="og:title" content="(.*?)"/);
        const twTitle = html.match(/name="twitter:title" content="(.*?)"/);
        const rawTitle = html.match(/<title>(.*?)<\/title>/i);

        let extractedTitle = ogTitle ? ogTitle[1] : (twTitle ? twTitle[1] : (rawTitle ? rawTitle[1] : null));

        if (extractedTitle) {
          // 去除「 - Google Maps」或「 - Google 地圖」等後綴雜訊
          searchQuery = extractedTitle.replace(/\s*[-–—]\s*Google\s*(?:Maps|地圖).*/i, '').trim();
        }
      }
    }

    // --- 2. 座標補完：DDG 校正 (維持你的主邏輯) ---
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) {
      [_, lat, lng] = coordMatch;
    } else if (searchQuery && searchQuery !== 'Google Maps') {
      try {
        // 使用 DuckDuckGo (DDG) 換取 Apple Maps 等級的精確座標
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Calibration Failed"); }
    }

    // --- 3. 輸出跳轉 ---
    if (lat && lng) {
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