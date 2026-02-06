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
    
    // --- 1. 抓取原始 POI 字串 (包含 ID 型連結) ---
    let fullQuery;
    const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
    if (poiMatch && poiMatch[1]) {
      fullQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, code) => 
        String.fromCharCode(parseInt(code, 16))
      );
    } else {
      const linkQMatch = html.match(/[\?&]q=([^&" ]+)/);
      if (linkQMatch) fullQuery = decodeURIComponent(linkQMatch[1].replace(/\+/g, ' '));
    }

    // --- 2. 【核心修正：店名/地址分離濾波器】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // Step A: 移除開頭 3~5 碼郵遞區號 (解決台灣 306...)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').trim();

      // Step B: 強制剝離台灣行政區 (維持馬武督的成功邏輯)
      searchQuery = searchQuery.replace(/^(?:.{2,3}(?:縣|市))?.{2,3}(?:鎮|區|鄉|市|村|里)/, '').trim();

      // Step C: 關鍵修正！在「空格+數字」或「地址特徵碼」處截斷
      // 理由：店名後面的「 86」是導致泰國地點飄移回台中的主因
      const parts = searchQuery.split(/\s+\d+|หมู่ที่|Rural Rd|,|，/);
      searchQuery = parts[0].trim();
    }

    // 防呆：避免無效字眼導致導航飄移
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 3. DDG 精確校正 ---
    let lat, lng;
    if (searchQuery) {
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

    // --- 4. 組合輸出 (帶上 sll 錨點) ---
    if (lat && lng && searchQuery) {
      // 用最純淨的店名 (q) + 物理座標錨點 (sll)
      // 這樣 Apple Maps 會優先在清邁或關西搜尋，不會被台灣位置干擾
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`訊號解析失敗。原始資料：${fullQuery}`);
  } catch (err) {
    res.status(500).send('API 執行異常: ' + err.message);
  }
};