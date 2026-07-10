const fs = require('fs');
let src = fs.readFileSync('src/app/index.tsx', 'utf8');

// Remove duplicate Pressable import (keep only one)
src = src.replace('    Pressable,\n    Pressable,\n', '    Pressable,\n');

// Remove duplicate AnimatedVoteButton function (keep only the first one)
// Find both occurrences and remove the second
const marker = 'function AnimatedVoteButton(';
const first = src.indexOf(marker);
const second = src.indexOf(marker, first + 1);

if (second !== -1) {
    // Find the end of the second function (the closing `}\n\n` before `export default`)
    const exportDefault = src.indexOf('export default function App() {', second);
    src = src.slice(0, second) + src.slice(exportDefault);
    console.log('Removed duplicate AnimatedVoteButton function');
}

fs.writeFileSync('src/app/index.tsx', src);
const count = (src.match(/AnimatedVoteButton/g) || []).length;
console.log('Done. AnimatedVoteButton occurrences:', count);
