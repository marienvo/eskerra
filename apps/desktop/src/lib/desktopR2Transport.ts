import {invoke} from '@tauri-apps/api/core';

import type {R2SignedRequestTransport} from '@eskerra/core';

/** Fetch forbids a body for these statuses; WebKit throws if `new Response` gets a string (even empty). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Runs pre-signed R2/S3 requests in Rust. The WebView cannot reach the R2 API
 * due to CORS ("Load failed" on fetch).
 */
export const desktopR2SignedTransport: R2SignedRequestTransport = async (
  signedRequest: Request,
): Promise<Response> => {
  let body: string | null = null;
  if (signedRequest.body) {
    body = await signedRequest.clone().text();
  }
  const headers: [string, string][] = [];
  const isPresigned = signedRequest.url.includes('X-Amz-Signature=');
  if (isPresigned) {
    const m = signedRequest.method.toUpperCase();
    if (m === 'PUT' || m === 'POST') {
      const ct = signedRequest.headers.get('Content-Type');
      if (ct) {
        headers.push(['content-type', ct]);
      }
    }
    if (m === 'GET') {
      const ifNoneMatch = signedRequest.headers.get('If-None-Match');
      if (ifNoneMatch) {
        headers.push(['if-none-match', ifNoneMatch]);
      }
    }
  } else {
    for (const [k, v] of signedRequest.headers.entries()) {
      headers.push([k, v]);
    }
  }
  const result = await invoke<{status: number; body: string; etag?: string | null}>('r2_signed_fetch', {
    method: signedRequest.method,
    url: signedRequest.url,
    headers,
    body,
  });
  const responseHeaders = new Headers();
  if (typeof result.etag === 'string' && result.etag.length > 0) {
    responseHeaders.set('etag', result.etag);
  }
  const bodyInit = NULL_BODY_STATUSES.has(result.status) ? null : result.body;
  return new Response(bodyInit, {status: result.status, headers: responseHeaders});
};
