import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

test('Pages deployment is triggered only by main or manual dispatch', () => {
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('Pages workflow grants only read contents and required Pages deployment permissions', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\s*\n\s*pages:\s*write\s*\n\s*id-token:\s*write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('Pages artifact contains only runtime application files, no data or setup files', () => {
  assert.match(workflow, /cp index\.html script\.js style\.css supabase-config\.js dist\//);
  assert.doesNotMatch(workflow, /cp .*\.sql|cp .*README|cp .*\.json/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
