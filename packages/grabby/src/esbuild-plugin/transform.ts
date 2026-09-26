import ts from 'typescript';
import path from 'path';

export interface TransformResult {
  code: string;
}

interface Edit {
  pos: number;
  end: number;
  text: string;
}

export function transformAngularComponent(
  code: string,
  filePath: string,
  rootDir: string,
): TransformResult | null {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/').replace(/'/g, "\\'");
  const edits: Edit[] = [];

  visitNode(sourceFile);

  if (edits.length === 0) return null;

  // Apply edits in reverse order to preserve positions
  edits.sort((a, b) => b.pos - a.pos);

  let result = code;
  for (const edit of edits) {
    result = result.slice(0, edit.pos) + edit.text + result.slice(edit.end);
  }

  return { code: result };

  function visitNode(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      processClassDeclaration(node);
    }
    ts.forEachChild(node, visitNode);
  }

  function processClassDeclaration(classNode: ts.ClassDeclaration): void {
    const decorators = ts.getDecorators(classNode);
    if (!decorators) return;

    for (const decorator of decorators) {
      if (!ts.isCallExpression(decorator.expression)) continue;

      const expr = decorator.expression;
      if (!ts.isIdentifier(expr.expression)) continue;
      if (expr.expression.text !== 'Component') continue;

      processComponentDecorator(expr);
    }
  }

  function processComponentDecorator(callExpr: ts.CallExpression): void {
    if (callExpr.arguments.length === 0) {
      // Empty decorator call: @Component() — add host arg
      const line = sourceFile.getLineAndCharacterOfPosition(callExpr.getStart()).line;
      const sourceAttr = `'data-ng-source': '${relativePath}:${line}:0'`;
      const insertText = `{ host: { ${sourceAttr} } }`;

      const openParen = callExpr.getStart() + callExpr.expression.getText().length;
      // Find the actual position of the opening paren
      const parenPos = code.indexOf('(', openParen);
      const closeParenPos = code.indexOf(')', parenPos);

      edits.push({
        pos: parenPos + 1,
        end: closeParenPos,
        text: insertText,
      });
      return;
    }

    const arg = callExpr.arguments[0];
    if (!ts.isObjectLiteralExpression(arg)) return;

    const line = sourceFile.getLineAndCharacterOfPosition(callExpr.getStart()).line;
    const sourceAttr = `'data-ng-source': '${relativePath}:${line}:0'`;

    // Check if host property already exists
    const hostProp = arg.properties.find(
      (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'host',
    ) as ts.PropertyAssignment | undefined;

    if (hostProp) {
      // Host property exists — inject into it
      if (!ts.isObjectLiteralExpression(hostProp.initializer)) return;

      const hostObj = hostProp.initializer;

      // Check for existing data-ng-source (idempotent)
      const hasExisting = hostObj.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ((ts.isStringLiteral(p.name) && p.name.text === 'data-ng-source') ||
            (ts.isIdentifier(p.name) && p.name.text === 'data-ng-source')),
      );

      if (hasExisting) return;

      // Insert into existing host object
      if (hostObj.properties.length > 0) {
        const lastProp = hostObj.properties[hostObj.properties.length - 1];
        edits.push({
          pos: lastProp.getEnd(),
          end: lastProp.getEnd(),
          text: `, ${sourceAttr}`,
        });
      } else {
        // Empty host object: host: {}
        const openBrace = hostObj.getStart();
        const closeBrace = hostObj.getEnd();
        edits.push({
          pos: openBrace + 1,
          end: closeBrace - 1,
          text: ` ${sourceAttr} `,
        });
      }
    } else {
      // No host property — add one
      if (arg.properties.length > 0) {
        const lastProp = arg.properties[arg.properties.length - 1];
        edits.push({
          pos: lastProp.getEnd(),
          end: lastProp.getEnd(),
          text: `, host: { ${sourceAttr} }`,
        });
      } else {
        // Empty object literal: @Component({})
        const openBrace = arg.getStart();
        const closeBrace = arg.getEnd();
        edits.push({
          pos: openBrace + 1,
          end: closeBrace - 1,
          text: ` host: { ${sourceAttr} } `,
        });
      }
    }
  }
}
