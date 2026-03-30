import { writeFile, mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { load } from "cheerio";
import iconv from "iconv-lite";

const NEWS_BASE_DIR = path.resolve("src/content/news");
const PUBLIC_NEWS_IMAGES_DIR = path.resolve("public/news-images");

function usage() {
  console.log("Usage: npm run import:wechat -- <wechat_url> [slug]");
}

function normalizeCharset(charset = "") {
  const raw = charset.toLowerCase().trim().replace(/['"]/g, "");
  if (!raw) return "";
  if (raw === "gb2312") return "gbk";
  if (raw === "utf8") return "utf-8";
  return raw;
}

function getCharsetFromHtmlProbe(htmlProbe = "") {
  const metaCharset = /<meta[^>]*charset\s*=\s*([a-zA-Z0-9_-]+)/i.exec(htmlProbe)?.[1];
  if (metaCharset) return normalizeCharset(metaCharset);

  const contentTypeMeta = /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9_-]+)/i.exec(
    htmlProbe
  )?.[1];
  return normalizeCharset(contentTypeMeta || "");
}

function decodeHtmlBuffer(buffer, contentTypeHeader = "") {
  const headerCharset = normalizeCharset(/charset\s*=\s*([^;\s]+)/i.exec(contentTypeHeader)?.[1] || "");
  const probe = Buffer.from(buffer).toString("latin1");
  const metaCharset = getCharsetFromHtmlProbe(probe);
  const charset = metaCharset || headerCharset || "utf-8";

  try {
    if (charset === "utf-8") {
      return Buffer.from(buffer).toString("utf8");
    }
    if (iconv.encodingExists(charset)) {
      return iconv.decode(Buffer.from(buffer), charset);
    }
  } catch {
    // Fallback below.
  }

  return Buffer.from(buffer).toString("utf8");
}

function decodeHtml(text = "") {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function safeSingleLine(text = "") {
  return text.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

function escapeYamlString(text = "") {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getMeta($, ...selectors) {
  for (const selector of selectors) {
    const value = $(selector).attr("content");
    if (value && value.trim()) {
      return decodeHtml(value.trim());
    }
  }
  return "";
}

function parseDate(raw = "") {
  if (!raw) return new Date();

  if (/^\d{10}$/.test(raw)) {
    return new Date(Number(raw) * 1000);
  }

  if (/^\d{13}$/.test(raw)) {
    return new Date(Number(raw));
  }

  const normalized = raw.replace(/年|\//g, "-").replace(/月/g, "-").replace(/日/g, "");
  const date = new Date(normalized);
  if (Number.isNaN(date.valueOf())) return new Date();
  return date;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSlug(input = "") {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getText($, selector) {
  return safeSingleLine($(selector).text() || "");
}

function normalizeImageUrl(url = "") {
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function normalizeParagraph(text = "") {
  return safeSingleLine(decodeHtml(text))
    .replace(/\s*END\s*$/i, "")
    .replace(/微信公众号\|[^\s]+/g, "")
    .trim();
}

function getImageFormat(src = "") {
  const fromQuery = /wx_fmt=([^&]+)/i.exec(src)?.[1]?.toLowerCase();
  if (fromQuery) return fromQuery;
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(src)?.[1]?.toLowerCase();
  return ext || "";
}

function isFooterText(text = "") {
  return /扫码关注我们|图片\s*\||文案\s*\||编辑\s*\||审核\s*\||指导\s*\||部分材料来源于网络/i.test(
    text
  );
}

function extractParagraphs($) {
  const container = $("#js_content");
  if (!container.length) {
    return [];
  }

  container.find("script, style").remove();

  const paragraphs = [];
  container.find("p").each((_, p) => {
    const text = normalizeParagraph($(p).text());
    if (!text) return;
    if (text.length < 8) return;
    paragraphs.push(text);
  });

  const unique = [];
  const seen = new Set();
  for (const p of paragraphs) {
    if (seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }

  return unique;
}

function extractContentBlocks($) {
  const container = $("#js_content");
  if (!container.length) return [];

  container.find("script, style").remove();

  const blocks = [];
  const seenText = new Set();
  const seenImage = new Set();
  let started = false;
  let stopped = false;

  const pushText = (raw) => {
    const text = normalizeParagraph(raw);
    if (!text || text.length < 8) return;
    if (isFooterText(text)) {
      stopped = true;
      return;
    }

    if (!started && text.length < 20) return;
    started = true;

    if (seenText.has(text)) return;
    seenText.add(text);
    blocks.push({ type: "text", text });
  };

  const pushImage = (rawSrc) => {
    if (!started || stopped) return;

    const src = normalizeImageUrl(rawSrc);
    if (!src) return;

    const fmt = getImageFormat(src);
    if (fmt === "gif") return;
    if (seenImage.has(src)) return;

    seenImage.add(src);
    blocks.push({ type: "image", src });
  };

  const walk = (node) => {
    if (!node || stopped) return;

    if (node.type === "text") {
      pushText(node.data || "");
      return;
    }

    if (node.type !== "tag") return;

    const tag = (node.tagName || "").toLowerCase();
    if (tag === "img") {
      const nodeRef = $(node);
      pushImage(nodeRef.attr("data-src") || nodeRef.attr("src") || "");
      return;
    }

    if (tag === "script" || tag === "style") return;

    const ownText = (node.children || [])
      .filter((child) => child.type === "text")
      .map((child) => child.data || "")
      .join(" ");
    pushText(ownText);

    for (const child of node.children || []) {
      walk(child);
    }
  };

  for (const child of container[0].children || []) {
    walk(child);
    if (stopped) break;
  }

  const filtered = blocks.filter((block, index) => {
    if (block.type === "text") return true;

    const left = Math.max(0, index - 2);
    const right = Math.min(blocks.length - 1, index + 2);
    for (let i = left; i <= right; i += 1) {
      if (blocks[i].type === "text") return true;
    }
    return false;
  });

  return filtered;
}

function buildMarkdownContent({ title, description, sourceUrl, blocks, imagePathMap }) {
  const intro = description || `${title}（来源：微信公众号）`;
  const lines = [
    `# ${title}`,
    "",
    intro,
    "",
    "## 活动内容",
    "",
  ];

  let hasContent = false;
  for (const block of blocks) {
    if (block.type === "text") {
      lines.push(block.text, "");
      hasContent = true;
      continue;
    }

    const localPath = imagePathMap.get(block.src);
    if (!localPath) continue;
    lines.push(`![](${localPath})`, "");
    hasContent = true;
  }

  if (!hasContent) {
    lines.push("未能自动解析出稳定正文，建议点击原文链接查看完整内容。", "");
  }

  lines.push("## 原文链接", "", `[点击查看微信公众号原文](${sourceUrl})`, "");
  return lines.join("\n");
}

function extFromUrlOrType(urlString, contentType = "") {
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes("image/png")) return "png";
  if (lowerType.includes("image/webp")) return "webp";
  if (lowerType.includes("image/gif")) return "gif";
  if (lowerType.includes("image/jpeg")) return "jpg";

  const pathname = (() => {
    try {
      return new URL(urlString).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (pathname.endsWith(".png")) return "png";
  if (pathname.endsWith(".webp")) return "webp";
  if (pathname.endsWith(".gif")) return "gif";
  return "jpg";
}

async function downloadCoverToLocal(coverUrl, slug) {
  if (!coverUrl) return "";

  try {
    await mkdir(PUBLIC_NEWS_IMAGES_DIR, { recursive: true });
    const response = await fetch(coverUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        referer: "https://mp.weixin.qq.com/",
      },
      redirect: "follow",
    });

    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "";
    const ext = extFromUrlOrType(coverUrl, contentType);
    const fileName = `${slug}.${ext}`;
    const outputPath = path.join(PUBLIC_NEWS_IMAGES_DIR, fileName);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) return "";

    await writeFile(outputPath, buffer);
    return `/news-images/${fileName}`;
  } catch {
    return "";
  }
}

async function downloadImagesToLocal(imageUrls, slug) {
  if (imageUrls.length === 0) return new Map();

  await mkdir(PUBLIC_NEWS_IMAGES_DIR, { recursive: true });

  const localPaths = new Map();
  let index = 0;

  for (const imageUrl of imageUrls) {
    index += 1;

    try {
      const response = await fetch(imageUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          referer: "https://mp.weixin.qq.com/",
        },
        redirect: "follow",
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      const ext = extFromUrlOrType(imageUrl, contentType);
      const fileName = `${slug}-${String(index).padStart(2, "0")}.${ext}`;
      const outputPath = path.join(PUBLIC_NEWS_IMAGES_DIR, fileName);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) continue;

      await writeFile(outputPath, buffer);
      localPaths.set(imageUrl, `/news-images/${fileName}`);
    } catch {
      continue;
    }
  }

  return localPaths;
}

async function main() {
  const [, , inputUrl, inputSlug] = process.argv;

  if (!inputUrl) {
    usage();
    process.exit(1);
  }

  let url;
  try {
    url = new URL(inputUrl.trim());
  } catch {
    console.error("Invalid URL.");
    process.exit(1);
  }

  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    console.error(`Fetch failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const arrayBuffer = await response.arrayBuffer();
  const html = decodeHtmlBuffer(arrayBuffer, response.headers.get("content-type") || "");
  const $ = load(html);

  const title =
    getText($, "#activity-name") ||
    getMeta($, "meta[property='og:title']") ||
    safeSingleLine($("title").text().replace("微信公众平台", "")) ||
    "未命名新闻";

  const dateRaw =
    getText($, "#publish_time") ||
    getMeta($, "meta[property='article:published_time']") ||
    (html.match(/var\\s+publish_time\\s*=\\s*"([^"]+)"/) || [])[1] ||
    "";

  const date = parseDate(dateRaw);

  const rawDescription =
    getMeta($, "meta[property='og:description']", "meta[name='description']") ||
    "";

  const remoteCover =
    getMeta($, "meta[property='og:image']") ||
    (html.match(/var\\s+msg_cdn_url\\s*=\\s*"([^"]+)"/) || [])[1] ||
    "";
  const blocks = extractContentBlocks($);
  const orderedImageUrls = blocks.filter((item) => item.type === "image").map((item) => item.src);
  const firstParagraph = blocks.find((item) => item.type === "text")?.text || "";
  const computedDescription = firstParagraph || rawDescription || `${title}（来源：微信公众号）`;
  const description = safeSingleLine(computedDescription).slice(0, 120);

  const defaultSlug = `wechat-${formatDate(date)}-${crypto
    .createHash("md5")
    .update(url.toString())
    .digest("hex")
    .slice(0, 6)}`;

  const userSlug = inputSlug ? toSlug(inputSlug) : "";
  const slug = userSlug || defaultSlug;

  let finalSlug = slug;
  let outputDir = path.join(NEWS_BASE_DIR, finalSlug);
  let counter = 1;

  while (await exists(outputDir)) {
    counter += 1;
    finalSlug = `${slug}-${counter}`;
    outputDir = path.join(NEWS_BASE_DIR, finalSlug);
  }

  await mkdir(outputDir, { recursive: true });

  const localCover = await downloadCoverToLocal(remoteCover, finalSlug);
  const localImages = await downloadImagesToLocal(orderedImageUrls, finalSlug);
  const firstImageInBody = orderedImageUrls.find((src) => localImages.has(src));
  const finalCover = localCover || (firstImageInBody ? localImages.get(firstImageInBody) : "") || "";
  const markdownContent = buildMarkdownContent({
    title,
    description,
    sourceUrl: url.toString(),
    blocks,
    imagePathMap: localImages,
  });

  const outputFile = path.join(outputDir, "index.md");
  const frontmatter = [
    "---",
    `title: \"${escapeYamlString(title)}\"`,
    `date: ${formatDate(date)}`,
    `description: \"${escapeYamlString(description)}\"`,
    finalCover ? `cover: \"${finalCover}\"` : "",
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  await writeFile(outputFile, `${frontmatter}\n${markdownContent}\n`, "utf8");

  console.log("Imported successfully.");
  console.log(`News file: src/content/news/${finalSlug}/index.md`);
  console.log(`Title: ${title}`);
  console.log(`Date: ${formatDate(date)}`);
}

main().catch((error) => {
  console.error("Import failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
