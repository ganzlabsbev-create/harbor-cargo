import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { generateServiceWorkerSource } from "../service-worker";

// These tests actually execute the generated Service Worker source in a
// sandboxed VM context with mock self/caches/fetch, and dispatch synthetic
// fetch events — per Phase 3 spec §3.5, behavior must be verified, not just
// "does the source string contain /api/".

interface MockResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  clone(): MockResponse;
  _tag?: string;
}

function makeResponse(opts: { status?: number; headers?: Record<string, string>; tag?: string } = {}): MockResponse {
  const status = opts.status ?? 200;
  const headersMap = opts.headers ?? {};
  const resp: MockResponse = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headersMap[name.toLowerCase()] ?? headersMap[name] ?? null },
    clone(): MockResponse {
      return makeResponse(opts);
    },
    _tag: opts.tag,
  };
  return resp;
}

interface Harness {
  dispatchFetch(
    url: string,
    opts?: {
      method?: string;
      headers?: Record<string, string>;
      credentials?: string;
      fetchImpl?: (req: any) => Promise<MockResponse>;
    }
  ): Promise<{ response: any; cachedPaths: string[]; putCalls: string[] }>;
}

function buildHarness(cacheVersion: string): Harness {
  const code = generateServiceWorkerSource(cacheVersion);
  const cacheStore = new Map<string, MockResponse>(); // request.url -> response
  const putCalls: string[] = [];

  let fetchHandler: ((event: any) => void) | null = null;

  const mockCache = {
    put: async (request: any, response: MockResponse) => {
      const url = typeof request === "string" ? request : request.url;
      cacheStore.set(url, response);
      putCalls.push(url);
    },
    match: async (request: any) => {
      const url = typeof request === "string" ? request : request.url;
      return cacheStore.get(url);
    },
  };

  const mockCaches = {
    open: async (_name: string) => mockCache,
    match: async (request: any) => mockCache.match(request),
    keys: async () => [],
    delete: async (_key: string) => true,
  };

  const sandbox: any = {
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (type: string, cb: (event: any) => void) => {
        if (type === "fetch") fetchHandler = cb;
      },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: mockCaches,
    URL,
    Response: {
      error: () => makeResponse({ status: 0, tag: "network-error" }),
    },
    console,
    fetch: async () => makeResponse(),
  };
  sandbox.self.caches = mockCaches; // some engines expose caches off self too; harmless either way
  vm.createContext(sandbox);
  new vm.Script(code).runInContext(sandbox);

  return {
    async dispatchFetch(url, opts = {}) {
      const method = opts.method ?? "GET";
      const headersMap = opts.headers ?? {};
      const request = {
        url,
        method,
        credentials: opts.credentials,
        headers: { get: (name: string) => headersMap[name] ?? headersMap[name.toLowerCase()] ?? null },
      };
      const fetchImpl = opts.fetchImpl ?? (async () => makeResponse());
      sandbox.fetch = fetchImpl;

      let respondWithPromise: Promise<any> | null = null;
      const event = {
        request,
        respondWith: (p: Promise<any>) => {
          respondWithPromise = p;
        },
      };
      assert.ok(fetchHandler, "fetch handler must have been registered via self.addEventListener");
      fetchHandler!(event);
      const response = respondWithPromise ? await respondWithPromise : undefined;
      return { response, cachedPaths: [...cacheStore.keys()], putCalls: [...putCalls] };
    },
  };
}

// 1. GET /api/user -> network only, never cache
test("SW cache safety 1: GET /api/user is network-only, never cached", async () => {
  const h = buildHarness("v1");
  let fetchCalled = false;
  const result = await h.dispatchFetch("https://example.com/api/user", {
    fetchImpl: async () => {
      fetchCalled = true;
      return makeResponse({ status: 200 });
    },
  });
  assert.ok(fetchCalled, "must go to network");
  assert.equal(result.putCalls.length, 0, "must never write /api/ responses to cache");
});

// 2. GET /api/orders -> network only
test("SW cache safety 2: GET /api/orders is network-only", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/api/orders", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 0);
});

// 3. GET authenticated/private route -> not cache-first (must hit network, not serve from cache blindly)
test("SW cache safety 3: private/authenticated route is not served cache-first", async () => {
  const h = buildHarness("v1");
  let networkHit = false;
  await h.dispatchFetch("https://example.com/account/settings", {
    fetchImpl: async () => {
      networkHit = true;
      return makeResponse({ status: 200 });
    },
  });
  assert.ok(networkHit, "non-API navigations must go to network first, not be served from an empty-but-trusted cache");
});

// 4. GET static JS -> cacheable
test("SW cache safety 4: static JS is cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/assets/app.js", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 1);
  assert.match(result.putCalls[0], /app\.js$/);
});

// 5. GET static CSS -> cacheable
test("SW cache safety 5: static CSS is cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/assets/app.css", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 1);
});

// 6. GET image -> cacheable
test("SW cache safety 6: image is cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/logo.png", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 1);
});

// 7. POST -> not cacheable (handler must not even respondWith for non-GET)
test("SW cache safety 7: POST requests are never cached and pass through", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/api/orders", {
    method: "POST",
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 0);
  assert.equal(result.response, undefined, "non-GET requests must not be intercepted with respondWith at all");
});

// 8. response with Cache-Control: private -> not cacheable
test("SW cache safety 8: Cache-Control: private response is not cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/dashboard", {
    fetchImpl: async () => makeResponse({ status: 200, headers: { "cache-control": "private" } }),
  });
  assert.equal(result.putCalls.length, 0);
});

// 9. response with Cache-Control: no-store -> not cacheable
test("SW cache safety 9: Cache-Control: no-store response is not cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/dashboard", {
    fetchImpl: async () => makeResponse({ status: 200, headers: { "cache-control": "no-store" } }),
  });
  assert.equal(result.putCalls.length, 0);
});

// 10. generic GET unknown route -> safe strategy (network-first: network is consulted, and a
// successful cacheable response IS cached for future offline fallback — but only after
// passing the safety gate, never blindly).
test("SW cache safety 10: generic unknown GET route uses network-first and caches only a safe response", async () => {
  const h = buildHarness("v1");
  let networkHit = false;
  const result = await h.dispatchFetch("https://example.com/some/page", {
    fetchImpl: async () => {
      networkHit = true;
      return makeResponse({ status: 200 });
    },
  });
  assert.ok(networkHit);
  assert.equal(result.putCalls.length, 1, "a safe (non-private, 200 OK) response may be cached for offline fallback");
});

test("SW cache safety: cross-origin requests are never intercepted", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://other-origin.example/x.js", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.response, undefined, "cross-origin must not be intercepted with respondWith");
  assert.equal(result.putCalls.length, 0);
});

test("SW cache safety: a 500 error response is never cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/app.js", {
    fetchImpl: async () => makeResponse({ status: 500 }),
  });
  assert.equal(result.putCalls.length, 0);
});

test("SW cache safety: offline fallback still works for a previously-cached static asset", async () => {
  const h = buildHarness("v1");
  // First request succeeds and populates the cache.
  await h.dispatchFetch("https://example.com/app.js", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  // Second request: cache-first should serve from cache without hitting the network.
  let networkHitAgain = false;
  const result = await h.dispatchFetch("https://example.com/app.js", {
    fetchImpl: async () => {
      networkHitAgain = true;
      return makeResponse({ status: 200 });
    },
  });
  assert.equal(networkHitAgain, false, "static asset already cached should be served cache-first without a network hit");
  assert.ok(result.response, "a cached response should be returned");
});

// --- Credentialed requests (Phase 4 §4.1/§4.2): extension alone must never
// override an explicit credential signal on the request. ---

test("SW cache safety: static JS with an Authorization header is network-only, never cached", async () => {
  const h = buildHarness("v1");
  let networkHit = false;
  const result = await h.dispatchFetch("https://example.com/assets/app.js", {
    headers: { Authorization: "Bearer token" },
    fetchImpl: async () => {
      networkHit = true;
      return makeResponse({ status: 200 });
    },
  });
  assert.ok(networkHit);
  assert.equal(result.putCalls.length, 0, "an Authorization-bearing request must never be written to the cache, even for a static-looking path");
});

test("SW cache safety: static image with an Authorization header is network-only, never cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/private/avatar.png", {
    headers: { Authorization: "Bearer token" },
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 0);
});

test("SW cache safety: request with credentials: 'include' is network-only, never cached", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/assets/app.css", {
    credentials: "include",
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 0, "credentials: include must be treated as a credential signal regardless of extension");
});

test("SW cache safety: a static asset with no credential signal is still cached (no regression)", async () => {
  const h = buildHarness("v1");
  const result = await h.dispatchFetch("https://example.com/assets/app.js", {
    fetchImpl: async () => makeResponse({ status: 200 }),
  });
  assert.equal(result.putCalls.length, 1);
});
