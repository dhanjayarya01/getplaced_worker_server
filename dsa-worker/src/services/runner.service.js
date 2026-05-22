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

  let code = (userCode || '').trim();
  if (!code) {
    throw new Error('Submitted code is empty');
  }

  // Strip user-defined ListNode/TreeNode to prevent duplicate class/struct errors
  // This handles Java, C++, JS, Python common definitions
  const patternsToRemove = [
    // Java / C++ / JS class or struct
    /(?:public\s+)?(?:class|struct)\s+(?:ListNode|TreeNode)\s*\{[\s\S]*?\}(?=\s*(?:public\s+)?(?:class|struct|interface|enum|def|\/\/|\/\*|$))/g,
    // Python class
    /class\s+(?:ListNode|TreeNode)(?:\([\s\S]*?\))?:[\s\S]*?(?=\n\s*class\s+|\n\s*def\s+|$)/g,
    // JS function
    /function\s+(?:ListNode|TreeNode)\s*\([\s\S]*?\)\s*\{[\s\S]*?\}(?=\s*(?:class|function|var|let|const|\/\/|\/\*|$))/g
  ];

  for (const pattern of patternsToRemove) {
    code = code.replace(pattern, '');
  }

  // Fix Python IndentationError for empty starter code
  if (lang === 'python' || lang === 'python3') {
    if (code.trim().endsWith(':')) {
      code += '\n        pass';
    }
  }

  return template.replace(MARKER, code);
}

export default { buildRunnableCode, MARKER };
