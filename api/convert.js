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
    
    // --- 1. 原始訊號抓取 ---
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

    // --- 2. 【核心修正：核心名稱提取器】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // A. 先去掉郵遞區號 (例如 306)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').trim();

      // B. 移除行政區前綴 (例如：新竹縣關西鎮)
      // 邏輯：移除「X縣X市」或「X鎮X區」等開頭字眼，直到看到馬武督咖啡廳
      searchQuery = searchQuery.replace(/^(?:.{2,3}(?:縣|市))?.{2,3}(?:鎮|區|市|鄉|路)/, '').trim();

      // C. 泰國/特殊地址處理：如果還有空格或泰文地址標籤，只拿第一個塊
      const parts = searchQuery.split(/ |หมู่ที่|,|，/);
      // 挑選第一個長度大於 2 的字串當核心名（避開空字元或殘留編號）
      searchQuery = parts.find(p => p.length >= 2) || parts[0];
    }

    // 防呆：再次確認抓到的不是無效的通用標題
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 3. DDG 校正 (使用純淨核心名稱) ---
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

    // --- 4. 組合輸出 (sll 搜尋提示) ---
    if (lat && lng && searchQuery) {
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法還原。原始資料：${fullQuery}`);
  } catch (err) {
    res.status(500).send('API 執行失敗: ' + err.message);
  }
};