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
    
    // --- 1. 採樣原始訊號 ---
    let fullQuery;
    const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
    if (poiMatch && poiMatch[1]) {
      fullQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, code) => 
        String.fromCharCode(parseInt(code, 16))
      );
    }

    // --- 2. 【核心：店名去噪濾波器】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // 步驟 A: 移除開頭的郵遞區號 (例如 306...)
      searchQuery = searchQuery.replace(/^\d{3,5}\s*/, '');
      
      // 步驟 B: 在特定關鍵字處「切斷」，只取前半段最精華的店名
      // 針對台灣：切除「縣/市/鎮/區」之後的冗餘
      // 針對泰國：切除「หมู่ที่ / Rural Rd」之後的地址
      const delimiters = / |หมู่ที่|新竹縣|關西鎮|縣|市|鎮|區|路|Rural Rd|,/;
      searchQuery = searchQuery.split(delimiters)[0].trim();
    }

    // --- 3. DDG 校正 (使用純淨訊號) ---
    let lat, lng;
    if (searchQuery && searchQuery !== 'Google Maps' && searchQuery !== 'Google 地圖') {
      try {
        // 使用清洗後的「馬武督咖啡廳」或「เฮือนอุ้ย」
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 更新為 DDG 標準名稱，讓 Apple Maps 插針標籤更專業
          searchQuery = ddgData.results[0].name || searchQuery;
        }
      } catch (e) { console.error("DDG Error"); }
    }

    // --- 4. 輸出與快取 ---
    if (lat && lng && searchQuery) {
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`無法還原地標。最終地址：${fullQuery || finalUrl}`);
  } catch (err) {
    res.status(500).send('執行失敗: ' + err.message);
  }
};