#!/usr/bin/env node
/**
 * Minimal OpenAPI -> plain JS fetch client generator.
 *
 * Generates files under src/auth-client:
 * - base.js (fetch wrapper and helpers)
 * - <tag>-api.js per tag (functions for operations)
 * - index.js exporting everything
 *
 * Usage:
 *   node scripts/generate-auth-client.mjs [specUrl]
 *   SPEC_URL=https://example.com/swagger/v1/swagger.json node scripts/generate-auth-client.mjs
 *
 * Defaults:
 *   specUrl: https://auth.hvdhub.com/swagger/v1/swagger.json
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';

const DEFAULT_SPEC = 'https://auth.hvdhub.com/swagger/v1/swagger.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirects
          fetchJson(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Failed to download spec: ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function toSafeName(str) {
  return str.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/_{2,}/g, '_');
}

function opFunctionName(op, pathKey, method) {
  if (op.operationId) return toSafeName(op.operationId);
  const fromPath = pathKey
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/\{.*?\}/g, ''))
    .filter(Boolean)
    .join('_');
  const base = `${method}_${fromPath || 'root'}`;
  return toSafeName(base);
}

function paramList(params = []) {
  const names = [];
  for (const p of params) {
    if (!p || !p.name) continue;
    names.push(p.name);
  }
  return Array.from(new Set(names));
}

function buildPathTemplate(pathKey) {
  // convert /users/{id} to string template `${pathParams.id}`
  return pathKey.replace(/\{(.*?)\}/g, '${pathParams.$1}');
}

function pickTags(op) {
  if (Array.isArray(op.tags) && op.tags.length) return op.tags;
  return ['default'];
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function writeFile(file, content) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, content, 'utf8');
}

function genBaseJs() {
  return `// Auto-generated (safe to edit). Shared fetch helpers.
export class AuthHttpClient {
  constructor({ baseUrl = '', defaultHeaders = {}, getToken } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultHeaders = defaultHeaders;
    this.getToken = getToken; // optional async () => string
  }

  async request({ path, method = 'GET', query, headers, body, formData, accept = 'application/json', contentType }) {
    const url = new URL(this.baseUrl + path, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) v.forEach((vv) => url.searchParams.append(k, vv));
        else url.searchParams.set(k, String(v));
      });
    }

    const hdrs = { ...this.defaultHeaders, ...(headers || {}) };
    if (accept && !hdrs['Accept']) hdrs['Accept'] = accept;

    let bodyInit = undefined;
    if (formData) {
      bodyInit = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        if (v !== undefined && v !== null) bodyInit.append(k, v);
      });
    } else if (body !== undefined) {
      if (!contentType) contentType = 'application/json';
      hdrs['Content-Type'] = contentType;
      bodyInit = contentType.includes('json') ? JSON.stringify(body) : body;
    }

    if (this.getToken) {
      const token = await this.getToken();
      if (token) hdrs['Authorization'] = hdrs['Authorization'] || ('Bearer ' + token);
    }

    const resp = await fetch(url.toString(), { method, headers: hdrs, body: bodyInit, credentials: 'include' });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      const err = new Error('HTTP ' + resp.status + ' ' + resp.statusText + ': ' + txt);
      err.status = resp.status;
      err.body = txt;
      throw err;
    }
    const ct = resp.headers.get('content-type') || '';
    if (accept && accept.includes('json') && ct.includes('json')) return resp.json();
    return resp.text();
  }
}
`;
}

function genApiModule(tag, operations) {
  const lines = [];
  lines.push(`// Auto-generated API for tag: ${tag}`);
  lines.push(`import { AuthHttpClient } from './base.js';`);
  lines.push('');
  const className = toSafeName(tag[0].toUpperCase() + tag.slice(1));
  lines.push(`export class ${className}Api {`);
  lines.push(`  /** @param {AuthHttpClient} http */`);
  lines.push(`  constructor(http) { this.http = http; }`);

  for (const op of operations) {
    const fn = op.fnName;
    const pathTmpl = buildPathTemplate(op.pathKey);
    const method = op.method.toUpperCase();
    const pathParams = paramList((op.parameters || []).filter((p) => p.in === 'path'));
    const queryParams = paramList((op.parameters || []).filter((p) => p.in === 'query'));
    const headerParams = paramList((op.parameters || []).filter((p) => p.in === 'header'));
    const hasBody = !!op.requestBody;

    const args = [];
    if (pathParams.length) args.push('pathParams');
    if (queryParams.length) args.push('query');
    if (headerParams.length) args.push('headers');
    if (hasBody) args.push('body');
    lines.push(`  /**`);
    lines.push(`   * ${op.summary || ''}`);
    lines.push(`   * ${method} ${op.pathKey}`);
    lines.push(`   */`);
    lines.push(`  async ${fn}(${args.join(', ')}) {`);
    lines.push(`    return this.http.request({`);
    lines.push(`      path: \`${pathTmpl}\`,`);
    lines.push(`      method: '${method}',`);
    if (queryParams.length) lines.push(`      query: query,`);
    if (headerParams.length) lines.push(`      headers: headers,`);
    if (hasBody) lines.push(`      body: body,`);
    lines.push(`    });`);
    lines.push(`  }`);
  }

  lines.push('}');
  lines.push('');
  lines.push(`export default ${className}Api;`);
  return lines.join('\n');
}

function groupOperationsByTag(openapi) {
  const byTag = new Map();
  const paths = openapi.paths || {};
  for (const [pathKey, item] of Object.entries(paths)) {
    for (const method of Object.keys(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) continue;
      const op = item[method];
      const tags = pickTags(op);
      const fnName = opFunctionName(op, pathKey, method);
      const entry = { ...op, method, pathKey, fnName };
      for (const tag of tags) {
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag).push(entry);
      }
    }
  }
  return byTag;
}

async function main() {
  const specUrl = process.argv[2] || process.env.SPEC_URL || DEFAULT_SPEC;
  console.log(`[gen] Downloading OpenAPI spec: ${specUrl}`);
  const spec = await fetchJson(specUrl);
  const outDir = path.resolve('src/auth-client');
  await ensureDir(outDir);

  console.log('[gen] Writing base.js');
  await writeFile(path.join(outDir, 'base.js'), genBaseJs());

  const grouped = groupOperationsByTag(spec);
  const exports = [];
  for (const [tag, ops] of grouped.entries()) {
    const mod = genApiModule(tag, ops);
    const file = path.join(outDir, `${toSafeName(tag.toLowerCase())}-api.js`);
    console.log(`[gen] Writing ${path.relative(process.cwd(), file)} with ${ops.length} ops`);
    await writeFile(file, mod);
    const className = toSafeName(tag[0].toUpperCase() + tag.slice(1));
    exports.push({ tag, file: `${toSafeName(tag.toLowerCase())}-api.js`, className });
  }

  const indexLines = [];
  for (const e of exports) {
    indexLines.push(`export { default as ${e.className}Api } from './${e.file}';`);
  }
  indexLines.push(`export * from './base.js';`);
  await writeFile(path.join(outDir, 'index.js'), indexLines.join('\n'));

  console.log('[gen] Done.');
}

main().catch((e) => {
  console.error('[gen] Failed:', e);
  process.exit(1);
});
