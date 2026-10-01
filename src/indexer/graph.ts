import * as path from 'path';
import { ParsedFile } from './parser';

export type NodeType = 'file' | 'function' | 'method' | 'class' | 'symbol';
export type EdgeType = 'CONTAINS' | 'IMPORTS' | 'EXPORTS' | 'CALLS' | 'REFERENCES';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  file: string; // "" for symbols that come from external packages
  startLine: number;
  endLine: number;
  module?: string; // only set for external symbols (e.g. "react")
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
}

export interface FileEntry {
  path: string;
  language: string;
  lines: number;
}

export interface CgIndex {
  version: number;
  indexedAt: string;
  root: string;
  files: FileEntry[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** One scanned + parsed file, handed from the index command to the graph builder. */
export interface IndexedFile {
  path: string;
  language: string;
  lineCount: number;
  parsed: ParsedFile;
}

interface ResolvedBinding {
  local: string;
  specifier: string;
  imported: string;
  targetFile: string | null; // set when the import points to a file in this project
  external: boolean; // true for packages like "react"
}

const ID_PREFIX: Record<NodeType, string> = {
  file: 'file',
  function: 'fn',
  method: 'method',
  class: 'class',
  symbol: 'sym',
};

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveRelative(fromFile: string, specifier: string, fileSet: Set<string>): string | null {
  if (!specifier.startsWith('.')) return null;

  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates: string[] = [base];

  // TypeScript projects often import "./foo.js" while the real file is "foo.ts"
  const withoutExt = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  if (withoutExt !== base) {
    for (const ext of EXTENSIONS) candidates.push(withoutExt + ext);
  }
  for (const ext of EXTENSIONS) candidates.push(base + ext);
  for (const ext of EXTENSIONS) candidates.push(path.posix.join(base, 'index' + ext));

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

export function buildGraph(root: string, files: IndexedFile[]): CgIndex {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeById = new Map<string, GraphNode>();
  const edgeKeys = new Set<string>();

  const fileSet = new Set(files.map((f) => f.path));
  const fileMap = new Map<string, IndexedFile>(files.map((f): [string, IndexedFile] => [f.path, f]));

  // file -> (symbol name -> node id)
  const localIndex = new Map<string, Map<string, string>>();
  // file -> (exported name -> node id)
  const exportIndex = new Map<string, Map<string, string>>();
  // file -> (local import name -> binding info)
  const importIndex = new Map<string, Map<string, ResolvedBinding>>();

  function addNode(node: GraphNode): void {
    if (nodeById.has(node.id)) return;
    nodeById.set(node.id, node);
    nodes.push(node);
  }

  function addEdge(from: string, to: string, type: EdgeType): void {
    const key = `${from}|${type}|${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, type });
  }

  // ---- Pass 1: file nodes, symbol nodes, CONTAINS edges ----
  for (const file of files) {
    const fileId = `file:${file.path}`;
    addNode({
      id: fileId,
      type: 'file',
      name: path.posix.basename(file.path),
      file: file.path,
      startLine: 1,
      endLine: file.lineCount,
    });

    const local = new Map<string, string>();
    localIndex.set(file.path, local);

    for (const sym of file.parsed.symbols) {
      let id = `${ID_PREFIX[sym.kind]}:${file.path}:${sym.name}`;
      if (nodeById.has(id)) id = `${id}#${sym.startLine}`; // two things with the same name

      addNode({
        id,
        type: sym.kind,
        name: sym.name,
        file: file.path,
        startLine: sym.startLine,
        endLine: sym.endLine,
      });
      if (!local.has(sym.name)) local.set(sym.name, id);

      let parentId = fileId;
      if (sym.kind === 'method') {
        const classId = local.get(sym.name.split('.')[0]);
        if (classId) parentId = classId;
      }
      addEdge(parentId, id, 'CONTAINS');
    }
  }

  // ---- Pass 2: EXPORTS ----
  for (const file of files) {
    const exported = new Map<string, string>();
    exportIndex.set(file.path, exported);
    const local = localIndex.get(file.path)!;

    for (const exp of file.parsed.exports) {
      const targetId = local.get(exp.local);
      if (!targetId) continue;
      if (!exported.has(exp.exported)) exported.set(exp.exported, targetId);
      addEdge(`file:${file.path}`, targetId, 'EXPORTS');
    }
  }

  // ---- Pass 3: IMPORTS ----
  function addImportEdge(file: string, specifier: string): string | null {
    const target = resolveRelative(file, specifier, fileSet);
    if (target) {
      addEdge(`file:${file}`, `file:${target}`, 'IMPORTS');
    } else if (!specifier.startsWith('.')) {
      const moduleId = `sym:ext:${specifier}`;
      addNode({ id: moduleId, type: 'symbol', name: specifier, file: '', startLine: 0, endLine: 0, module: specifier });
      addEdge(`file:${file}`, moduleId, 'IMPORTS');
    }
    return target;
  }

  for (const file of files) {
    const bindings = new Map<string, ResolvedBinding>();
    importIndex.set(file.path, bindings);

    for (const imp of file.parsed.imports) {
      const target = addImportEdge(file.path, imp.specifier);
      for (const b of imp.bindings) {
        bindings.set(b.local, {
          local: b.local,
          specifier: imp.specifier,
          imported: b.imported,
          targetFile: target,
          external: target === null && !imp.specifier.startsWith('.'),
        });
      }
    }
    for (const rx of file.parsed.reexports) addImportEdge(file.path, rx.specifier);
  }

  // ---- Name resolution helpers ----
  function resolveExport(targetFile: string, name: string, depth = 0): string | null {
    const hit = exportIndex.get(targetFile)?.get(name);
    if (hit) return hit;

    if (depth < 5) {
      const target = fileMap.get(targetFile);
      for (const rx of target ? target.parsed.reexports : []) {
        const next = resolveRelative(targetFile, rx.specifier, fileSet);
        if (!next) continue;
        if (rx.names === '*') {
          if (name !== 'default') {
            const found = resolveExport(next, name, depth + 1);
            if (found) return found;
          }
        } else {
          const match = rx.names.find((n) => n.exported === name);
          if (match) {
            const found = resolveExport(next, match.local, depth + 1);
            if (found) return found;
          }
        }
      }
    }
    return localIndex.get(targetFile)?.get(name) ?? null;
  }

  function resolveBinding(b: ResolvedBinding, member: string | null): string | null {
    if (b.targetFile) {
      if (b.imported === '*') {
        return member ? resolveExport(b.targetFile, member) : `file:${b.targetFile}`;
      }
      const id = resolveExport(b.targetFile, b.imported);
      if (!id) return null;
      if (member) {
        const node = nodeById.get(id);
        if (node && node.type === 'class') {
          const methodId = localIndex.get(node.file)?.get(`${node.name}.${member}`);
          if (methodId) return methodId;
        }
      }
      return id;
    }

    if (!b.external) return null;

    // External package (react, express, ...): create a SYMBOL node for it
    const base = b.imported === '*' || b.imported === 'default' ? b.local : b.imported;
    const name = member ? `${base}.${member}` : base;
    const id = `sym:ext:${b.specifier}:${name}`;
    addNode({ id, type: 'symbol', name, file: '', startLine: 0, endLine: 0, module: b.specifier });
    return id;
  }

  function resolveName(file: string, owner: string | null, target: string): string | null {
    const local = localIndex.get(file);
    const imports = importIndex.get(file);

    if (target.startsWith('this.')) {
      if (!owner) return null;
      const className = owner.split('.')[0];
      return local?.get(`${className}.${target.slice(5)}`) ?? null;
    }

    const dot = target.indexOf('.');
    if (dot === -1) {
      const own = local?.get(target);
      if (own) return own;
      const binding = imports?.get(target);
      return binding ? resolveBinding(binding, null) : null;
    }

    const head = target.slice(0, dot);
    const member = target.slice(dot + 1);

    const qualified = local?.get(target); // e.g. Class.staticMethod
    if (qualified) return qualified;

    const headId = local?.get(head);
    if (headId) {
      const headNode = nodeById.get(headId);
      return headNode && headNode.type === 'class' ? headId : null;
    }

    const binding = imports?.get(head);
    return binding ? resolveBinding(binding, member) : null;
  }

  // ---- Pass 4: CALLS and REFERENCES ----
  for (const file of files) {
    const local = localIndex.get(file.path)!;
    const fileId = `file:${file.path}`;

    for (const usage of file.parsed.usages) {
      const fromId = usage.owner ? local.get(usage.owner) ?? fileId : fileId;
      const toId = resolveName(file.path, usage.owner, usage.target);
      if (!toId) continue; // unresolved names (console, JSON, ...) are skipped on purpose
      if (usage.kind === 'REFERENCES' && toId === fromId) continue;
      addEdge(fromId, toId, usage.kind);
    }
  }

  return {
    version: 1,
    indexedAt: new Date().toISOString(),
    root,
    files: files.map((f) => ({ path: f.path, language: f.language, lines: f.lineCount })),
    nodes,
    edges,
  };
}