/**
 * ESLint rule: require-span-for-public
 *
 * Enforces that all public exported functions/consts have corresponding
 * Instrumentation.create*Span/Event calls in their implementation.
 *
 * Violations:
 * ❌ export function foo() { ... }           // No Instrumentation call
 * ❌ export const bar = () => { ... }        // No Instrumentation call
 *
 * Correct:
 * ✅ export function foo() {
 *      const span = Instrumentation.createSpan(...);
 *      ...
 *    }
 *
 * ✅ export const bar = () => {
 *      Instrumentation.createErrorEvent(...);
 *      ...
 *    }
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require OTEL span instrumentation for all public functions',
      category: 'Observability',
      recommended: true,
      url: 'https://github.com/seanchatmangpt/pictl/blob/main/.claude/OTEL_COVERAGE.md',
    },
    fixable: 'code',
    messages: {
      noSpan:
        'Public function "{{ name }}" must have an Instrumentation call. Add Instrumentation.createSpan() or similar at the start of the function.',
      missingInstrumentation:
        'Exported function must emit OTEL span via Instrumentation helper',
    },
  },

  create(context) {
    return {
      ExportNamedDeclaration(node) {
        // Skip type exports (interfaces, types)
        if (
          node.declaration &&
          (node.declaration.type === 'TSInterfaceDeclaration' ||
            node.declaration.type === 'TSTypeAliasDeclaration')
        ) {
          return;
        }

        // Check function declarations
        if (node.declaration && node.declaration.type === 'FunctionDeclaration') {
          const funcName = node.declaration.id.name;
          const hasSpan = hasInstrumentationCall(node.declaration);

          if (!hasSpan) {
            context.report({
              node,
              messageId: 'noSpan',
              data: { name: funcName },
              fix(fixer) {
                return suggestSpanInsertion(fixer, node, funcName);
              },
            });
          }
        }

        // Check variable declarations (const foo = () => {...})
        if (
          node.declaration &&
          node.declaration.type === 'VariableDeclaration'
        ) {
          node.declaration.declarations.forEach(decl => {
            if (
              decl.init &&
              (decl.init.type === 'ArrowFunctionExpression' ||
                decl.init.type === 'FunctionExpression')
            ) {
              const constName = decl.id.name;
              const hasSpan = hasInstrumentationCall(decl.init);

              if (!hasSpan) {
                context.report({
                  node: decl,
                  messageId: 'noSpan',
                  data: { name: constName },
                  fix(fixer) {
                    return suggestSpanInsertion(fixer, decl.init, constName);
                  },
                });
              }
            }
          });
        }

        // Check class declarations (methods checked separately)
        if (node.declaration && node.declaration.type === 'ClassDeclaration') {
          const classNode = node.declaration;
          classNode.body.body.forEach(methodNode => {
            if (
              methodNode.type === 'MethodDefinition' &&
              !methodNode.static &&
              methodNode.kind === 'method'
            ) {
              const methodName = methodNode.key.name;
              const hasSpan = hasInstrumentationCall(methodNode.value);

              if (!hasSpan && !isPrivateMethod(methodName)) {
                context.report({
                  node: methodNode,
                  messageId: 'noSpan',
                  data: { name: methodName },
                });
              }
            }
          });
        }
      },
    };
  },
};

/**
 * Check if function body contains Instrumentation call
 */
function hasInstrumentationCall(node) {
  if (!node || !node.body) return false;

  const body =
    node.body.type === 'BlockStatement' ? node.body.body : [node.body];

  return body.some(stmt => {
    return /Instrumentation\.(create|emit|record)/.test(
      codeToString(stmt)
    );
  });
}

/**
 * Convert AST node to code string
 */
function codeToString(node) {
  if (!node) return '';
  if (node.type === 'ExpressionStatement')
    return codeToString(node.expression);
  if (node.type === 'CallExpression') {
    if (node.callee.type === 'MemberExpression') {
      const object = codeToString(node.callee.object);
      const property = codeToString(node.callee.property);
      return `${object}.${property}`;
    }
  }
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    return `${codeToString(node.object)}.${codeToString(node.property)}`;
  }
  return '';
}

/**
 * Check if method name suggests it's private
 */
function isPrivateMethod(name) {
  return name.startsWith('_') || name.startsWith('#');
}

/**
 * Suggest span insertion fix
 */
function suggestSpanInsertion(fixer, node, name) {
  if (node.type === 'FunctionDeclaration') {
    const body = node.body;
    if (body && body.body && body.body.length > 0) {
      const firstStmt = body.body[0];
      const spanCode = `const span = Instrumentation.createSpan("${name}", requiredAttrs);\n    `;
      return fixer.insertTextBefore(firstStmt, spanCode);
    }
  }

  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (node.body && node.body.type === 'BlockStatement') {
      if (node.body.body && node.body.body.length > 0) {
        const firstStmt = node.body.body[0];
        const spanCode = `const span = Instrumentation.createSpan("${name}", requiredAttrs);\n    `;
        return fixer.insertTextBefore(firstStmt, spanCode);
      }
    }
  }

  return null;
}
