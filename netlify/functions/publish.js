exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, file, content } = JSON.parse(event.body);

    if (!token || !owner || !repo || !file || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${file}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Netlify-Publisher"
    };

    // Get current file
    const getRes = await fetch(apiBase, { headers });
    if (!getRes.ok) {
      const err = await getRes.json();
      return { statusCode: getRes.status, body: JSON.stringify({ error: err.message || "Failed to fetch file" }) };
    }
    const fileData = await getRes.json();
    const currentHtml = Buffer.from(fileData.content, "base64").toString("utf8");

    // Replace between markers
    const ms = "<!-- DAILY_START -->";
    const me = "<!-- DAILY_END -->";
    const regex = new RegExp(`${ms.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${me.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

    if (!regex.test(currentHtml)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Markers <!-- DAILY_START --> and <!-- DAILY_END --> not found in file" }) };
    }

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const newHtml = currentHtml.replace(regex, `${ms}\n<!-- Updated: ${today} -->\n${content}\n${me}`);

    // Push to GitHub
    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Daily update: ${today}`,
        content: Buffer.from(newHtml).toString("base64"),
        sha: fileData.sha
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return { statusCode: putRes.status, body: JSON.stringify({ error: err.message || "Failed to push to GitHub" }) };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, message: `Published! Netlify deploying now...` })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
