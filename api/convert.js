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
    
    // --- 1. 抓取原始全名 (解決 ID 型連結) ---
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

    // --- 2. 【核心修正：極簡濾波器】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // A. 移除開頭可能有的郵遞區號 (3~5位數字)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').trim();

      // B. 關鍵：在「空格+數字」或「逗號」處切斷
      // 為什麼？因為店名後通常跟著門牌號碼或郵遞區號（例如：馬武督咖啡廳 306... 或 Heuan Ui 86...）
      // 我們只取第一個長度足夠的片段
      const parts = searchQuery.split(/ (?=\d)|,|，|หมู่ที่/);
      searchQuery = parts[0].trim();
    }

    // 防呆：確保不是無效字眼
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 3. DDG 校正 (用最乾淨的店名換座標) ---
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

    // --- 4. 輸出跳轉 (帶上 sll 避免搜尋飄移) ---
    if (lat && lng && searchQuery) {
      // sll 讓 Apple Maps 在座標附近找這家店，準確度最高
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法還原。地址：${fullQuery}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};