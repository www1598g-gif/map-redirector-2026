export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('No URL provided');

  try {
    // 伺服器端追蹤轉址，繞過手機端的 CORS 限制
    const response = await fetch(url, { redirect: 'follow' });
    const finalUrl = response.url;

    // 使用你設計的 Regex 濾波器提取座標
    const regex = /(?<=!3d|!4d|@)([0-9.-]{7,})/g;
    const coords = finalUrl.match(regex);

    if (coords && coords.length >= 2) {
      const [lat, lng] = coords;
      // 成功後直接跳轉至 Apple Maps
      res.redirect(302, `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`);
    } else {
      res.status(404).send('無法提取座標，請確認連結格式');
    }
  } catch (err) {
    res.status(500).send('轉換伺服器忙碌中');
  }
}