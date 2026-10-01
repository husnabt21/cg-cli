import * as fs from 'fs';
import * as path from 'path';
import Parser from 'web-tree-sitter';

type SyntaxNode = Parser.SyntaxNode;
type Language = Parser.Language;

// ---------- Types describing what we extract from ONE file ----------

export type SymbolKind = 'function' | 'method' | 'class' | 'symbol';

export interface ParsedSymbol {
  kind: SymbolKind;
  name: string; // methods are qualified: "ClassName.methodName"
  startLine: number; // 1-based
  endLine: number; // 1-based
}

export interface ImportBinding {
  local: string; // the name used inside this file
  imported: string; // original name, or "default", or "*" (whole module)
}

export interface ParsedImport {
  specifier: string; // e.g. "./auth" or "react"
  bindings: ImportBinding[];
}

export interface ParsedExport {
  local: string; // name inside this file
  exported: string; // name other files import it by ("default" for default exports)
}

export interface ParsedReexport {
  specifier: string;
  names: ParsedExport[] | '*';
}

export interface ParsedUsage {
  kind: 'CALLS' | 'REFERENCES';
  target: string; // "foo", "this.bar" or "Thing.member"
  owner: string | null; // enclosing symbol name, or null = top level of the file
}

export interface ParsedFile {
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  reexports: ParsedReexport[];
  usages: ParsedUsage[];
}

// ---------- Small helpers ----------

const FUNCTION_VALUE_TYPES = new Set([
  'arrow_function',
  'function_expression',
  'function',
  'generator_function',
]);

const DECLARATION_TYPES = new Set([
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'class',
]);

function stripQuotes(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, '');
}

function sameNode(a: SyntaxNode | null, b: SyntaxNode): boolean {
  return !!a && a.startIndex === b.startIndex && a.endIndex === b.endIndex;
}

function isFunctionValue(node: SyntaxNode | null): boolean {
  return !!node && FUNCTION_VALUE_TYPES.has(node.type);
}

/** Turns a call target into a simple name: foo -> "foo", this.bar -> "this.bar", ns.fn -> "ns.fn". */
function calleeName(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'type_identifier') return node.text;
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName('object');
    const prop = node.childForFieldName('property');
    if (!obj || !prop) return null;
    if (obj.type === 'this') return `this.${prop.text}`;
    if (obj.type === 'identifier') return `${obj.text}.${prop.text}`;
  }
  return null;
}

function requireSpecifier(call: SyntaxNode): string | null {
  const args = call.childForFieldName('arguments');
  const first = args ? args.namedChildren[0] : undefined;
  if (first && first.type === 'string') return stripQuotes(first.text);
  return null;
}

function readSpecifiers(clause: SyntaxNode): ParsedExport[] {
  const result: ParsedExport[] = [];
  for (const spec of clause.namedChildren) {
    if (spec.type !== 'export_specifier') continue;
    const name = spec.childForFieldName('name');
    const alias = spec.childForFieldName('alias');
    if (name) result.push({ local: name.text, exported: alias ? alias.text : name.text });
  }
  return result;
}

// ---------- The extractor: walks one syntax tree ----------

function extract(root: SyntaxNode): ParsedFile {
  const out: ParsedFile = { symbols: [], imports: [], exports: [], reexports: [], usages: [] };

  function addSymbol(kind: SymbolKind, name: string, range: SyntaxNode): void {
    out.symbols.push({
      kind,
      name,
      startLine: range.startPosition.row + 1,
      endLine: range.endPosition.row + 1,
    });
  }

  function registerExport(name: string, exported: boolean, isDefault: boolean): void {
    if (!exported) return;
    out.exports.push({ local: name, exported: isDefault ? 'default' : name });
  }

  /** Finds calls (CALLS) and uses of classes/types/components (REFERENCES) inside a node. */
  function collectUsages(node: SyntaxNode, owner: string | null): void {
    switch (node.type) {
      case 'call_expression': {
        const target = calleeName(node.childForFieldName('function'));
        if (target === 'require') {
          const spec = requireSpecifier(node);
          if (spec) out.imports.push({ specifier: spec, bindings: [] });
        } else if (target) {
          out.usages.push({ kind: 'CALLS', target, owner });
        }
        break;
      }
      case 'new_expression': {
        const target = calleeName(node.childForFieldName('constructor'));
        if (target) out.usages.push({ kind: 'REFERENCES', target, owner });
        break;
      }
      case 'jsx_opening_element':
      case 'jsx_self_closing_element': {
        const nameNode = node.childForFieldName('name');
        if (
          nameNode &&
          (nameNode.type === 'identifier' || nameNode.type === 'nested_identifier') &&
          /^[A-Z]/.test(nameNode.text)
        ) {
          out.usages.push({ kind: 'REFERENCES', target: nameNode.text, owner });
        }
        break;
      }
      case 'type_identifier': {
        const parent = node.parent;
        const isDeclarationName =
          !!parent &&
          DECLARATION_TYPES.has(parent.type) &&
          sameNode(parent.childForFieldName('name'), node);
        if (!isDeclarationName) out.usages.push({ kind: 'REFERENCES', target: node.text, owner });
        return;
      }
    }
    for (const child of node.namedChildren) collectUsages(child, owner);
  }

  /** Used for "extends Foo" / "implements Bar". */
  function collectHeritage(node: SyntaxNode, owner: string): void {
    if (node.type === 'identifier' || node.type === 'type_identifier') {
      out.usages.push({ kind: 'REFERENCES', target: node.text, owner });
      return;
    }
    if (node.type === 'member_expression' || node.type === 'nested_type_identifier') {
      if (/^\w+\.\w+$/.test(node.text)) {
        out.usages.push({ kind: 'REFERENCES', target: node.text, owner });
      }
      return;
    }
    for (const child of node.namedChildren) collectHeritage(child, owner);
  }

  function addFunction(node: SyntaxNode, range: SyntaxNode, exported: boolean, isDefault: boolean): void {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? nameNode.text : 'default';
    addSymbol('function', name, range);
    registerExport(name, exported, isDefault);
    for (const child of node.namedChildren) {
      if (sameNode(nameNode, child)) continue;
      collectUsages(child, name);
    }
  }

  function addClassMember(member: SyntaxNode, className: string): void {
    if (member.type === 'method_definition') {
      const nameNode = member.childForFieldName('name');
      const qualified = `${className}.${nameNode ? nameNode.text : '<anonymous>'}`;
      addSymbol('method', qualified, member);
      collectUsages(member, qualified);
      return;
    }
    if (member.type === 'public_field_definition' || member.type === 'field_definition') {
      const nameNode = member.childForFieldName('name') ?? member.childForFieldName('property');
      const value = member.childForFieldName('value');
      if (nameNode && value && isFunctionValue(value)) {
        const qualified = `${className}.${nameNode.text}`;
        addSymbol('method', qualified, member);
        collectUsages(value, qualified);
        return;
      }
    }
    collectUsages(member, className);
  }

  function addClass(node: SyntaxNode, range: SyntaxNode, exported: boolean, isDefault: boolean): void {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? nameNode.text : 'default';
    addSymbol('class', name, range);
    registerExport(name, exported, isDefault);
    for (const child of node.namedChildren) {
      if (sameNode(nameNode, child)) continue;
      if (child.type === 'class_body') {
        for (const member of child.namedChildren) addClassMember(member, name);
      } else if (child.type === 'class_heritage') {
        collectHeritage(child, name);
      } else {
        collectUsages(child, name);
      }
    }
  }

  /** interface / type alias / enum -> SYMBOL node */
  function addTypeSymbol(node: SyntaxNode, range: SyntaxNode, exported: boolean, isDefault: boolean): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) {
      collectUsages(node, null);
      return;
    }
    addSymbol('symbol', nameNode.text, range);
    registerExport(nameNode.text, exported, isDefault);
    for (const child of node.namedChildren) {
      if (sameNode(nameNode, child)) continue;
      collectUsages(child, nameNode.text);
    }
  }

  /** const x = require('...') */
  function handleRequire(nameNode: SyntaxNode | null, value: SyntaxNode): boolean {
    if (value.type !== 'call_expression') return false;
    const fn = value.childForFieldName('function');
    if (!fn || fn.type !== 'identifier' || fn.text !== 'require') return false;
    const specifier = requireSpecifier(value);
    if (!specifier) return false;

    const bindings: ImportBinding[] = [];
    if (nameNode && nameNode.type === 'identifier') {
      bindings.push({ local: nameNode.text, imported: '*' });
    } else if (nameNode && nameNode.type === 'object_pattern') {
      for (const part of nameNode.namedChildren) {
        if (part.type === 'shorthand_property_identifier_pattern') {
          bindings.push({ local: part.text, imported: part.text });
        } else if (part.type === 'pair_pattern') {
          const key = part.childForFieldName('key');
          const val = part.childForFieldName('value');
          if (key && val && val.type === 'identifier') {
            bindings.push({ local: val.text, imported: key.text });
          }
        }
      }
    }
    out.imports.push({ specifier, bindings });
    return true;
  }

  function handleVariables(decl: SyntaxNode, range: SyntaxNode, exported: boolean): void {
    for (const declarator of decl.namedChildren) {
      if (declarator.type !== 'variable_declarator') continue;
      const nameNode = declarator.childForFieldName('name');
      const value = declarator.childForFieldName('value');

      if (value && handleRequire(nameNode, value)) continue;

      if (nameNode && nameNode.type === 'identifier') {
        const name = nameNode.text;
        if (value && isFunctionValue(value)) {
          addSymbol('function', name, range);
          registerExport(name, exported, false);
          collectUsages(value, name);
          continue;
        }
        if (exported) {
          addSymbol('symbol', name, range);
          registerExport(name, true, false);
          if (value) collectUsages(value, name);
          continue;
        }
      }
      if (value) collectUsages(value, null);
    }
  }

  function handleDeclaration(decl: SyntaxNode, range: SyntaxNode, exported: boolean, isDefault: boolean): void {
    switch (decl.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
      case 'function_expression':
      case 'function':
      case 'generator_function':
        addFunction(decl, range, exported, isDefault);
        break;
      case 'class_declaration':
      case 'abstract_class_declaration':
      case 'class':
        addClass(decl, range, exported, isDefault);
        break;
      case 'lexical_declaration':
      case 'variable_declaration':
        handleVariables(decl, range, exported);
        break;
      case 'interface_declaration':
      case 'type_alias_declaration':
      case 'enum_declaration':
        addTypeSymbol(decl, range, exported, isDefault);
        break;
      default:
        collectUsages(decl, null);
    }
  }

  function handleImport(node: SyntaxNode): void {
    const source = node.childForFieldName('source');
    if (!source) return;
    const specifier = stripQuotes(source.text);
    const bindings: ImportBinding[] = [];

    for (const child of node.namedChildren) {
      if (child.type !== 'import_clause') continue;
      for (const part of child.namedChildren) {
        if (part.type === 'identifier') {
          bindings.push({ local: part.text, imported: 'default' });
        } else if (part.type === 'namespace_import') {
          const id = part.namedChildren.find((c) => c.type === 'identifier');
          if (id) bindings.push({ local: id.text, imported: '*' });
        } else if (part.type === 'named_imports') {
          for (const spec of part.namedChildren) {
            if (spec.type !== 'import_specifier') continue;
            const name = spec.childForFieldName('name');
            const alias = spec.childForFieldName('alias');
            if (name) bindings.push({ local: alias ? alias.text : name.text, imported: name.text });
          }
        }
      }
    }
    out.imports.push({ specifier, bindings });
  }

  function handleExport(node: SyntaxNode): void {
    // export { a } from './x'   /   export * from './x'
    const source = node.childForFieldName('source');
    if (source) {
      const clause = node.namedChildren.find((c) => c.type === 'export_clause');
      out.reexports.push({
        specifier: stripQuotes(source.text),
        names: clause ? readSpecifiers(clause) : '*',
      });
      return;
    }

    const isDefault = node.children.some((c) => c.type === 'default');

    // export function foo() {}  /  export const x = ...  /  export default class Foo {}
    const decl = node.childForFieldName('declaration');
    if (decl) {
      handleDeclaration(decl, node, true, isDefault);
      return;
    }

    // export { a, b as c }
    const clause = node.namedChildren.find((c) => c.type === 'export_clause');
    if (clause) {
      out.exports.push(...readSpecifiers(clause));
      return;
    }

    // export default something
    const value = node.childForFieldName('value');
    if (value) {
      if (value.type === 'identifier') {
        out.exports.push({ local: value.text, exported: 'default' });
      } else if (isFunctionValue(value)) {
        addSymbol('function', 'default', node);
        out.exports.push({ local: 'default', exported: 'default' });
        collectUsages(value, 'default');
      } else if (value.type === 'class' || value.type === 'class_expression') {
        addClass(value, node, true, true);
      } else {
        collectUsages(value, null);
      }
    }
  }

  /** CommonJS: module.exports = ..., exports.foo = ... */
  function handleExpressionStatement(node: SyntaxNode): void {
    const expr = node.namedChildren[0];
    if (!expr || expr.type !== 'assignment_expression') {
      collectUsages(node, null);
      return;
    }
    const left = expr.childForFieldName('left');
    const right = expr.childForFieldName('right');
    if (!left || !right) {
      collectUsages(node, null);
      return;
    }

    if (left.text === 'module.exports') {
      if (right.type === 'identifier') {
        out.exports.push({ local: right.text, exported: 'default' });
      } else if (right.type === 'object') {
        for (const prop of right.namedChildren) {
          if (prop.type === 'shorthand_property_identifier') {
            out.exports.push({ local: prop.text, exported: prop.text });
          } else if (prop.type === 'pair') {
            const key = prop.childForFieldName('key');
            const value = prop.childForFieldName('value');
            if (key && value && value.type === 'identifier') {
              out.exports.push({ local: value.text, exported: key.text });
            } else {
              collectUsages(prop, null);
            }
          } else {
            collectUsages(prop, null);
          }
        }
      } else if (isFunctionValue(right)) {
        addSymbol('function', 'default', node);
        out.exports.push({ local: 'default', exported: 'default' });
        collectUsages(right, 'default');
      } else {
        collectUsages(right, null);
      }
      return;
    }

    const match = /^(?:module\.)?exports\.(\w+)$/.exec(left.text);
    if (match) {
      const name = match[1];
      if (right.type === 'identifier') {
        out.exports.push({ local: right.text, exported: name });
      } else if (isFunctionValue(right)) {
        addSymbol('function', name, node);
        out.exports.push({ local: name, exported: name });
        collectUsages(right, name);
      } else {
        collectUsages(right, null);
      }
      return;
    }

    collectUsages(node, null);
  }

  for (const node of root.namedChildren) {
    switch (node.type) {
      case 'comment':
        break;
      case 'import_statement':
        handleImport(node);
        break;
      case 'export_statement':
        handleExport(node);
        break;
      case 'expression_statement':
        handleExpressionStatement(node);
        break;
      default:
        handleDeclaration(node, node, false, false);
    }
  }

  return out;
}

// ---------- Public parser wrapper ----------

function findWasmDir(): string {
  const candidates: string[] = [];
  try {
    candidates.push(path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out'));
  } catch {
    // ignore, try the next candidate
  }
  candidates.push(path.join(__dirname, '..', '..', 'node_modules', 'tree-sitter-wasms', 'out'));

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('Could not find the tree-sitter-wasms package. Did you run "npm install"?');
}

export class CodeParser {
  private constructor(
    private parser: Parser,
    private languages: Map<string, Language>
  ) {}

  static async create(): Promise<CodeParser> {
    await Parser.init();
    const wasmDir = findWasmDir();

    const load = (file: string) => Parser.Language.load(path.join(wasmDir, file));
    const javascript = await load('tree-sitter-javascript.wasm');
    const typescript = await load('tree-sitter-typescript.wasm');
    const tsx = await load('tree-sitter-tsx.wasm');

    const languages = new Map<string, Language>([
      ['.js', javascript],
      ['.jsx', javascript],
      ['.ts', typescript],
      ['.tsx', tsx],
    ]);
    return new CodeParser(new Parser(), languages);
  }

  parse(relPath: string, source: string): ParsedFile {
    const ext = path.extname(relPath).toLowerCase();
    const language = this.languages.get(ext);
    if (!language) throw new Error(`Unsupported file type: ${ext}`);

    this.parser.setLanguage(language);
    const tree = this.parser.parse(source);
    try {
      return extract(tree.rootNode);
    } finally {
      tree.delete();
    }
  }
}