import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import R from '@eagleoutice/tree-sitter-r';
import { countCallArguments } from '../../src/core/ingestion/utils/call-analysis.js';
import type { SyntaxNode } from '../../src/core/ingestion/utils/ast-helpers.js';
import { SupportedLanguages } from 'gitnexus-shared';
import { getProvider } from '../../src/core/ingestion/languages/index.js';

function extractRCall(
  code: string,
  calledName: string,
): { callNode: SyntaxNode; nameNode: SyntaxNode } | undefined {
  const parser = new Parser();
  parser.setLanguage(R);

  const provider = getProvider(SupportedLanguages.R);
  const tree = parser.parse(code);
  const query = new Parser.Query(parser.getLanguage(), provider.treeSitterQueries);

  for (const match of query.matches(tree.rootNode)) {
    const captureMap: Record<string, SyntaxNode> = {};
    for (const capture of match.captures) {
      captureMap[capture.name] = capture.node;
    }
    if (captureMap['call'] && captureMap['call.name']?.text === calledName) {
      return { callNode: captureMap['call'], nameNode: captureMap['call.name'] };
    }
  }

  return undefined;
}

describe('countCallArguments (R pipes)', () => {
  it('counts the implicit lhs argument for native pipes', () => {
    const cleanCall = extractRCall('data |> clean_native() |> transform_native()', 'clean_native');
    const transformCall = extractRCall(
      'data |> clean_native() |> transform_native()',
      'transform_native',
    );

    expect(cleanCall).toBeDefined();
    expect(transformCall).toBeDefined();
    expect(countCallArguments(cleanCall!.callNode)).toBe(1);
    expect(countCallArguments(transformCall!.callNode)).toBe(1);
  });

  it('counts the implicit lhs argument for magrittr pipes', () => {
    const cleanCall = extractRCall(
      'data %>% clean_magrittr() %>% transform_magrittr()',
      'clean_magrittr',
    );
    const transformCall = extractRCall(
      'data %>% clean_magrittr() %>% transform_magrittr()',
      'transform_magrittr',
    );

    expect(cleanCall).toBeDefined();
    expect(transformCall).toBeDefined();
    expect(countCallArguments(cleanCall!.callNode)).toBe(1);
    expect(countCallArguments(transformCall!.callNode)).toBe(1);
  });

  it('does not count named comma nodes as arguments in ordinary R calls', () => {
    const multiArgCall = extractRCall('transform_magrittr(first, second)', 'transform_magrittr');

    expect(multiArgCall).toBeDefined();
    expect(countCallArguments(multiArgCall!.callNode)).toBe(2);
  });

  it('does not add an extra implicit argument when magrittr uses the dot placeholder', () => {
    const placeholderCall = extractRCall(
      'data %>% transform_magrittr(., extra)',
      'transform_magrittr',
    );

    expect(placeholderCall).toBeDefined();
    expect(countCallArguments(placeholderCall!.callNode)).toBe(2);
  });
});
