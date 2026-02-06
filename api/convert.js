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
    
    // --- 1. 最高優先權：URL 內的物理座標 (來自你最初的腳本邏輯) ---
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    let lat, lng;
    if (coordMatch) [_, lat, lng] = coordMatch;

    // --- 2. 獲取店名訊號 ---
    let fullQuery = urlObj.searchParams.get('q');
    if (!fullQuery) {
      // 嘗試從 POI 格式挖 (處理 6eugLJo4 等黑箱 ID)
      const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
      if (poiMatch && poiMatch[1]) {
        fullQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, c) => String.fromCharCode(parseInt(c, 16)));
      }
    }

    // --- 3. 【核心濾波：移除地址雜訊】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // A. 移除郵遞區號與通用後綴
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').replace(/\s*[-–—]\s*Google\s*(?:Maps|地圖).*/i, '').trim();

      // B. 針對台灣：移除開頭的「XX路XX號」或「XX縣XX鎮」 (解決關西牛肉捲餅、馬武督)
      // 這行會切除掉：南京路10號、新竹縣關西鎮、306 等地址訊號
      searchQuery = searchQuery.replace(/^(?:.{2,3}(?:縣|市))?.{2,3}(?:鎮|區|鄉|市|里)?/, '');
      searchQuery = searchQuery.replace(/^.*?[路街段]\d+(?:[號之]\d*)?/, ''); 

      // C. 針對泰國：在空格或地址特徵處截斷 (解決 Heuan Ui)
      searchQuery = searchQuery.split(/ (?=\d)|หมู่ที่|Rural Rd|,|，/)[0].trim();
    }

    // 防呆：如果濾波濾過頭了，回傳原始字串
    if (!searchQuery || searchQuery.length < 2) searchQuery = fullQuery;

    // --- 4. DDG 校準 (只有在 URL 沒座標時執行) ---
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

    // --- 5. 輸出組合 ---
    if (lat && lng) {
      // ll 插針 (如果有座標)，sll 提示區域 (如果沒有 ll)
      const appleMapsUrl = `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(searchQuery || '位置')}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`解析失敗。地址：${fullQuery}`);
  } catch (err) {
    res.status(500).send('API 執行失敗: ' + err.message);
  }
};