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
    
    // --- 1. 物理座標優先 (來自你最初的腳本邏輯，最穩) ---
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) [_, lat, lng] = coordMatch;

    // --- 2. 提取原始店名訊號 ---
    let fullQuery = urlObj.searchParams.get('q');
    if (!fullQuery) {
      const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
      if (poiMatch && poiMatch[1]) {
        fullQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, c) => String.fromCharCode(parseInt(c, 16)));
      }
    }

    // --- 3. 【全球通用去噪邏輯】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // A. 移除開頭與結尾的郵遞區號或門牌 (3-5位連續數字)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').replace(/\d{3,5}$/, '').trim();

      // B. 處理「地址前綴」：如果店名在後，通常會經過路名門牌 (例如：南京路10號...)
      // 我們移除所有包含路/街/號等特徵的字串開頭 (支援多國特徵)
      searchQuery = searchQuery.replace(/^.*?\d+(?:號|号|号|หมู่ที่|Rural Rd|Rd\.|St\.)/, '');

      // C. 處理「地址後綴」：如果店名在前，通常在「空格+數字」處截斷
      // (例如：เฮือนอุ้ย 86...) -> 剩下 เฮือนอุ้ย
      const parts = searchQuery.split(/ (?=\d)|,|，/);
      searchQuery = parts[0].trim();
    }

    // 防呆：如果濾過頭了，就用回原始字串
    if (!searchQuery || searchQuery.length < 2) searchQuery = fullQuery;

    // --- 4. DDG 校正 (僅在無座標時執行) ---
    if (!lat && searchQuery && !searchQuery.includes('Google')) {
      try {
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          searchQuery = ddgData.results[0].name || searchQuery;
        }
      } catch (e) { console.error("DDG Error"); }
    }

    // --- 5. 輸出跳轉 ---
    let appleMapsUrl;
    if (lat && lng) {
      // 有座標時：ll 強行插針，sll 輔助 Apple Maps 搜尋 POI 標籤
      appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
    } else if (searchQuery) {
      // 沒座標時：直接交給 Apple Maps 全球搜尋引擎
      appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`;
    }

    if (appleMapsUrl) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send("解析失敗");
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};