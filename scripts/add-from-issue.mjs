// GitHub 이슈("채널·영상 추가" 양식)에 붙여넣은 유튜브 링크를 channels.json 에 반영합니다.
// 실행: ISSUE_BODY="…" node scripts/add-from-issue.mjs  → 결과(마크다운)를 화면에 출력
//
// 보안: 이 스크립트는 저장소 주인이 연 이슈일 때만 실행됩니다 (.github/workflows/add.yml 에서 확인).
//       이슈 내용은 명령어로 실행되지 않고 "유튜브 링크"로 해석되는 부분만 사용합니다.
import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLink, resolveChannel, channelTitle, fetchVideo, clean } from "./youtube.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANNELS_FILE = resolve(ROOT, "channels.json");
const MAX_LINKS = 30;
// 답글에 넣는 유튜브 제목 등은 마크다운 기호·@멘션을 무력화
const md = (s, max = 120) => clean(s, max).replace(/([\\`*_[\]<>|~#])/g, "\\$1").replace(/@/g, "@\u200b");

// 이슈 양식 본문 → { "할 일": "추가", "유튜브 링크": "…", … }
export function parseForm(body) {
  const out = {};
  for (const sec of String(body || "").slice(0, 20000).split(/^###\s+/m).slice(1)) {
    const [label, ...rest] = sec.split("\n");
    const value = rest.join("\n").trim();
    out[label.trim()] = value === "_No response_" ? "" : value;
  }
  return out;
}

export function extractLinks(text) {
  return [...new Set(String(text || "").split(/[\s,<>()\[\]]+/).filter(Boolean))]
    .map((t) => ({ raw: t, ref: parseLink(t, { bareId: false }) }))
    .filter((x) => x.ref)
    .slice(0, MAX_LINKS);
}

async function main() {
  const form = parseForm(process.env.ISSUE_BODY);
  const action = (form["할 일"] || "추가").includes("숨기") ? "hide" : "add";
  const category = clean(form["카테고리"], 30) || "기타";
  const name = clean(form["표시 이름 (선택)"], 80);
  const links = extractLinks(form["유튜브 링크"] || process.env.ISSUE_BODY);

  const config = JSON.parse(await readFile(CHANNELS_FILE, "utf8"));
  config.channels = Array.isArray(config.channels) ? config.channels : [];
  config.videos = Array.isArray(config.videos) ? config.videos : [];
  config.exclude = Array.isArray(config.exclude) ? config.exclude : [];

  const lines = [];
  let changed = 0;

  if (!links.length) lines.push("⚠️ 유튜브 링크를 찾지 못했어요. 채널 주소(`youtube.com/@…`)나 영상 주소(`youtu.be/…`)를 붙여넣어 주세요.");

  for (const { raw, ref } of links) {
    const shown = "`" + clean(raw, 100).replace(/`/g, "") + "`"; // 코드 표시라 마크다운이 해석되지 않음
    try {
      if (ref.type === "channel") {
        const id = await resolveChannel(ref.id ? { id: ref.id } : { url: "https://www.youtube.com" + ref.path });
        const idx = config.channels.findIndex((c) => c.id === id);
        if (action === "hide") {
          if (idx < 0) { lines.push(`➖ ${shown} – 등록되지 않은 채널이에요.`); continue; }
          const [removed] = config.channels.splice(idx, 1);
          changed++; lines.push(`🗑️ 채널 삭제: **${md(removed.name) || id}** (이 채널 영상도 사이트에서 빠져요)`);
          continue;
        }
        const title = await channelTitle(id);
        if (title === null) { lines.push(`❌ ${shown} – 채널 영상 목록을 열 수 없어요.`); continue; }
        const entry = { id, name: name || title || id, categories: [category], url: `https://www.youtube.com/channel/${id}` };
        if (idx >= 0) { const { category: _old, ...prevCh } = config.channels[idx]; config.channels[idx] = { ...prevCh, ...entry }; lines.push(`🔄 이미 등록된 채널 → 카테고리·이름 갱신: **${md(entry.name)}** (${md(category)})`); }
        else { config.channels.push(entry); lines.push(`✅ 채널 추가: **${md(entry.name)}** (${md(category)}) – 앞으로 새 영상이 자동으로 올라와요`); }
        changed++;
      } else {
        const id = ref.id;
        const url = `https://www.youtube.com/${ref.short ? "shorts/" : "watch?v="}${id}`;
        const same = (x) => (typeof x === "string" ? parseLink(x)?.id : parseLink(x?.url || x?.id)?.id) === id;
        if (action === "hide") {
          config.videos = config.videos.filter((x) => !same(x));
          if (!config.exclude.some(same)) config.exclude.push(url);
          changed++; lines.push(`🙈 영상 숨김: ${shown}`);
          continue;
        }
        const v = await fetchVideo(id);
        if (v.error) { lines.push(`❌ ${shown} – ${v.error}`); continue; }
        config.exclude = config.exclude.filter((x) => !same(x));
        const idx = config.videos.findIndex(same);
        const entry = { url, categories: [category], ...(name ? { name } : {}) };
        if (idx >= 0) config.videos[idx] = entry; else config.videos.push(entry);
        changed++; lines.push(`✅ 영상 ${idx >= 0 ? "갱신" : "추가"}: **${md(v.title)}** – ${md(v.channel)} (${md(category)})`);
      }
    } catch (err) {
      lines.push(`❌ ${shown} – ${md(err.message, 100)}`);
    }
  }

  if (changed) {
    await writeFile(CHANNELS_FILE + ".tmp", JSON.stringify(config, null, 2) + "\n");
    await rename(CHANNELS_FILE + ".tmp", CHANNELS_FILE);
    lines.push("", "사이트 반영까지 1~2분 정도 걸려요.");
  }
  console.log(lines.join("\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log("❌ 처리 중 오류: " + clean(e.message, 200)); process.exit(1); });
}
