# Schema Evolution Guidelines

This document describes the versioning strategy and backward compatibility rules for the Cream Protobuf schemas.

## Protobuf Syntax

We currently use **proto3** syntax with `optional` keywords for explicit field presence.

### Why Not Editions Yet?

Protobuf Editions (edition 2023/2024) is the future of Protocol Buffers, but our Rust code generator (Prost) doesn't support it yet. We plan to migrate to **edition 2024** when:
- Prost adds Protobuf Editions support
- Buf CLI supports edition 2024 (currently only supports 2023)

### Proto3 with Optional

Proto3 with `optional` keywords provides equivalent functionality to Edition 2023:
- Explicit field presence tracking via `optional`
- Open enums (unknown values preserved)
- Packed repeated fields by default

## Schema Version

Each proto file includes a version header:
```protobuf
// Schema Version: 1.0.0
// Last Updated: YYYY-MM-DD
```

The `MarketSnapshot` message includes a `schema_version` field for runtime compatibility checks.

## Field Numbering Strategy

### Reserved Ranges
- **1-15**: High-frequency fields (1-byte tag encoding)
- **16-2047**: Standard fields (2-byte tag encoding)
- **2048+**: Reserved for extensions and future use
- **19000-19999**: Reserved by Protobuf (do not use)

### Best Practices
1. Use field numbers 1-15 for frequently accessed fields
2. Never reuse field numbers, even for deleted fields
3. Use `reserved` statements for removed fields
4. Group related fields in contiguous number ranges

## Reserved Fields

When removing a field, always add it to a `reserved` statement:

```protobuf
message Example {
  // Reserved fields - never reuse these numbers
  reserved 6, 7;  // Removed: old_field_a, old_field_b (2026-01-05)
  reserved "old_field_a", "old_field_b";

  string name = 1;
  // ... other fields
}
```

**Rules:**
- Reserve both the field number AND the field name
- Add a comment with the removal date and reason
- Never remove reserved statements

## Breaking vs Non-Breaking Changes

### Non-Breaking (Safe)
- Adding new fields (with new numbers)
- Adding new enum values
- Adding new messages
- Adding new services/RPCs
- Renaming fields (wire format unchanged)
- Adding `deprecated = true` option

### Breaking (Requires Major Version)
- Removing fields (without reserving)
- Changing field numbers
- Changing field types
- Changing field cardinality (singular <-> repeated)
- Renaming enum values
- Removing enum values
- Changing package name

## Buf Breaking Change Detection

The `buf.yaml` is configured to detect breaking changes:

```yaml
breaking:
  use:
    - FILE        # Source-level compatibility
    - WIRE_JSON   # Wire and JSON format compatibility
  except:
    - FIELD_SAME_JSON_NAME  # Allow JSON name changes with care
```

Run before merging:
```bash
buf breaking --against .git#branch=main
```

## Deprecation Process

1. **Mark as deprecated** (non-breaking):
   ```protobuf
   string old_field = 5 [deprecated = true];
   ```

2. **Document migration** in code comments and release notes

3. **Wait at least 2 releases** before removal

4. **Remove and reserve** (breaking - major version):
   ```protobuf
   reserved 5;
   reserved "old_field";
   ```

## Version Bumping

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | Major | 1.0.0 -> 2.0.0 |
| New features (non-breaking) | Minor | 1.0.0 -> 1.1.0 |
| Bug fixes, documentation | Patch | 1.0.0 -> 1.0.1 |

## Code Generation

After schema changes:
```bash
# Generate all language bindings
buf generate

# Verify no breaking changes
buf breaking --against .git#branch=main

# Lint the schema
buf lint
```

## Testing Backward Compatibility

1. **Golden file tests**: Serialize known messages, verify they deserialize correctly
2. **Forward compatibility**: New code can read old messages (unknown fields ignored)
3. **Backward compatibility**: Old code can read new messages (missing fields use defaults)

## References

- [Protobuf Editions Overview](https://protobuf.dev/editions/overview/)
- [Buf Breaking Change Detection](https://buf.build/docs/breaking/overview)
- [Protocol Buffers Style Guide](https://protobuf.dev/programming-guides/style/)
