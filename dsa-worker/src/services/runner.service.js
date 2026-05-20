const MARKER = '___USER_CODE___';

/**
 * Build runnable source for Judge0 from DB-stored per-problem runner template.
 */
export function buildRunnableCode(problem, userCode, language) {
  const lang = language.toLowerCase();
  const entry = problem.runners?.[lang];
  const template = typeof entry === 'string' ? entry : entry?.template;

  if (!template || typeof template !== 'string') {
    throw new Error(
      `Problem "${problem.slug || problem.title}" has no runner for language: ${lang}`
    );
  }

  if (!template.includes(MARKER)) {
    throw new Error(`Runner template missing ${MARKER} (${lang})`);
  }

  const code = (userCode || '').trim();
  if (!code) {
    throw new Error('Submitted code is empty');
  }

  return template.replace(MARKER, code);
}

export default { buildRunnableCode, MARKER };
