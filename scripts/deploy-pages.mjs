// Builds the app for GitHub Pages and force-pushes it to the `gh-pages` branch.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });
const remote = execSync('git remote get-url origin').toString().trim();
const dir = 'dist-pages';

run('npx tsc --noEmit -p tsconfig.json');
run(`npx vite build --mode pages --outDir ${dir} --emptyOutDir`);
fs.writeFileSync(path.join(dir, '.nojekyll'), '');
// Single-page app: serve the editor for unknown paths too.
fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, '404.html'));
// Vercel reads the config of the pushed branch itself, so tell it not to build this already-built branch.
fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify({ git: { deploymentEnabled: false } }, null, 2) + '\n');

fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
run('git init -q -b gh-pages', dir);
run('git add -A', dir);
run('git commit -q -m "Deploy to GitHub Pages"', dir);
run(`git push -f -q ${remote} gh-pages`, dir);
fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
console.log('\nDeployed to GitHub Pages.');
