# src/example-fe.tsx — New

## Change

Adds a new frontend component rendering the example result.

## Component Props

```tsx
interface ExampleProps { value: string }
```

## Tests

`tests/example-fe.test.tsx`: renders with `value="X"` and asserts the text is visible.
