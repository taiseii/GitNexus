/**
 * R: function definitions (<- and = assignment), S4/R5/R6 classes,
 *    library/require imports, source() includes, pkg::func namespaced calls,
 *    roxygen2 doc parsing, cross-package resolution, heritage
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES,
  getRelationships,
  getNodesByLabel,
  getNodesByLabelFull,
  runPipelineFromRepo,
  type PipelineResult,
} from './helpers.js';

describe('R function definitions and calls', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(path.join(FIXTURES, 'r-packages'), () => {});
  }, 60000);

  // --- Function detection ---

  it('detects functions defined with <- assignment', () => {
    const functions = getNodesByLabel(result, 'Function');
    expect(functions).toContain('AddOutlierStatuses');
    expect(functions).toContain('CleanData');
  });

  it('detects functions defined with = assignment', () => {
    const functions = getNodesByLabel(result, 'Function');
    expect(functions).toContain('HelperFunc');
  });

  // --- Class detection ---

  it('detects S4 class defined with setClass', () => {
    const classes = getNodesByLabel(result, 'Class');
    expect(classes).toContain('DataModel');
  });

  it('detects R5 class defined with setRefClass', () => {
    const classes = getNodesByLabel(result, 'Class');
    expect(classes).toContain('DataProcessor');
  });

  it('detects R6 class defined with R6::R6Class', () => {
    const classes = getNodesByLabel(result, 'Class');
    expect(classes).toContain('ResultSet');
  });

  // --- Import resolution ---

  it('resolves source() to IMPORTS edge', () => {
    const imports = getRelationships(result, 'IMPORTS');
    const sourceEdge = imports.find(
      (e) => e.sourceFilePath.includes('run_analysis.R') && e.targetFilePath.includes('utils.R'),
    );
    expect(sourceEdge).toBeDefined();
  });

  it('resolves library() to IMPORTS edges for all package files', () => {
    const imports = getRelationships(result, 'IMPORTS');
    const libEdges = imports.filter(
      (e) => e.sourceFilePath.includes('run_analysis.R') && e.targetFilePath.includes('pkgB/'),
    );
    expect(libEdges.length).toBeGreaterThanOrEqual(1);
    expect(libEdges.some((e) => e.targetFilePath.includes('clean_data.R'))).toBe(true);
  });

  // --- Cross-package resolution ---

  it('resolves cross-package pkgB::CleanData call', () => {
    const calls = getRelationships(result, 'CALLS');
    const crossPkg = calls.find(
      (e) => e.target === 'CleanData' && e.targetFilePath.includes('clean_data.R'),
    );
    expect(crossPkg).toBeDefined();
  });

  // --- Call resolution ---

  it('resolves source()-imported function calls', () => {
    const calls = getRelationships(result, 'CALLS');
    const helperCall = calls.find(
      (e) => e.sourceFilePath.includes('run_analysis.R') && e.target === 'HelperFunc',
    );
    expect(helperCall).toBeDefined();
  });

  // --- R6 method detection ---

  it('detects R6 methods inside public = list(...)', () => {
    const methods = getNodesByLabel(result, 'Method');
    expect(methods).toContain('initialize');
    expect(methods).toContain('count');
  });

  it('detects R5 methods inside setRefClass(... methods = list(...))', () => {
    const methods = getNodesByLabel(result, 'Method');
    expect(methods).toContain('process');
  });

  it('emits HAS_METHOD edges from R6 class to its methods', () => {
    const hasMethod = getRelationships(result, 'HAS_METHOD');
    const r6Methods = hasMethod.filter((e) => e.source === 'ResultSet');
    expect(r6Methods.length).toBeGreaterThanOrEqual(2);
    expect(r6Methods.some((e) => e.target === 'initialize')).toBe(true);
    expect(r6Methods.some((e) => e.target === 'count')).toBe(true);
  });

  it('emits HAS_METHOD edge from R5 class to its methods', () => {
    const hasMethod = getRelationships(result, 'HAS_METHOD');
    const r5Methods = hasMethod.filter((e) => e.source === 'DataProcessor');
    expect(r5Methods.some((e) => e.target === 'process')).toBe(true);
  });

  it('resolves rs$count() call to ResultSet.count method', () => {
    const calls = getRelationships(result, 'CALLS');
    const countCall = calls.find(
      (e) =>
        e.sourceFilePath.includes('run_analysis.R') &&
        e.target === 'count' &&
        e.targetFilePath.includes('models.R'),
    );
    expect(countCall).toBeDefined();
  });

  // --- S4 setGeneric / setMethod detection ---

  it('detects S4 setGeneric as a function definition', () => {
    const functions = getNodesByLabel(result, 'Function');
    expect(functions).toContain('validate');
  });

  it('detects S4 setMethod as a method definition', () => {
    const methods = getNodesByLabel(result, 'Method');
    expect(methods).toContain('validate');
  });

  it('emits HAS_METHOD edge from S4 class to setMethod implementation', () => {
    const hasMethod = getRelationships(result, 'HAS_METHOD');
    const s4Methods = hasMethod.filter((e) => e.source === 'DataModel');
    expect(s4Methods.some((e) => e.target === 'validate')).toBe(true);
  });

  // --- R6 inherit= heritage ---

  it('emits EXTENDS edge from R6 Child class via inherit= (namespace call)', () => {
    const extends_ = getRelationships(result, 'EXTENDS');
    const childEdge = extends_.find((e) => e.source === 'Child' && e.target === 'Parent');
    expect(childEdge).toBeDefined();
  });

  it('applies NAMESPACE exports per package instead of as a repo-wide name set', () => {
    const functions = getNodesByLabelFull(result, 'Function').filter(
      (n) => n.name === 'PackageScoped',
    );
    const pkgAFunction = functions.find((n) =>
      n.properties.filePath.includes('pkgA/R/export_scope.R'),
    );
    const pkgBFunction = functions.find((n) =>
      n.properties.filePath.includes('pkgB/R/export_scope.R'),
    );

    expect(pkgAFunction).toBeDefined();
    expect(pkgBFunction).toBeDefined();
    expect(pkgAFunction?.properties.isExported).toBe(true);
    expect(pkgBFunction?.properties.isExported).toBe(false);
  });

  it('applies exportPattern and S3method directives from NAMESPACE', () => {
    const functions = getNodesByLabelFull(result, 'Function');
    const patternScoped = functions.find(
      (n) =>
        n.name === 'PatternScoped' &&
        n.properties.filePath.includes('pkgB/R/export_namespace_variants.R'),
    );
    const s3Method = functions.find(
      (n) =>
        n.name === 'print.FancyWidget' &&
        n.properties.filePath.includes('pkgB/R/export_namespace_variants.R'),
    );

    expect(patternScoped?.properties.isExported).toBe(true);
    expect(s3Method?.properties.isExported).toBe(true);
  });

  it('populates field metadata on R Property nodes', () => {
    const properties = getNodesByLabelFull(result, 'Property');

    const slotName = properties.find(
      (p) => p.name === 'name' && p.properties.filePath.includes('pkgA/R/models.R'),
    );
    expect(slotName).toBeDefined();
    expect(slotName!.properties.visibility).toBe('public');
    expect(slotName!.properties.declaredType).toBe('character');

    const dataField = properties.find(
      (p) => p.name === 'data' && p.properties.filePath.includes('pkgA/R/models.R'),
    );
    expect(dataField).toBeDefined();
    expect(dataField!.properties.visibility).toBe('public');
    expect(dataField!.properties.declaredType).toBe('data.frame');

    const itemsField = properties.find(
      (p) => p.name === 'items' && p.properties.filePath.includes('pkgA/R/models.R'),
    );
    expect(itemsField).toBeDefined();
    expect(itemsField!.properties.visibility).toBe('public');
  });

  // --- Negative tests ---

  it('does not index .Rprofile or .Renviron files', () => {
    const allNodes: string[] = [];
    result.graph.forEachNode((n) => {
      if (
        n.properties.filePath?.includes('.Rprofile') ||
        n.properties.filePath?.includes('.Renviron')
      ) {
        allNodes.push(n.properties.name);
      }
    });
    expect(allNodes).toHaveLength(0);
  });
});
