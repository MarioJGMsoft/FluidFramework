---
"@fluidframework/core-interfaces": minor
"__section": deprecation
---

Deprecated LogLevel.default and LogLevel.error

`LogLevel.default` and `LogLevel.error` in `@fluidframework/core-interfaces` are deprecated in favor of the semantically clearer `LogLevel.info` and `LogLevel.essential` respectively.

#### Migration

- `LogLevel.default` (= `20`) → use `LogLevel.info`
- `LogLevel.error` (= `30`) → use `LogLevel.essential`

Removal is tracked in [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969) and is planned for the v3.0 major release.
