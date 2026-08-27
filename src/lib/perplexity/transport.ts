import https from "node:https";
import tls from "node:tls";

const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

const chromeAgent = new https.Agent({
  keepAlive: true,
  ciphers: CHROME_CIPHERS,
  minVersion: "TLSv1.2" as tls.SecureVersion,
  maxVersion: "TLSv1.3" as tls.SecureVersion,
});

function headerRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export function createChromeFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = init?.method ?? "GET";
    const headers = headerRecord(init?.headers);
    const body =
      typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? Buffer.from(init.body) : undefined;

    return await new Promise<Response>((resolve, reject) => {
      const req = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method,
          headers,
          agent: chromeAgent,
        },
        (res) => {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              res.on("data", (chunk: Buffer) => {
                controller.enqueue(new Uint8Array(chunk));
              });
              res.on("end", () => controller.close());
              res.on("error", (error) => controller.error(error));
            },
            cancel() {
              res.destroy();
            },
          });

          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") {
              responseHeaders.set(key, value);
            } else if (Array.isArray(value)) {
              responseHeaders.set(key, value.join(", "));
            }
          }

          resolve(
            new Response(stream, {
              status: res.statusCode ?? 502,
              statusText: res.statusMessage ?? "",
              headers: responseHeaders,
            }),
          );
        },
      );

      req.on("error", reject);
      init?.signal?.addEventListener("abort", () => {
        req.destroy();
        reject(init.signal?.reason ?? new Error("Aborted"));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  };
}
