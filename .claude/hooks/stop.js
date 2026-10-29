const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Защита от рекурсии: дочерние `claude -p` (их запускает сам хук) тоже срабатывают на Stop.
// Цикл по issues ведёт этот скрипт в родительской сессии, дочерним он ничего не делает.
if (process.env.RALPH_CHILD) process.exit(0);

// Хук может запускаться из любого cwd: всё считаем от корня репозитория.
const root = path.join(__dirname, '..', '..');
process.chdir(root);

const configFile = '.claude/ralph.config.json';
const counterFile = '.claude/ralph.iterations.json';
const lockFile = '.claude/ralph.lock';

// Ошибка хука не должна ломать каждый Stop: сообщаем и выходим с 0.
function fail(message) {
  console.error(`⚠️ Ralph: ${message}`);
  process.exit(0);
}

if (!fs.existsSync(configFile)) process.exit(0);

let config;
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch (e) {
  fail(`не удалось прочитать ${configFile}: ${e.message}`);
}

if (!config.active) process.exit(0);

// Второй цикл параллельно запускать нельзя: две сессии правят одну ветку и схему БД.
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

if (fs.existsSync(lockFile)) {
  const pid = Number(fs.readFileSync(lockFile, 'utf8'));
  if (pid && isAlive(pid)) {
    console.log(`⏸ Ralph уже работает (PID ${pid}).`);
    process.exit(0);
  }
}
fs.writeFileSync(lockFile, String(process.pid));
process.on('exit', () => fs.rmSync(lockFile, { force: true }));
// Ctrl+C и kill тоже снимают блокировку (handler 'exit' сработает после process.exit).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(1));
}

let counter = { count: 0, phaseIndex: 0 };
if (fs.existsSync(counterFile)) {
  try {
    counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
  } catch {
    // Битый счётчик — начинаем заново.
  }
}

const saveCounter = () =>
  fs.writeFileSync(counterFile, JSON.stringify(counter));

const GH_TIMEOUT_MS = 60_000;
// Дочерняя сессия работает долго, но не бесконечно: `timeoutMs` из конфига (по умолчанию 30 минут).
const CLAUDE_TIMEOUT_MS = config.timeoutMs ?? 30 * 60_000;

// Аргументы массивом (без shell): кавычки и $ в milestone/prompt не ломают команду.
// По таймауту execFileSync убивает процесс и бросает ошибку (её ловят fail/catch ниже).
function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    timeout: GH_TIMEOUT_MS,
    ...options,
  });
}

// Дочерняя сессия. `claudeArgs` из конфига — например ["--permission-mode", "acceptEdits"]
// и нужные --allowedTools: без них `claude -p` не сможет запускать Bash/git/gh без вопросов.
function claude(prompt, extra = []) {
  run(
    'claude',
    [
      '-p',
      prompt,
      ...(config.claudeArgs ?? []),
      '--max-turns',
      String(config.maxTurns),
      ...extra,
    ],
    {
      stdio: 'inherit',
      timeout: CLAUDE_TIMEOUT_MS,
      env: { ...process.env, RALPH_CHILD: '1' },
    },
  );
}

const fill = (template, phase) =>
  template
    .replaceAll('{milestone}', phase.milestone)
    .replaceAll('{branch}', phase.branch);

const currentPhase = () =>
  config.phases
    ? config.phases[counter.phaseIndex]
    : counter.phaseIndex === 0
      ? { milestone: config.milestone, branch: config.branch }
      : undefined;

function openIssues(phase) {
  return JSON.parse(
    run('gh', [
      'issue',
      'list',
      '--milestone',
      phase.milestone,
      '--state',
      'open',
      '--json',
      'number,title',
    ]),
  );
}

// Фаза закончилась: PR (если его ещё нет) и ревью.
function finishPhase(phase) {
  console.log(`✅ Фаза ${counter.phaseIndex + 1} завершена. Создаём PR...`);

  // Дубликаты PR не нужны: если для ветки PR уже есть, пропускаем создание.
  const existing = JSON.parse(
    run('gh', [
      'pr',
      'list',
      '--head',
      phase.branch,
      '--state',
      'open',
      '--json',
      'number',
    ]),
  );
  if (existing.length === 0) {
    claude(
      `Запушь ветку ${phase.branch} (git push -u origin ${phase.branch}) и создай PR из неё в main с названием 'feat: ${phase.milestone}'.`,
      ['--model', 'claude-opus-5-5'],
    );
  }

  console.log('🔍 Ревью Opus...');
  claude(
    `Найди открытый PR из ветки ${phase.branch} и проведи детальное code review. Проверь архитектуру, безопасность, производительность и соответствие PRD. Оставь комментарии в PR через gh cli.`,
    ['--model', 'claude-opus-5-5'],
  );
}

try {
  // Одна итерация = одна дочерняя сессия = одна issue (правила — в ralph.md).
  // Цикл ведём здесь, а не рекурсией через Stop дочерних сессий.
  for (;;) {
    const phase = currentPhase();
    if (!phase) {
      console.log('🎉 Все фазы завершены.');
      break;
    }

    const issues = openIssues(phase);

    if (issues.length === 0) {
      finishPhase(phase);
      counter.phaseIndex++;
      counter.count = 0;
      saveCounter();
      const next = currentPhase();
      if (next)
        console.log(`➡️ Фаза ${counter.phaseIndex + 1}: ${next.milestone}`);
      continue;
    }

    if (counter.count >= config.maxIterations) {
      console.log(`⛔ Лимит итераций (${config.maxIterations}) достигнут.`);
      counter.count = 0;
      saveCounter();
      break;
    }

    counter.count++;
    saveCounter();
    console.log(
      `🔄 Фаза ${counter.phaseIndex + 1} — Итерация ${counter.count}/${config.maxIterations} — Issue #${issues[0].number}: ${issues[0].title}`,
    );
    console.log(`📋 Осталось: ${issues.length}`);

    claude(fill(config.prompt, phase));

    // Сессия могла завершиться «успешно», ничего не сделав (например, отказ в разрешениях).
    // Без прогресса цикл остановится, а не будет жечь итерации на одной и той же issue.
    if (openIssues(phase).length >= issues.length) {
      console.log(
        `⛔ Нет прогресса: Issue #${issues[0].number} не закрыта. Остановка.`,
      );
      break;
    }
  }
} catch (e) {
  fail(`шаг не выполнился: ${e.message}`);
}
