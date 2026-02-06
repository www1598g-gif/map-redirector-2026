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
    
    // --- 1. 抓取原始訊號 (POI 名稱) ---
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

    // --- 2. 【核心修正：店名精確提取器】 ---
    let searchQuery = fullQuery;
    if (searchQuery) {
      // Step A: 移除開頭的郵遞區號 (例如 306)
      searchQuery = searchQuery.replace(/^\d{3,5}/, '');

      // Step B: 移除台灣行政區前綴 (解決馬武督咖啡廳的關鍵)
      // 邏輯：從字串開頭匹配「XX縣/市」加上「XX鎮/區/鄉/市」，若匹配成功則移除
      const cleanName = searchQuery.replace(/^.*? (?:縣|市|鎮|區|鄉|里|鄰)/, '');
      // 如果移除後剩下的長度大於 2 (避免剩下一兩個字)，就採用去噪後的店名
      if (cleanName.length > 2) {
        searchQuery = cleanName;
      }

      // Step C: 處理泰國或其他有空格的格式，只拿第一段最精華名稱 (解決 Heuan Ui)
      searchQuery = searchQuery.split(/ |หมู่ที่|,|，/)[0].trim();
    }

    // --- 3. DDG 精確校正 (如圖 image_65f428.png) ---
    let lat, lng;
    if (searchQuery && !searchQuery.includes('Google')) {
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

    // --- 4. 組合 Apple Maps 最佳參數 (sll 搜尋提示座標) ---
    if (lat && lng && searchQuery) {
      // 帶上 sll 座標讓 Apple Maps 在關西或清邁區域精確吸附 POI
      const appleMapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}&sll=${lat},${lng}`;
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.redirect(302, appleMapsUrl);
    } else if (searchQuery) {
      return res.redirect(302, `https://maps.apple.com/?q=${encodeURIComponent(searchQuery)}`);
    }

    res.status(404).send(`解析失敗。原始地址：${fullQuery || finalUrl}`);
  } catch (err) {
    res.status(500).send('API Error: ' + err.message);
  }
};