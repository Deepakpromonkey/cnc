// Lets the worker reuse lib/* modules that import "server-only" (a Next.js marker that
// throws outside the react-server build). Outside Next there is no client bundle to protect.
const Module = require("node:module");
const p = require.resolve("server-only");
const m = new Module(p);
m.filename = p;
m.loaded = true;
m.exports = {};
require.cache[p] = m;
