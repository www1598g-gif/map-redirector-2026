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
    
    // --- 1. 店名與全地址提取 (IC 級訊號採樣) ---
    let fullQuery;
    const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
    if (poiMatch && poiMatch[1]) {
      fullQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, code) => 
        String.fromCharCode(parseInt(code, 16))
      );
    }

    // --- 2. 【核心修正：訊號去噪】 ---
    // 你說得對，地址會干擾 DDG。我們只抓「第一個空格或數字前」的內容當作店名搜尋
    let searchQuery = fullQuery;
    if (searchQuery) {
      // 邏輯：泰文店名與地址之間通常有空格或門牌號碼開始（例如 86 หมู่ที่...）
      // 我們切掉「空格+數字」之後的所有內容，只留純店名
      searchQuery = searchQuery.split(/ (?=\d)| หมู่ที่|,/)[0].trim();
    } else {
      // 備援方案：從 URL 參數抓
      const linkQMatch = html.match(/[\?&]q=([^&" ]+)/);
      if (linkQMatch) searchQuery = decodeURIComponent(linkQMatch[1].replace(/\+/g, ' ')).split(/ (?=\d)/)[0];
    }

    // 防呆：再次確認不是無效的通用標題
    if (searchQuery && (searchQuery === 'Google Maps' || searchQuery === 'Google 地圖')) {
      searchQuery = null;
    }

    // --- 3. DDG 搜尋與校正 (使用去噪後的純店名) ---
    let lat, lng;
    if (searchQuery) {
      try {
        // 搜尋「เฮือนอุ้ย ที่พักแม่กำปอง」 -> 這會回傳正確的清邁座標
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 將店名更新為 DDG 認可的標準 POI 名稱
          searchQuery = ddgData.results[0].name || searchQuery;
        }
      } catch (e) { console.error("DDG Calibration Failed"); }
    }

    // --- 4. 輸出跳轉 ---
    if (lat && lng && searchQuery) {
      // 最終輸出給 Apple Maps
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`解析失敗。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('API 執行失敗: ' + err.message);
  }
};