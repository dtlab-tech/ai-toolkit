# src/example-be.js — New

## Change

Adds a new backend service doing example work.

## Service Interface

```js
function doExampleWork(input) { return input.toUpperCase() }
module.exports = { doExampleWork }
```

## Tests

`tests/example-be.test.js`: asserts `doExampleWork('x')` returns `'X'`.
