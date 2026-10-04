// dist にできたインストーラを GitHub Releases に公開する（GitHub CLI の gh を使う）
// electron-builder に直接アップロードさせると、リリースが 2 つに分かれることがあったため
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const exe = `dist/setori-board-Setup-${version}.exe`;
execFileSync('gh', [
  'release', 'create', `v${version}`, exe, `${exe}.blockmap`, 'dist/latest.yml',
  '--title', version, '--notes', `setori-board ${version}`,
], { stdio: 'inherit' });
