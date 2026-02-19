// crawlerUtils.test.js
import { inScope } from './crawlerUtils.js';

const ALLOWED_HOSTS = new Set(['intra.se']);

console.assert(inScope('https://intra.se/foo', ALLOWED_HOSTS));
console.assert(!inScope('https://google.com/foo', ALLOWED_HOSTS));
console.assert(!inScope('https://intra.se/logout', ALLOWED_HOSTS));
console.assert(!inScope('https://intra.se/signout', ALLOWED_HOSTS));
console.log('crawlerUtils tests passed.');
