import { parse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type { ComplexityPort } from "../../ports/complexity-port.js";
import type { FunctionComplexity, SourceSpan } from "../../domain/types.js";

// AST node types we care about for function scoping
const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

// AST node types that add +1 to cyclomatic complexity
const DECISION_TYPES = new Set([
  "IfStatement",
  "ConditionalExpression",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "CatchClause",
  "LogicalExpression",
  "ChainExpression",
]);

interface FunctionScope {
  qualifiedName: string;
  span: SourceSpan;
  complexity: number;
}

export class TypeScriptEslintComplexityAdapter implements ComplexityPort {
  extract(sourceText: string, filePath: string): FunctionComplexity[] {
    const ast = parse(sourceText, {
      loc: true,
      range: true,
      jsx: true,
    });

    const results: FunctionComplexity[] = [];
    this.walkProgram(ast, filePath, results);
    return results;
  }

  private walkProgram(
    ast: TSESTree.Program,
    filePath: string,
    results: FunctionComplexity[],
  ): void {
    for (const node of ast.body) {
      this.walkTopLevel(node, filePath, results, []);
    }
  }

  private walkTopLevel(
    node: TSESTree.Node,
    filePath: string,
    results: FunctionComplexity[],
    nameContext: string[],
  ): void {
    switch (node.type) {
      case "FunctionDeclaration":
        this.handleFunctionDeclaration(node, filePath, results, nameContext);
        return;
      case "ExportNamedDeclaration":
        if (node.declaration) {
          this.walkTopLevel(node.declaration, filePath, results, nameContext);
        }
        return;
      case "ExportDefaultDeclaration":
        this.handleExportDefault(node, filePath, results, nameContext);
        return;
      case "VariableDeclaration":
        this.handleVariableDeclaration(node, filePath, results, nameContext);
        return;
      case "ClassDeclaration":
        if (node.id) {
          this.walkClass(node, filePath, results, nameContext);
        }
        return;
    }
  }

  private handleFunctionDeclaration(
    node: TSESTree.FunctionDeclaration,
    filePath: string,
    results: FunctionComplexity[],
    nameContext: string[],
  ): void {
    if (node.id) {
      const scope = this.createScope(node.id.name, node, nameContext);
      this.countComplexity(node.body!, scope);
      results.push(this.toFunctionComplexity(scope, filePath));
    }
  }

  private handleExportDefault(
    node: TSESTree.ExportDefaultDeclaration,
    filePath: string,
    results: FunctionComplexity[],
    nameContext: string[],
  ): void {
    if (!node.declaration) return;

    if (
      node.declaration.type === "FunctionDeclaration" ||
      node.declaration.type === "FunctionExpression" ||
      node.declaration.type === "ArrowFunctionExpression"
    ) {
      const name =
        node.declaration.type === "FunctionDeclaration" && node.declaration.id
          ? node.declaration.id.name
          : "default";
      const scope = this.createScope(name, node.declaration, nameContext);
      this.countComplexityInFunction(node.declaration, scope);
      results.push(this.toFunctionComplexity(scope, filePath));
    }
  }

  private handleVariableDeclaration(
    node: TSESTree.VariableDeclaration,
    filePath: string,
    results: FunctionComplexity[],
    nameContext: string[],
  ): void {
    for (const declarator of node.declarations) {
      if (
        declarator.id.type === "Identifier" &&
        declarator.init &&
        FUNCTION_TYPES.has(declarator.init.type)
      ) {
        const funcNode = declarator.init as
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression;
        const scope = this.createScope(
          declarator.id.name,
          // Use the variable declaration's location for the span
          node,
          nameContext,
        );
        this.countComplexityInFunction(funcNode, scope);
        results.push(this.toFunctionComplexity(scope, filePath));
      }
    }
  }

  private walkClass(
    node: TSESTree.ClassDeclaration,
    filePath: string,
    results: FunctionComplexity[],
    nameContext: string[],
  ): void {
    const className = node.id?.name ?? "anonymous";
    const classContext = [...nameContext, className];

    for (const element of node.body.body) {
      if (
        element.type === "MethodDefinition" &&
        element.value.type === "FunctionExpression"
      ) {
        const methodName = this.getPropertyName(element.key);
        const scope = this.createScope(methodName, element, classContext);
        this.countComplexityInFunction(element.value, scope);
        results.push(this.toFunctionComplexity(scope, filePath));
      } else if (
        element.type === "PropertyDefinition" &&
        element.value &&
        FUNCTION_TYPES.has(element.value.type)
      ) {
        const propName = this.getPropertyName(element.key);
        const funcNode = element.value as
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression;
        const scope = this.createScope(propName, element, classContext);
        this.countComplexityInFunction(funcNode, scope);
        results.push(this.toFunctionComplexity(scope, filePath));
      }
    }
  }

  private getPropertyName(key: TSESTree.Node): string {
    if (key.type === "Identifier") return key.name;
    if (key.type === "Literal") return String(key.value);
    return "[computed]";
  }

  private createScope(
    name: string,
    node: TSESTree.Node,
    nameContext: string[],
  ): FunctionScope {
    const loc = node.loc!;
    return {
      qualifiedName: [...nameContext, name].join("."),
      span: {
        startLine: loc.start.line,
        startColumn: loc.start.column,
        endLine: loc.end.line + 1, // convert inclusive to exclusive
        endColumn: loc.end.column,
      },
      complexity: 1, // base complexity
    };
  }

  private countComplexityInFunction(
    node:
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression,
    scope: FunctionScope,
  ): void {
    if (node.body.type === "BlockStatement") {
      this.countComplexity(node.body, scope);
    } else {
      // Arrow function with expression body
      this.countComplexity(node.body, scope);
    }
  }

  private countComplexity(
    node: TSESTree.Node,
    scope: FunctionScope,
  ): void {
    // Don't recurse into nested function scopes
    if (FUNCTION_TYPES.has(node.type)) {
      return;
    }

    // Count decision points
    if (node.type === "SwitchCase") {
      // Only count non-default cases
      if (node.test !== null) {
        scope.complexity++;
      }
    } else if (DECISION_TYPES.has(node.type)) {
      scope.complexity++;
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "type" || key === "loc" || key === "range") {
        continue;
      }

      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === "object" && "type" in item) {
              this.countComplexity(item as TSESTree.Node, scope);
            }
          }
        } else if ("type" in value) {
          this.countComplexity(value as TSESTree.Node, scope);
        }
      }
    }
  }

  private toFunctionComplexity(
    scope: FunctionScope,
    filePath: string,
  ): FunctionComplexity {
    return {
      identity: {
        filePath,
        qualifiedName: scope.qualifiedName,
        span: scope.span,
      },
      cyclomaticComplexity: scope.complexity,
    };
  }
}
