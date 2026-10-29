const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Запуск возможен из любого cwd: всё считаем от корня репозитория.
process.chdir(path.join(__dirname, '..'));

const configFile = '.claude/ralph.config.json';
const counterFile = '.claude/ralph.iterations.json';

function die(message) {
  console.error(`⚠️ Ralph: ${message}`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch (e) {
  die(`не удалось прочитать ${configFile}: ${e.message}`);
}

// Формат как в stop.js: либо `phases`, либо плоские `milestone` и `branch`.
const phase = config.phases
  ? config.phases[0]
  : { milestone: config.milestone, branch: config.branch };

if (!phase?.milestone || !phase?.branch) {
  die(`в ${configFile} не заданы milestone и branch (или phases[0])`);
}

// При active: false Stop Hook ничего не запустит, и цикл не сработает.
if (!config.active) {
  die(`в ${configFile} "active": false — включите его перед запуском`);
}

// Аргументы массивом (без shell): кавычки и $ в milestone/prompt не ломают команду.
let issues;
try {
  issues = JSON.parse(
    execFileSync(
      'gh',
      [
        'issue',
        'list',
        '--milestone',
        phase.milestone,
        '--state',
        'open',
        '--json',
        'number',
      ],
      { encoding: 'utf8', timeout: 60_000 },
    ),
  );
} catch (e) {
  die(`gh issue list не выполнился: ${e.message}`);
}
if (issues.length === 0) {
  die(`в milestone '${phase.milestone}' нет открытых issues`);
}

// Сбрасываем счётчик итераций
fs.writeFileSync(counterFile, JSON.stringify({ count: 0, phaseIndex: 0 }));

const prompt = config.prompt
  .replaceAll('{milestone}', phase.milestone)
  .replaceAll('{branch}', phase.branch);
console.log(`🚀 Запускаем Ralph для milestone: ${phase.milestone}`);

// `claudeArgs` из конфига (разрешения, --permission-mode) — как в stop.js.
try {
  execFileSync(
    'claude',
    [
      '-p',
      prompt,
      ...(config.claudeArgs ?? []),
      '--max-turns',
      String(config.maxTurns),
    ],
    { stdio: 'inherit', timeout: config.timeoutMs ?? 30 * 60_000 },
  );
} catch (e) {
  die(`claude не завершился успешно: ${e.message}`);
}
