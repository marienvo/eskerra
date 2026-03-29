use reqwest::header::HeaderName;
use reqwest::header::HeaderValue;
use reqwest::redirect;
use serde::Serialize;

#[derive(Serialize)]
pub struct R2SignedFetchResult {
    pub status: u16,
    pub body: String,
}

/// Executes a pre-signed S3 request from the JS side (aws4fetch). WebView fetch to R2 fails with CORS.
#[tauri::command]
pub async fn r2_signed_fetch(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<R2SignedFetchResult, String> {
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .http1_only()
        .redirect(redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.request(m, url);

    for (k, v) in headers {
        let name = HeaderName::try_from(k.as_str()).map_err(|e| e.to_string())?;
        let value = HeaderValue::try_from(v.as_str()).map_err(|e| e.to_string())?;
        req = req.header(name, value);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;

    Ok(R2SignedFetchResult { status, body })
}
