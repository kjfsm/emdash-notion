import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettings } from "emdash";

export const GET: APIRoute = async ({ site, url }) => {
  const siteUrl = site?.toString() || url.origin;
  const settings = await getSiteSettings();
  const siteTitle = settings?.title || "Studio";
  const siteDescription = settings?.tagline || "Design & Development";

  const [{ entries: projects }, { entries: posts }] = await Promise.all([
    getEmDashCollection("projects", {
      orderBy: { published_at: "desc" },
      limit: 20,
    }),
    getEmDashCollection("posts", {
      orderBy: { published_at: "desc" },
      limit: 20,
    }),
  ]);

  const feedEntries = [
    ...projects.map((project) => ({
      publishedAt: project.data.publishedAt,
      url: `${siteUrl}/work/${project.id}`,
      title: project.data.title || "Untitled",
      description: project.data.summary || "",
    })),
    ...posts.map((post) => ({
      publishedAt: post.data.publishedAt,
      url: `${siteUrl}/posts/${post.id}`,
      title: post.data.title || "Untitled",
      description: post.data.excerpt || "",
    })),
  ]
    .filter((entry): entry is typeof entry & { publishedAt: Date } => !!entry.publishedAt)
    .toSorted((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 20);

  const items = feedEntries
    .map((entry) => {
      const pubDate = entry.publishedAt.toUTCString();
      const title = escapeXml(entry.title);
      const description = escapeXml(entry.description);

      return `    <item>
      <title>${title}</title>
      <link>${entry.url}</link>
      <guid isPermaLink="true">${entry.url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <description>${escapeXml(siteDescription)}</description>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

const XML_ESCAPE_PATTERNS = [
  [/&/g, "&amp;"],
  [/</g, "&lt;"],
  [/>/g, "&gt;"],
  [/"/g, "&quot;"],
  [/'/g, "&apos;"],
] as const;

function escapeXml(str: string): string {
  let result = str;
  for (const [pattern, replacement] of XML_ESCAPE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
