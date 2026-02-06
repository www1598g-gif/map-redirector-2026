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
    
    // --- 1. 店名與全地址提取 (精密對齊) ---
    let searchQuery;
    // 瞄準 0x...:0x... 格式後面的第一個完整引號內容 (這是 Google 內部的 POI 全名)
    const poiMatch = html.match(/"0x[0-9a-f]+:0x[0-9a-f]+","((?:[^"\\]|\\.)*?)"/);
    if (poiMatch && poiMatch[1]) {
      // 處理 JSON 跳脫字元，還原完整的泰文店名
      searchQuery = poiMatch[1].replace(/\\"/g, '"').replace(/\\u([0-9a-f]{4})/gi, (m, code) => 
        String.fromCharCode(parseInt(code, 16))
      );
    }

    // 備援：若 POI 匹配失敗，才改抓 link 參數
    if (!searchQuery || searchQuery.includes('Google')) {
      const linkQMatch = html.match(/[\?&]q=([^&" ]+)/);
      if (linkQMatch) searchQuery = decodeURIComponent(linkQMatch[1].replace(/\+/g, ' '));
    }

    // --- 2. 座標補完：優先交給 DDG 校正 (解決歪掉的問題) ---
    let lat, lng;
    if (searchQuery && !searchQuery.includes('Google')) {
      try {
        // 使用剛才抓到的「เฮือนอุ้ย ที่พักแม่กำปอง」全名去搜尋
        // 這是你實測 100% 準確的路徑
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          // 用 DDG 的標準名稱更新標籤
          if (ddgData.results[0].name) searchQuery = ddgData.results[0].name;
        }
      } catch (e) { console.error("DDG Calibration Failed"); }
    }

    // --- 3. 輸出跳轉 (組合 Apple Maps 最佳參數) ---
    if (lat && lng && searchQuery) {
      // 用 q 帶入全名，sll 帶入 DDG 座標作為搜尋錨點
      // 這會讓 Apple Maps 像你手動搜尋一樣精準
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`訊號解析失敗。最終網址：${finalUrl}`);
  } catch (err) {
    res.status(500).send('API 失敗: ' + err.message);
  }
};