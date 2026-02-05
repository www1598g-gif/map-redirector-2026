module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });

    const finalUrl = response.url;
    
    // 預選最準確的 Google 座標標籤：!3d...!4d 或 @緯度,經度 或 center=...
    const urlRegex = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)|@(-?\d+\.\d+),(-?\d+\.\d+)|[?&](?:center|ll|q)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/;
    let match = finalUrl.match(urlRegex);
    let lat, lng;

    if (match) {
      lat = match[1] || match[3] || match[5];
      lng = match[2] || match[4] || match[6];
    } else {
      // 網址沒座標時才讀取前 50KB HTML，避免記憶體溢出
      const text = await response.text();
      const bodyMatch = text.substring(0, 50000).match(urlRegex);
      if (bodyMatch) {
        lat = bodyMatch[1] || bodyMatch[3] || bodyMatch[5];
        lng = bodyMatch[2] || bodyMatch[4] || bodyMatch[6];
      }
    }

    if (lat && lng && Math.abs(parseFloat(lat)) <= 90) {
      // 構建 Apple Maps 連結：q 是插針點，ll 是畫面中心
      const appleMapsUrl = `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
      return res.redirect(302, appleMapsUrl);
    }

    res.status(404).send(`未能識別有效座標。解析後的網址：${finalUrl}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('伺服器執行錯誤: ' + err.message);
  }
};