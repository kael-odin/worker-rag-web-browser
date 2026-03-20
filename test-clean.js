const q = ' `https://test.com` ';
console.log('Original:', q);
const clean = q.replace(/`/g, '').trim();
console.log('Clean:', clean);
