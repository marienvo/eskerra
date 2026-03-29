import {invoke} from '@tauri-apps/api/core';

import type {R2SignedRequestTransport} from '@notebox/core';

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
  } else {
    signedRequest.headers.forEach((v, k) => headers.push([k, v]));
  }
  const result = await invoke<{status: number; body: string}>('r2_signed_fetch', {
    method: signedRequest.method,
    url: signedRequest.url,
    headers,
    body,
  });
  return new Response(result.body, {status: result.status});
};
