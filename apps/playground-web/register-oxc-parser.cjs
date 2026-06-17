const Module = require('module');
const originalRequire = Module.prototype.require;

// Load the native binary directly
const binding = require('@oxc-parser/binding-darwin-arm64');

function jsonParseAst(programJson) {
  const { node: program, fixes } = JSON.parse(programJson);
  for (const fixPath of fixes) {
    applyFix(program, fixPath);
  }
  return program;
}

function applyFix(program, fixPath) {
  let node = program;
  for (const key of fixPath) {
    node = node[key];
  }
  if (node.bigint) {
    node.value = BigInt(node.bigint);
  } else {
    try {
      node.value = RegExp(node.regex.pattern, node.regex.flags);
    } catch {}
  }
}

function wrap(result) {
  let program, module, comments, errors;
  return {
    get program() {
      if (!program) program = jsonParseAst(result.program);
      return program;
    },
    get module() {
      if (!module) module = result.module;
      return module;
    },
    get comments() {
      if (!comments) comments = result.comments;
      return comments;
    },
    get errors() {
      if (!errors) errors = result.errors;
      return errors;
    },
  };
}

function parseSync(filename, sourceText, options) {
  return wrap(binding.parseSync(filename, sourceText, options));
}

const mockOxcParser = {
  parseSync,
  wrap,
  jsonParseAst
};

Module.prototype.require = function (id) {
  if (id === 'oxc-parser') {
    return mockOxcParser;
  }
  return originalRequire.apply(this, arguments);
};
