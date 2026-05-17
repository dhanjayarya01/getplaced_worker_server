const fs = require('fs');
const path = require('path');

const fixFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Fix backticks
    content = content.replace(/\\`/g, '`');
    // Fix string interpolation
    content = content.replace(/\\\${/g, '${');
    // Fix double slashes in regex and strings that I accidentally over-escaped
    content = content.replace(/\/^\\\\d\//g, '/^\\\\d/');
    // Wait, let's just do \` and \${
    
    // Some lines had \\n where it should be \n. Wait, \n inside template literals should be fine if it's \\n when written.
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Fixed', filePath);
};

const dirs = [
    'C:/Users/dhanj/Desktop/getplacedProject/workers/dsa-worker/src/services/wrappers',
    'C:/Users/dhanj/Desktop/getplacedProject/getplaced_backend/src/services/wrappers'
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.js')) {
            fixFile(path.join(dir, file));
        }
    });
});
