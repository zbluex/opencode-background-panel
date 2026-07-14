import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const root = 'C:\\Users\\zbluex\\.config\\opencode\\plugins\\opencode-background-panel';

const files = [
    {
        src: 'src/tui-compiled/slots/sidebar-content.tsx',
        dest: 'src/tui-compiled/slots/sidebar-content.tsx',
    },
    {
        src: 'src/tui-compiled/index.tsx',
        dest: 'src/tui-compiled/index.tsx',
    },
];

const transpiler = new Bun.Transpiler({
    loader: 'tsx',
    jsxImportSource: '@opentui/solid',
});

async function compileFile(srcFile, destFile) {
    const srcPath = join(root, srcFile);
    const destPath = join(root, destFile);
    
    console.log(`Reading: ${srcPath}`);
    const source = readFileSync(srcPath, 'utf-8');
    
    console.log(`Transpiling...`);
    const result = await transpiler.transform(srcPath, source);
    
    // The transpiler output has imports from @opentui/solid/jsx-dev-runtime
    // We need to replace those imports with our manual imports from opentui:runtime-module:%40opentui%2Fsolid
    // Also, the transpiler generates calls to jsxDEV/Fragment - we need to handle this
    
    // Replace the jsx-dev-runtime import
    let output = result.code.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']@opentui\/solid\/jsx-dev-runtime["']/g,
        (_match, exports) => {
            // Check what's imported
            const names = exports.split(',').map(s => s.trim());
            const hasJsxDEV = names.some(n => n.includes('jsxDEV'));
            const hasFragment = names.some(n => n.includes('Fragment'));
            
            // We need to provide these functions. Let's import them from the runtime module protocol
            // The jsxDEV function is essentially createElement in dev mode
            // We'll import createElement and Fragment from the runtime module
            let imports = [];
            if (hasJsxDEV) imports.push('createElement as jsxDEV');
            if (hasFragment) imports.push('');
            // Actually, Fragment is usually re-exported from solid-js
            // Let me just import it from @opentui/solid main module
            return `import { ${imports.join(', ')} } from "opentui:runtime-module:%40opentui%2Fsolid"`;
        }
    );
    
    // Also handle jsx-runtime (production mode)
    output = output.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']@opentui\/solid\/jsx-runtime["']/g,
        (_match, exports) => {
            const names = exports.split(',').map(s => s.trim());
            const hasJsx = names.some(n => n.includes('jsx'));
            const hasFragment = names.some(n => n.includes('Fragment'));
            let imports = [];
            if (hasJsx) imports.push('jsx');
            if (hasFragment) imports.push('Fragment');
            return `import { ${imports.join(', ')} } from "opentui:runtime-module:%40opentui%2Fsolid"`;
        }
    );
    
    // Remove the @jsxImportSource pragma since we're handling it manually
    output = output.replace(/\/\*\*\s*@jsxImportSource\s+\S+\s*\*\/\s*\n?/g, '');
    
    // Ensure we have the right imports at the top
    // The transpiler generates _$memo, _$createElement, etc. but our file already has them
    // We need to replace the transpiler's imports with our runtime module imports
    
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, output, 'utf-8');
    console.log(`Written: ${destPath} (${output.length} bytes)`);
}

for (const f of files) {
    await compileFile(f.src, f.dest);
}

console.log('Done!');
