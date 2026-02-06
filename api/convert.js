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
    
    // --- 1. 抓取原始 POI 字串 ---
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

    // --- 2. 【核心修正：IC 級訊號剝離】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // Step A: 移除開頭 3~5 碼郵遞區號 (解決 306...)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '').trim();

      // Step B: 針對台灣：強制剝離「XX縣/市XX鎮/區/鄉/市」
      // 這個正則不需空格，直接對準台灣行政層級
      searchQuery = searchQuery.replace(/^(?:.{2,3}(?:縣|市))?.{2,3}(?:鎮|區|鄉|市|村|里)/, '').trim();

      // Step C: 針對泰國與通用：在「地址特徵碼」處截斷雜訊
      // 包含：หมู่ที่ (泰文村落)、Rural Rd (農村路)、地址逗號
      const parts = searchQuery.split(/,|หมู่ที่|Rural Rd/);
      searchQuery = parts[0].trim();
    }

    // 防呆：避免無效字眼
    if (searchQuery && (searchQuery.includes('Google Maps') || searchQuery.includes('Google 地圖'))) {
      searchQuery = null;
    }

    // --- 3. DDG 精確校正 (使用純淨店名) ---
    let lat, lng;
    if (searchQuery) {
      try {
        // 現在傳給 DDG 的會是「馬武督咖啡廳」或「เฮือนอุ้ย ที่พักแม่กำปอง」
        const ddgRes = await fetch(`https://duckduckgo.com/local.js?q=${encodeURIComponent(searchQuery)}`);
        const ddgData = await ddgRes.json();
        if (ddgData.results?.[0]) {
          lat = ddgData.results[0].lat;
          lng = ddgData.results[0].lon;
          searchQuery = ddgData.results[0].name || searchQuery;
        }
      } catch (e) { console.error("DDG Calibration Failed"); }
    }

    // --- 4. 輸出跳轉 ---
    if (lat && lng && searchQuery) {
      // 帶上 sll 錨點，確保 Apple Maps 知道要在新竹關西或清邁搜尋
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`訊號丟失。原始資料：${fullQuery || finalUrl}`);
  } catch (err) {
    res.status(500).send('API 失敗: ' + err.message);
  }
};