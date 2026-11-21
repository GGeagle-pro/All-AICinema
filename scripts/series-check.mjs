// 점검용: 채널별 유튜브 재생목록이 사이트 영상과 어떻게 겹치는지 출력 (API 키 필요, 아무것도 저장하지 않음)
import { readFile } from "node:fs/promises";
import { apiKey, listPlaylists, playlistVideoIds } from "./youtube-api.mjs";
import { detectSeries } from "./series.mjs";
if (!apiKey()) { console.log("API 키 없음"); process.exit(0); }
const d = JSON.parse(await readFile(new URL("../public/data/videos.json", import.meta.url), "utf8"));
const byCid = new Map();
for (const x of d.items) { const cid = d.cids[x[7]]; if (!cid) continue; if (!byCid.has(cid)) byCid.set(cid, { name: d.channels[x[2]], vids: [] }); byCid.get(cid).vids.push({ id: x[0], title: x[1] }); }
for (const [cid, { name, vids }] of byCid) {
  const site = new Set(vids.map((v) => v.id));
  let pls = [];
  try { pls = await listPlaylists(cid); } catch (e) { console.log(`\n## ${name}: 재생목록 오류 ${e.message}`); continue; }
  console.log(`\n## ${name} (사이트 영상 ${vids.length}) 재생목록 ${pls.length}개`);
  for (const p of pls) {
    let ids = [];
    try { ids = await playlistVideoIds(p.id); } catch {}
    const hit = ids.filter((id) => site.has(id)).length;
    console.log(`   - ${p.title} | 영상 ${p.count} | 사이트와 겹침 ${hit}`);
  }
  const t = detectSeries(vids); const c = new Map(); for (const n of t.values()) c.set(n, (c.get(n) || 0) + 1);
  console.log(`   (제목 분석: ${[...c].map(([n, k]) => `${n}(${k})`).join(", ") || "-"})`);
}
