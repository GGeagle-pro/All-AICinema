// 점검용: 채널별 유튜브 재생목록이 사이트 영상과 어떻게 겹치는지 출력 (API 키 필요, 아무것도 저장하지 않음)
import { readFile } from "node:fs/promises";
import { apiKey, listPlaylists, playlistVideoIds } from "./youtube-api.mjs";
import { detectSeries, assignSeries } from "./series.mjs";
if (!apiKey()) { console.log("API 키 없음"); process.exit(0); }
const d = JSON.parse(await readFile(new URL("../public/data/videos.json", import.meta.url), "utf8"));
const byCid = new Map();
for (const x of d.items) { const cid = d.cids[x[7]]; if (!cid) continue; if (!byCid.has(cid)) byCid.set(cid, { name: d.channels[x[2]], vids: [] }); byCid.get(cid).vids.push({ id: x[0], title: x[1] }); }
for (const [cid, { name, vids }] of byCid) {
  const site = new Set(vids.map((v) => v.id));
  let pls = [];
  try { pls = await listPlaylists(cid); } catch (e) { console.log(`\n## ${name}: 재생목록 오류 ${e.message}`); continue; }
  console.log(`\n## ${name} (사이트 영상 ${vids.length}) 재생목록 ${pls.length}개`);
  const withIds = [];
  for (const p of pls) {
    let ids = [];
    try { ids = await playlistVideoIds(p.id); } catch {}
    withIds.push({ title: p.title, ids });
  }
  const r = assignSeries(vids, withIds); const c = new Map(); for (const n of r.values()) c.set(n, (c.get(n) || 0) + 1);
  console.log(`   => 묶임 ${r.size}/${vids.length}: ${[...c].sort((a, b) => b[1] - a[1]).map(([n, k]) => `${n}(${k})`).join(", ") || "-"}`);
  if (process.argv.includes("-v")) for (const v of vids) console.log(`      ${r.get(v.id) ? "[" + r.get(v.id) + "]" : "[ -- ]"} ${v.title.slice(0, 60)}`);
}
