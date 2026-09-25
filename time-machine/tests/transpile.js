// Syntax and emit check of every source file with the client's TypeScript (no EB runtime).
const ts = require('typescript'), fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..', 'src'), out = path.join(__dirname, 'build')
let errs = 0
function walk (d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(f) && !/\.d\.ts$/.test(f)) {
      const src = fs.readFileSync(p, 'utf8')
      const r = ts.transpileModule(src, { fileName: p, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: '@emotion/react', esModuleInterop: true } })
      for (const dg of r.diagnostics || []) { errs++; const { line, character } = dg.file.getLineAndCharacterOfPosition(dg.start); console.log(p, line + 1, character, ts.flattenDiagnosticMessageText(dg.messageText, '\n')) }
      const o = path.join(out, path.relative(root, p)).replace(/\.tsx?$/, '.js')
      fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, r.outputText)
    }
  }
}
walk(root); console.log('syntax errors:', errs); process.exitCode = errs ? 1 : 0
