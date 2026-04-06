module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let isModified = false;
  let needsApiGet = false;
  let needsApiPost = false;
  let needsApiPut = false;
  let needsApiDelete = false;

  // Find all variable declarations that look like:
  // const res = await fetch(...)
  // const data = await res.json()
  root.find(j.VariableDeclaration).forEach(path => {
    const declarations = path.node.declarations;
    if (declarations.length !== 1) return;

    const decl = declarations[0];
    if (decl.init && decl.init.type === 'AwaitExpression') {
      const argument = decl.init.argument;
      if (argument.type === 'CallExpression' && argument.callee.name === 'fetch') {
        const fetchArgs = argument.arguments;
        const resVarName = decl.id.name; // usually 'res' or 'response'

        // Now find the NEXT statement in the block to see if it's:
        // const data = await res.json();
        const block = path.parentPath.node;
        if (!block || !Array.isArray(block.body)) return;

        const stmtIndex = block.body.indexOf(path.node);
        if (stmtIndex === -1 || stmtIndex >= block.body.length - 1) return;

        const nextStmt = block.body[stmtIndex + 1];
        if (nextStmt.type !== 'VariableDeclaration' || nextStmt.declarations.length !== 1) return;

        const nextDecl = nextStmt.declarations[0];
        if (
          nextDecl.init &&
          nextDecl.init.type === 'AwaitExpression' &&
          nextDecl.init.argument.type === 'CallExpression' &&
          nextDecl.init.argument.callee.type === 'MemberExpression' &&
          nextDecl.init.argument.callee.object.name === resVarName &&
          nextDecl.init.argument.callee.property.name === 'json'
        ) {
          const dataVarName = nextDecl.id.name; // usually 'data'

          // We have found:
          // const res = await fetch(url, options);
          // const data = await res.json();
          
          let method = 'GET';
          let bodyNode = null;

          if (fetchArgs.length > 1) {
            const optionsArg = fetchArgs[1];
            if (optionsArg.type === 'ObjectExpression') {
              const methodProp = optionsArg.properties.find(p => p.key && p.key.name === 'method');
              if (methodProp && methodProp.value.type === 'StringLiteral') {
                method = methodProp.value.value.toUpperCase();
              }
              const bodyProp = optionsArg.properties.find(p => p.key && p.key.name === 'body');
              if (bodyProp) {
                // Usually body: JSON.stringify(payload)
                if (
                  bodyProp.value.type === 'CallExpression' &&
                  bodyProp.value.callee.type === 'MemberExpression' &&
                  bodyProp.value.callee.object.name === 'JSON' &&
                  bodyProp.value.callee.property.name === 'stringify'
                ) {
                  bodyNode = bodyProp.value.arguments[0];
                } else {
                  bodyNode = bodyProp.value;
                }
              }
            }
          }

          let newCallName;
          let newArgs = [fetchArgs[0]];

          if (method === 'GET') {
            newCallName = 'apiGet';
            needsApiGet = true;
          } else if (method === 'POST') {
            newCallName = 'apiPost';
            needsApiPost = true;
            newArgs.push(bodyNode || j.identifier('undefined'));
          } else if (method === 'PUT') {
            newCallName = 'apiPut';
            needsApiPut = true;
            newArgs.push(bodyNode || j.identifier('undefined'));
          } else if (method === 'DELETE') {
            newCallName = 'apiDelete';
            needsApiDelete = true;
          }

          // Replace: const data = await apiPost(...)
          const newCall = j.callExpression(j.identifier(newCallName), newArgs);
          const newAwait = j.awaitExpression(newCall);
          const newDecl = j.variableDeclaration(nextStmt.kind, [
            j.variableDeclarator(j.identifier(dataVarName), newAwait)
          ]);

          // Replace the next statement with the new API call
          block.body[stmtIndex + 1] = newDecl;
          
          // Remove the fetch statement
          block.body.splice(stmtIndex, 1);
          
          isModified = true;
        }
      }
    }
  });

  if (isModified) {
    // Add import { apiGet, apiPost... } from '@/lib/api';
    const imports = [];
    if (needsApiGet) imports.push(j.importSpecifier(j.identifier('apiGet')));
    if (needsApiPost) imports.push(j.importSpecifier(j.identifier('apiPost')));
    if (needsApiPut) imports.push(j.importSpecifier(j.identifier('apiPut')));
    if (needsApiDelete) imports.push(j.importSpecifier(j.identifier('apiDelete')));

    const importStmt = j.importDeclaration(imports, j.stringLiteral('@/lib/api'));
    
    // Insert at the beginning, after the last import if possible
    const body = root.get().node.program.body;
    let lastImportIndex = -1;
    for (let i = 0; i < body.length; i++) {
      if (body[i].type === 'ImportDeclaration') {
        lastImportIndex = i;
      }
    }
    if (lastImportIndex >= 0) {
      body.splice(lastImportIndex + 1, 0, importStmt);
    } else {
      body.unshift(importStmt);
    }

    return root.toSource();
  }

  return null;
};
