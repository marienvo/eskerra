use regex::Regex;
use serde::Serialize;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/122.0.0.0 Safari/537.36 Eskerra/0.1 (+https://github.com/marienvo/notebox)";
const BODY_CAP_BYTES: usize = 1_500_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_REDIRECTS: usize = 10;

#[derive(Serialize, Default)]
pub struct LinkRichMetadata {
    pub title: Option<String>,
    #[serde(rename = "siteName")]
    pub site_name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "imageCandidates")]
    pub image_candidates: Vec<String>,
    #[serde(rename = "finalUrl")]
    pub final_url: String,
}

/// Fetches a URL and extracts rich-preview metadata (title, site name, image candidates).
/// Image candidates are ordered so the client can try them in sequence to maximize the
/// chance of rendering artwork: OG image → Twitter image → apple-touch-icon → link icon → /favicon.ico.
#[tauri::command]
pub async fn fetch_link_rich_metadata(url: String) -> Result<LinkRichMetadata, String> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent(USER_AGENT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
        .header("Accept-Language", "en;q=0.8,*;q=0.5")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let final_url = res.url().to_string();

    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let slice = if bytes.len() > BODY_CAP_BYTES {
        &bytes[..BODY_CAP_BYTES]
    } else {
        &bytes[..]
    };
    let html = String::from_utf8_lossy(slice);

    Ok(parse_html_metadata(&html, &final_url))
}

fn parse_html_metadata(html: &str, base_url: &str) -> LinkRichMetadata {
    let head = extract_head(html);
    let (og_title, og_site, og_description, og_images) = collect_og_meta(head);
    let twitter_images = collect_twitter_images(head);
    let document_title = extract_document_title(head);
    let description = og_description.or_else(|| extract_meta_name(head, "description"));
    let apple_touch_icons =
        extract_link_icons(head, &["apple-touch-icon", "apple-touch-icon-precomposed"]);
    let link_icons = extract_link_icons(head, &["icon", "shortcut icon"]);

    let mut candidates: Vec<String> = Vec::new();
    candidates.extend(og_images);
    candidates.extend(twitter_images);
    candidates.extend(apple_touch_icons);
    candidates.extend(link_icons);
    candidates.push("/favicon.ico".to_string());

    let absolute = candidates
        .into_iter()
        .filter_map(|c| absolutize_url(base_url, &c))
        .collect::<Vec<_>>();
    let mut deduped: Vec<String> = Vec::new();
    for url in absolute {
        if !deduped.iter().any(|u| u == &url) {
            deduped.push(url);
        }
    }

    let site_name = og_site.or_else(|| extract_meta_name(head, "application-name"));
    let title = og_title.or(document_title);

    LinkRichMetadata {
        title: title.map(clean_whitespace),
        site_name: site_name.map(clean_whitespace),
        description: description.map(clean_whitespace),
        image_candidates: deduped,
        final_url: base_url.to_string(),
    }
}

fn extract_head(html: &str) -> &str {
    // Many pages close </head> before the body starts; truncating there keeps regex work bounded.
    let needle = "</head>";
    let lower = html.to_ascii_lowercase();
    if let Some(idx) = lower.find(needle) {
        return &html[..idx];
    }
    // Fall back to first 80KB (heuristic: full <head> rarely larger).
    let cap = 80_000.min(html.len());
    &html[..cap]
}

fn collect_og_meta(head: &str) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    let mut title: Option<String> = None;
    let mut site: Option<String> = None;
    let mut desc: Option<String> = None;
    let mut images: Vec<String> = Vec::new();

    for (prop, content) in iter_meta_property(head) {
        match prop.as_str() {
            "og:title" => title.get_or_insert(content),
            "og:site_name" => site.get_or_insert(content),
            "og:description" => desc.get_or_insert(content),
            "og:image:secure_url" => {
                images.insert(0, content);
                continue;
            }
            "og:image" | "og:image:url" => {
                images.push(content);
                continue;
            }
            _ => continue,
        };
    }

    (title, site, desc, images)
}

fn collect_twitter_images(head: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (name, content) in iter_meta_name(head) {
        if name == "twitter:image" || name == "twitter:image:src" {
            out.push(content);
        }
    }
    out
}

fn extract_document_title(head: &str) -> Option<String> {
    let rx = Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok()?;
    rx.captures(head)
        .and_then(|c| c.get(1).map(|m| decode_html_entities(m.as_str())))
}

fn extract_meta_name(head: &str, name_wanted: &str) -> Option<String> {
    for (name, content) in iter_meta_name(head) {
        if name.eq_ignore_ascii_case(name_wanted) {
            return Some(content);
        }
    }
    None
}

fn extract_link_icons(head: &str, rels: &[&str]) -> Vec<String> {
    let rx = match Regex::new(r#"(?is)<link\b([^>]*?)\s*/?>"#) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut hits: Vec<(u32, String)> = Vec::new();
    for caps in rx.captures_iter(head) {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let rel = extract_attr(attrs, "rel").unwrap_or_default();
        if !rels.iter().any(|r| rel.eq_ignore_ascii_case(r)) {
            continue;
        }
        let Some(href) = extract_attr(attrs, "href") else {
            continue;
        };
        let sizes = extract_attr(attrs, "sizes").unwrap_or_default();
        let score = parse_icon_size_px(&sizes);
        hits.push((score, href));
    }
    // Largest icon first; "any" (score=10_000) comes before finite sizes below it but after larger ones.
    hits.sort_by(|a, b| b.0.cmp(&a.0));
    hits.into_iter().map(|(_, h)| h).collect()
}

fn parse_icon_size_px(sizes: &str) -> u32 {
    if sizes.trim().eq_ignore_ascii_case("any") {
        return 10_000; // treat SVG/any as "large" but below explicit big bitmaps at 1024+
    }
    sizes
        .split_whitespace()
        .filter_map(|token| {
            let pair = token.to_ascii_lowercase();
            let mut parts = pair.split('x');
            let w: u32 = parts.next()?.parse().ok()?;
            let h: u32 = parts.next()?.parse().ok()?;
            Some(w.max(h))
        })
        .max()
        .unwrap_or(0)
}

fn iter_meta_property(head: &str) -> Vec<(String, String)> {
    iter_meta(head, "property")
}

fn iter_meta_name(head: &str) -> Vec<(String, String)> {
    iter_meta(head, "name")
}

fn iter_meta(head: &str, key_attr: &str) -> Vec<(String, String)> {
    let rx = match Regex::new(r#"(?is)<meta\b([^>]*?)\s*/?>"#) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<(String, String)> = Vec::new();
    for caps in rx.captures_iter(head) {
        let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let Some(key) = extract_attr(attrs, key_attr) else {
            continue;
        };
        let Some(content) = extract_attr(attrs, "content") else {
            continue;
        };
        out.push((key, content));
    }
    out
}

fn extract_attr(attrs_block: &str, name: &str) -> Option<String> {
    let pattern = format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#,
        regex::escape(name)
    );
    let rx = Regex::new(&pattern).ok()?;
    let caps = rx.captures(attrs_block)?;
    let raw = caps
        .get(1)
        .or_else(|| caps.get(2))
        .or_else(|| caps.get(3))?
        .as_str();
    Some(decode_html_entities(raw))
}

fn absolutize_url(base: &str, candidate: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(parsed) = reqwest::Url::parse(trimmed) {
        return Some(parsed.to_string());
    }
    let base_url = reqwest::Url::parse(base).ok()?;
    base_url.join(trimmed).ok().map(|u| u.to_string())
}

fn decode_html_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '&' {
            out.push(c);
            continue;
        }
        let mut entity = String::new();
        let mut matched = false;
        while let Some(&p) = chars.peek() {
            if p == ';' {
                chars.next();
                matched = true;
                break;
            }
            if entity.len() > 8 {
                break;
            }
            entity.push(p);
            chars.next();
        }
        if !matched {
            out.push('&');
            out.push_str(&entity);
            continue;
        }
        let replacement = match entity.as_str() {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some('\u{00A0}'),
            _ => {
                if let Some(rest) = entity.strip_prefix('#') {
                    let code = if let Some(hex) = rest.strip_prefix(['x', 'X']) {
                        u32::from_str_radix(hex, 16).ok()
                    } else {
                        rest.parse::<u32>().ok()
                    };
                    code.and_then(char::from_u32)
                } else {
                    None
                }
            }
        };
        match replacement {
            Some(ch) => out.push(ch),
            None => {
                out.push('&');
                out.push_str(&entity);
                out.push(';');
            }
        }
    }
    out
}

fn clean_whitespace(s: String) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_og_and_twitter() {
        let html = r#"
            <html><head>
              <title>Some page</title>
              <meta property="og:title" content="Clean title"/>
              <meta property="og:site_name" content="SiteName"/>
              <meta property="og:image" content="/image.png"/>
              <meta name="twitter:image" content="https://cdn.example.com/t.png"/>
              <link rel="apple-touch-icon" sizes="180x180" href="/apple.png"/>
              <link rel="icon" sizes="32x32" href="/icon-32.png"/>
              <link rel="icon" sizes="any" href="/icon.svg"/>
            </head><body></body></html>
        "#;
        let md = parse_html_metadata(html, "https://example.com/page");
        assert_eq!(md.title.as_deref(), Some("Clean title"));
        assert_eq!(md.site_name.as_deref(), Some("SiteName"));
        assert!(md.image_candidates[0].ends_with("/image.png"));
        assert!(md
            .image_candidates
            .iter()
            .any(|u| u.contains("cdn.example.com/t.png")));
        assert!(md
            .image_candidates
            .iter()
            .any(|u| u.ends_with("/apple.png")));
        assert!(md
            .image_candidates
            .last()
            .map_or(false, |u| u.ends_with("/favicon.ico")));
    }

    #[test]
    fn falls_back_to_document_title() {
        let html = "<html><head><title>Doc &amp; Co</title></head></html>";
        let md = parse_html_metadata(html, "https://x/");
        assert_eq!(md.title.as_deref(), Some("Doc & Co"));
    }

    #[test]
    fn absolutizes_relative_icons() {
        let html = r#"<html><head><link rel="icon" href="/favicon.ico"/></head></html>"#;
        let md = parse_html_metadata(html, "https://host.example/some/deep/path");
        assert!(md
            .image_candidates
            .iter()
            .any(|u| u == "https://host.example/favicon.ico"));
    }

    #[test]
    fn decodes_numeric_entities() {
        assert_eq!(decode_html_entities("caf&#233;"), "café");
        assert_eq!(decode_html_entities("&#x2014;"), "—");
    }
}
