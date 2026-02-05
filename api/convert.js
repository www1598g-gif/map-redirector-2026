export default async function handler(req, res) {
  // 1. 取得網址並進行解碼，確保特殊字元 (? & =) 不會導致路徑錯誤
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('No URL provided');
  
  const decodedUrl = decodeURIComponent(rawUrl);

  try {
    // 2. 模擬瀏覽器 Header，這能防止 Google 回傳錯誤的中繼頁面
    const response = await fetch(decodedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    });

    const finalUrl = response.url;
    console.log("Final URL fetched:", finalUrl); // 你可以在 Vercel 的 Logs 看到這個輸出

    // 3. 使用更強大的 Regex 同時捕捉多種座標格式
    // 格式包含: @25.123,121.123 或 !3d25.123!4d121.123
    const regex = /(-?\d+\.\d+)[,!][34]?d?(-?\d+\.\d+)/;
    const match = finalUrl.match(regex);

    if (match) {
      const lat = match[1];
      const lng = match[2];
      
      // 4. 重定向至 Apple Maps 協議
      const appleMapsUrl = `http://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
      res.redirect(302, appleMapsUrl);
    } else {
      res.status(404).send(`無法提取座標。解析後的網址為: ${finalUrl}`);
    }
  } catch (err) {
    res.status(500).send('伺服器轉換失敗: ' + err.message);
  }
}