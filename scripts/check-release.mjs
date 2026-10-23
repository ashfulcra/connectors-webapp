import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
const root = resolve(process.argv[2] || '.');
const files = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
if (!files.length) throw Error('No tracked source to audit; stage the intended release first');
const problems = [];
const forbidden =
  /(^|\/)(?:\.private|node_modules|\.vercel|\.svelte-kit|coverage)(\/|$)|(^|\/)\.env(?:$|\.)|\.(?:pem|p12|pfx|key)$/i;
const imports = new Map(
  [
    ...readFileSync(resolve(root, 'src/lib/server/public-guides.js'), 'utf8').matchAll(
      /import (\w+) from '\.\.\/\.\.\/\.\.\/([^']+)\?raw'/g
    )
  ].map((m) => [m[1], m[2]])
);
const guides = new Map(
  [
    ...readFileSync(resolve(root, 'src/lib/server/public-guides.js'), 'utf8').matchAll(
      /'([^']+\.md)': (\w+)[,\n]/g
    )
  ]
    .filter((m) => imports.has(m[2]))
    .map((m) => [m[1], imports.get(m[2])])
);
for (const file of files) {
  if (file !== '.env.example' && forbidden.test(file))
    problems.push(file + ': private/generated/key file is tracked');
  if (
    ![
      '.md',
      '.js',
      '.mjs',
      '.ts',
      '.svelte',
      '.json',
      '.toml',
      '.yml',
      '.yaml',
      '.example'
    ].includes(extname(file))
  )
    continue;
  const text = readFileSync(resolve(root, file), 'utf8');
  const markers = [
    /https?:\/\/(?:[\w.-]+\.)?otter\.ai\/u\//i,
    /https?:\/\/[\w.-]*zoom\.us\/(?:rec|j)\//i,
    /\/Users\/[^/\s]+\//,
    /\b(?:prj|dpl)_[A-Za-z0-9]{16,}\b/,
    /\bwrun_[0-9A-HJKMNP-TV-Z]{26}\b/
  ];
  if (markers.some((re) => re.test(text)))
    problems.push(file + ': instance/meeting/personal marker found');
  if (extname(file) === '.md')
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const path = target.startsWith('/guides/')
        ? guides.get(target.slice(8))
        : target === '/guide'
          ? 'src/routes/guide/+page.svelte'
          : target.startsWith('/')
            ? null
            : resolve(dirname(resolve(root, file)), decodeURIComponent(target));
      if (!path || !existsSync(resolve(root, path)))
        problems.push(file + ': broken internal link ' + target);
    }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `Release privacy/file/link checks passed: ${files.length} tracked files. Run Gitleaks separately for secret patterns.`
);
