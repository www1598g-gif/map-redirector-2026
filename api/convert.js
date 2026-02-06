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
    
    // 如果 URL 沒參數，或是參數只有通用的 "Google Maps"
    if (!searchQuery || searchQuery === 'Google Maps' || searchQuery === 'Google 地圖') {
      // (1) 嘗試從網址路徑提取
      const nameMatch = finalUrl.match(/\/(?:place|search)\/([^\/\?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
      } else {
        // (2) 核心修正：從 HTML 原始碼中強行抓取內部傳輸用的 q 參數
        // 這能解決你提供的 6eugLJo4 這種黑箱網址
        const internalQMatch = html.match(/[\?&]q=([^&" ]+)/);
        if (internalQMatch) {
          searchQuery = decodeURIComponent(internalQMatch[1].replace(/\+/g, ' '));
        }

        // (3) 備援：如果上述都失敗，才掃描 metadata
        if (!searchQuery || searchQuery.includes('Google Maps')) {
          const ogTitle = html.match(/property="og:title" content="(.*?)"/);
          const rawTitle = html.match(/<title>(.*?)<\/title>/i);
          let extractedTitle = ogTitle ? ogTitle[1] : (rawTitle ? rawTitle[1] : null);

          if (extractedTitle && !extractedTitle.includes('Google Maps') && !extractedTitle.includes('Google 地圖')) {
            searchQuery = extractedTitle.replace(/\s*[-–—]\s*Google\s*(?:Maps|地圖).*/i, '').trim();
          }
        }
      }
    }

    // --- 2. 座標補完：DDG 校正 ---
    // 注意：HTML 內出現的座標通常是「目前預覽位置」，不可直接使用
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;

    if (coordMatch) {
      [_, lat, lng] = coordMatch;
    } else if (searchQuery && searchQuery !== 'Google Maps' && searchQuery !== 'Google 地圖') {
      try {
        // 拿抓到的「真店名」去問 DuckDuckGo
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
    } else if (searchQuery && searchQuery !== 'Google Maps' && searchQuery !== 'Google 地圖') {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法解析。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};