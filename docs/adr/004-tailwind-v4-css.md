# ADR 4 — Tailwind v4 configuration is CSS

**Status:** accepted  
**Applies to:** `packages/config/tailwind`

`packages/config/tailwind/base.css` is a **CSS file**, consumed with `@import`.

**Why:** v4 moved configuration into CSS. `@theme`, `@custom-variant`, and
`@utility` have no equivalent in a v3-style JS preset object. The base file owns
the token *contract* (dark variant, `@theme inline` mapping, base layer); each
app supplies the palette values.

```css
@import 'tailwindcss';
@import '@fastehr/config/tailwind/base.css';
```
