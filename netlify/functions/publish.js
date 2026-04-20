exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { token, owner, repo, file, day, entry } = JSON.parse(event.body);

    if (!token || !owner || !repo || !file || !day || !entry) {
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

    const ms = "<!-- DAILY_START -->";
    const me = "<!-- DAILY_END -->";

    if (!currentHtml.includes(ms) || !currentHtml.includes(me)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Markers not found in file" }) };
    }

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Extract existing posts array from between markers
    const markerStart = currentHtml.indexOf(ms);
    const markerEnd = currentHtml.indexOf(me) + me.length;
    const insideMarkers = currentHtml.slice(currentHtml.indexOf(ms) + ms.length, currentHtml.indexOf(me));

    // Extract the posts array content
    const postsStart = insideMarkers.indexOf("const posts = [") ;
    const postsArrayStart = insideMarkers.indexOf("[", postsStart);

    // Find the closing ]; of posts array
    let depth = 0, postsArrayEnd = -1;
    for (let i = postsArrayStart; i < insideMarkers.length; i++) {
      if (insideMarkers[i] === "[") depth++;
      if (insideMarkers[i] === "]") { depth--; if (depth === 0) { postsArrayEnd = i; break; } }
    }

    let existingEntries = insideMarkers.slice(postsArrayStart + 1, postsArrayEnd).trim();

    // Remove existing entry for this day if it exists
    // Split by "},\n  {" pattern to find and replace day entry
    let currentDayLine = `const CURRENT_DAY = ${day};`;

    // Rebuild the marker block: update CURRENT_DAY and append new entry
    let newEntries = existingEntries;

    // Remove old entry for this day if present
    const dayPattern = new RegExp(`\\s*\\{[^{}]*day:\\s*${day}[^{}]*\\}`, 'g');
    newEntries = newEntries.replace(dayPattern, '');

    // Clean up trailing commas
    newEntries = newEntries.replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '').trim();

    // Add new entry
    if (newEntries.length > 0) {
      newEntries = newEntries + ',\n' + entry;
    } else {
      newEntries = entry;
    }

    const newBlock = `${ms}\n${currentDayLine}\nconst posts = [\n${newEntries}\n];\n${me}`;
    const newHtml = currentHtml.slice(0, markerStart) + newBlock + currentHtml.slice(markerEnd);

    // Push to GitHub
    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Day ${day} post: ${today}`,
        content: Buffer.from(newHtml).toString("base64"),
        sha: fileData.sha
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return { statusCode: putRes.status, body: JSON.stringify({ error: err.message || "Failed to push" }) };
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
