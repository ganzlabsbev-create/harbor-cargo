import { test } from "node:test";
import assert from "node:assert/strict";
import { patchNextLayoutForServiceWorker } from "../next-app-router";

test("preserves a leading \"use client\" directive as the first statement", () => {
  const code = `"use client";

import { useState } from "react";

export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`;
  const result = patchNextLayoutForServiceWorker(code, "./harbor-register-sw");
  assert.equal(result.changed, true);
  const directiveIdx = result.code.indexOf('"use client"');
  const importIdx = result.code.indexOf("import HarborRegisterSW");
  assert.ok(directiveIdx === 0, 'use client directive must remain the very first statement');
  assert.ok(importIdx > directiveIdx, "new import must come after the directive, never before it");
});

test("handles multiline named imports without breaking them", () => {
  const code = `import {
  useState,
  useEffect,
} from "react";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`;
  const result = patchNextLayoutForServiceWorker(code, "./harbor-register-sw");
  assert.equal(result.changed, true);
  // Must not have mangled the multiline import into invalid syntax.
  assert.ok(result.code.includes("useState,\n  useEffect,"));
  assert.ok(result.code.includes('import HarborRegisterSW from "./harbor-register-sw";'));
});

test("no directive, no imports: import still lands before JSX, not injected mid-statement", () => {
  const code = `export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`;
  const result = patchNextLayoutForServiceWorker(code, "./harbor-register-sw");
  assert.equal(result.changed, true);
  assert.ok(result.code.startsWith('import HarborRegisterSW from "./harbor-register-sw";'));
});

test("running twice does not mount the component a second time", () => {
  const code = `"use client";
import { useState } from "react";
export default function Layout({ children }) {
  return <html><body>{children}</body></html>;
}
`;
  const first = patchNextLayoutForServiceWorker(code, "./harbor-register-sw");
  const second = patchNextLayoutForServiceWorker(first.code, "./harbor-register-sw");
  assert.equal(second.changed, false);
  assert.equal(second.notes[0], "sw_component_already_mounted");
});
