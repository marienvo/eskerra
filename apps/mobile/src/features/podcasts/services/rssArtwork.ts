import {XMLParser} from 'fast-xml-parser';

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
});
const RSS_ARTWORK_RANGE_BYTES = 16 * 1024;
// Channel-level metadata (including <itunes:image>) is always in the first few KB of
// any well-formed RSS feed. Parsing 10 MB+ NPO feeds in Hermes causes silent OOM
// failures. Cap to 64 KB — enough for feeds with long channel descriptions before the
// image tag (some NPO feeds have multi-KB CDATA descriptions in the channel header).
const RSS_PARSE_CAP_BYTES = 64 * 1024;

type ParsedNode = Record<string, unknown>;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): ParsedNode | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as ParsedNode;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function getFirstAttributeValue(
  nodes: unknown,
  attribute: string,
): string | null {
  for (const node of toArray(nodes)) {
    const parsedNode = asObject(node);
    if (!parsedNode) {
      continue;
    }

    const value = asString(parsedNode[attribute]);
    if (value) {
      return value;
    }
  }

  return null;
}

function looksLikeUrl(value: string | null): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function getNodeUrl(node: unknown): string | null {
  const parsedNode = asObject(node);
  if (!parsedNode) {
    return asString(node);
  }

  const directCandidates = [
    asString(parsedNode['@_href']),
    asString(parsedNode['@_url']),
    asString(parsedNode.url),
    asString(parsedNode.href),
    asString(parsedNode['#text']),
  ];
  for (const candidate of directCandidates) {
    if (looksLikeUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getNestedValue(root: ParsedNode, path: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of path) {
    const objectCursor = asObject(cursor);
    if (!objectCursor || !(segment in objectCursor)) {
      return undefined;
    }
    cursor = objectCursor[segment];
  }
  return cursor;
}

function findFirstArtworkLikeUrl(node: unknown, depth = 0): string | null {
  if (depth > 6) {
    return null;
  }

  const asText = asString(node);
  if (looksLikeUrl(asText)) {
    return asText;
  }

  const objectNode = asObject(node);
  if (!objectNode) {
    return null;
  }

  for (const [key, value] of Object.entries(objectNode)) {
    const normalizedKey = key.toLowerCase();
    const isArtworkField =
      normalizedKey.includes('image') ||
      normalizedKey.includes('thumbnail') ||
      normalizedKey === 'logo' ||
      normalizedKey === 'icon';
    if (!isArtworkField) {
      continue;
    }

    const candidates = toArray(value);
    for (const candidate of candidates) {
      const candidateUrl = getNodeUrl(candidate);
      if (looksLikeUrl(candidateUrl)) {
        return candidateUrl;
      }

      const nestedUrl = findFirstArtworkLikeUrl(candidate, depth + 1);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  for (const nestedValue of Object.values(objectNode)) {
    const nestedUrl = findFirstArtworkLikeUrl(nestedValue, depth + 1);
    if (nestedUrl) {
      return nestedUrl;
    }
  }

  return null;
}

function getRssChannel(xml: string): ParsedNode | null {
  const parsed = xmlParser.parse(xml) as ParsedNode;
  const rss = asObject(parsed.rss);
  if (rss) {
    return asObject(rss.channel);
  }

  // Some feeds use Atom as the root element.
  const atomFeed = asObject(parsed.feed);
  return atomFeed;
}

function getChannelSection(xml: string): string {
  const itemOrEntryMatch = /<item[\s>]|<entry[\s>]/i.exec(xml);
  if (!itemOrEntryMatch) {
    return xml.length > RSS_PARSE_CAP_BYTES ? xml.slice(0, RSS_PARSE_CAP_BYTES) : xml;
  }

  const channelSection = xml.slice(0, itemOrEntryMatch.index);
  const openingChunk = channelSection.slice(0, 512);
  const isAtomFeed = /<feed[\s>]/i.test(openingChunk);
  if (isAtomFeed) {
    return `${channelSection}\n</feed>`;
  }

  return `${channelSection}\n</channel></rss>`;
}

function resolveChannelImageUrl(channel: ParsedNode): string | null {
  const directImageSources: Array<string | null> = [
    getFirstAttributeValue(channel['itunes:image'], '@_href'),
    getFirstAttributeValue(channel['itunes:image'], '@_url'),
    getFirstAttributeValue(channel['media:thumbnail'], '@_url'),
    getFirstAttributeValue(channel['googleplay:image'], '@_href'),
  ];
  for (const imageSource of directImageSources) {
    if (looksLikeUrl(imageSource)) {
      return imageSource;
    }
  }

  const channelImage = asObject(channel.image);
  const channelImageUrl = channelImage ? asString(channelImage.url) : null;
  if (looksLikeUrl(channelImageUrl)) {
    return channelImageUrl;
  }

  const nestedSources: unknown[] = [
    getNestedValue(channel, ['itunes', 'image']),
    getNestedValue(channel, ['media', 'thumbnail']),
    getNestedValue(channel, ['googleplay', 'image']),
    channel.logo,
    channel.icon,
  ];
  for (const source of nestedSources) {
    const sourceUrl = getNodeUrl(source);
    if (looksLikeUrl(sourceUrl)) {
      return sourceUrl;
    }
  }

  return findFirstArtworkLikeUrl(channel);
}

export function parseRssArtworkUrl(xml: string): string | null {
  try {
    if (!xml.trim()) {
      return null;
    }

    const channel = getRssChannel(getChannelSection(xml));
    if (!channel) {
      return null;
    }

    return resolveChannelImageUrl(channel);
  } catch {
    return null;
  }
}

export async function fetchRssArtworkUrl(
  rssFeedUrl: string,
  timeoutMs = 10000,
): Promise<string | null> {
  const fetchXml = async (headers?: Record<string, string>) => {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(rssFeedUrl, {
        headers,
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }

      const rawXml = await response.text();
      const artworkUrl = parseRssArtworkUrl(rawXml);
      const hasPartialRange =
        response.status === 206 || Boolean(response.headers?.get?.('content-range'));
      return {artworkUrl, hasPartialRange};
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  const rangedResult = await fetchXml({
    Range: `bytes=0-${RSS_ARTWORK_RANGE_BYTES - 1}`,
  });
  if (!rangedResult) {
    return null;
  }
  if (rangedResult.artworkUrl) {
    return rangedResult.artworkUrl;
  }
  if (!rangedResult.hasPartialRange) {
    return null;
  }

  const fullResult = await fetchXml();
  return fullResult?.artworkUrl ?? null;
}
