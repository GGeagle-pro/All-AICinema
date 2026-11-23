// 지금 있는 videos.json·desc.json 으로 첫 화면용 파일(videos-recent.json)과 설명 조각(data/desc/)을 다시 만듦
//  (보통은 fetch-videos.mjs 가 수집할 때 자동으로 만들어요. 수동으로 다시 만들 때: node scripts/split-data.mjs)
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSplit } from "./fetch-videos.mjs";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data");
const d = JSON.parse(await readFile(resolve(DATA, "videos.json"), "utf8"));
let desc = {}; try { desc = JSON.parse(await readFile(resolve(DATA, "desc.json"), "utf8")); } catch {}
const videos = d.items.map((x) => ({
  id: x[0], title: x[1], channel: d.channels[x[2]] || "", categories: (Array.isArray(x[3]) ? x[3] : [x[3]]).map((i) => d.cats[i]).filter(Boolean),
  published: new Date((x[4] || 0) * 1000).toISOString(), views: x[5] || 0, short: x[6] === 1, cid: d.cids[x[7]] || "", manual: x[8] === 1,
  series: Number.isInteger(x[9]) && x[9] >= 0 ? d.series[x[9]] : "",
}));
const save = async (file, obj) => { await writeFile(file + ".tmp", JSON.stringify(obj)); await rename(file + ".tmp", file); };
await writeSplit({ videos, desc, generatedAt: d.generatedAt, avatars: d.avatars, srcs: d.srcs, save, kids: d.kids || [] });
console.log(`첫 화면용 ${Math.min(videos.length, 2000)}+편, 설명 조각 저장`);
