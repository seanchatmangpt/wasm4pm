/*
 * Source-owned core-WebAssembly federation adapter for scikit-decide.
 *
 * This is a SELECT/CONSTRUCT admission surface only. It has no host imports,
 * performs no I/O, and has no actuation authority. The source revision is
 * supplied by the exact-source build boundary:
 *
 *   -DCHATMAN_SOURCE_REVISION=\"<40 lowercase hex SHA>\"
 */

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;

#ifndef CHATMAN_SOURCE_REVISION
#error "CHATMAN_SOURCE_REVISION must be the exact 40-character source SHA"
#endif

#define ARENA_CAPACITY 65536u
#define RESPONSE_CAPACITY 8192u
#define MAX_JSON_DEPTH 16u
#define STRING_SCRATCH_CAPACITY 128u

static u8 arena[ARENA_CAPACITY];
static u8 response[RESPONSE_CAPACITY];
static u32 arena_offset;
static u32 response_len;
static int response_overflow;

static const char COMPONENT[] = "wasm4pm";
static const char SOURCE_REVISION[] = CHATMAN_SOURCE_REVISION;
static const char CAPABILITY_CLASS[] = "process-evidence";
static const char REQUEST_SCHEMA[] = "chatman.ecosystem.invoke.v1";
static const char RESPONSE_SCHEMA[] = "chatman.ecosystem.response.v1";
static const char RECEIPT_SCHEMA[] = "chatman.ecosystem.receipt.v1";
static const char ABI_NAME[] = "chatman:ecosystem/library";
static const char ABI_VERSION[] = "1.1.0";

static u32 cstr_len(const char *value) {
    u32 length = 0;
    while (value[length] != '\0') {
        length++;
    }
    return length;
}

static int cstr_equal(const char *left, const char *right) {
    u32 index = 0;
    while (left[index] != '\0' && right[index] != '\0') {
        if (left[index] != right[index]) {
            return 0;
        }
        index++;
    }
    return left[index] == '\0' && right[index] == '\0';
}

static int is_space(u8 value) {
    return value == ' ' || value == '\n' || value == '\r' || value == '\t';
}

static void skip_space(const u8 *data, u32 length, u32 *cursor) {
    while (*cursor < length && is_space(data[*cursor])) {
        (*cursor)++;
    }
}

static int is_hex(u8 value) {
    return (value >= '0' && value <= '9') ||
           (value >= 'a' && value <= 'f') ||
           (value >= 'A' && value <= 'F');
}

static int parse_string(
    const u8 *data,
    u32 length,
    u32 *cursor,
    char *decoded,
    u32 decoded_capacity
) {
    u32 decoded_len = 0;
    if (*cursor >= length || data[*cursor] != '"') {
        return 0;
    }
    (*cursor)++;
    while (*cursor < length) {
        u8 value = data[(*cursor)++];
        if (value == '"') {
            if (decoded != (char *)0) {
                if (decoded_len >= decoded_capacity) {
                    return 0;
                }
                decoded[decoded_len] = '\0';
            }
            return 1;
        }
        if (value < 0x20) {
            return 0;
        }
        if (value == '\\') {
            if (*cursor >= length) {
                return 0;
            }
            value = data[(*cursor)++];
            if (value == 'u') {
                u32 remaining = length - *cursor;
                if (remaining < 4u ||
                    !is_hex(data[*cursor]) ||
                    !is_hex(data[*cursor + 1u]) ||
                    !is_hex(data[*cursor + 2u]) ||
                    !is_hex(data[*cursor + 3u])) {
                    return 0;
                }
                *cursor += 4u;
                value = '?';
            } else if (!(value == '"' || value == '\\' || value == '/' ||
                         value == 'b' || value == 'f' || value == 'n' ||
                         value == 'r' || value == 't')) {
                return 0;
            }
        }
        if (decoded != (char *)0) {
            if (decoded_len + 1u >= decoded_capacity) {
                return 0;
            }
            decoded[decoded_len++] = (char)value;
        }
    }
    return 0;
}

static int parse_literal(const u8 *data, u32 length, u32 *cursor, const char *literal) {
    u32 literal_len = cstr_len(literal);
    if (length - *cursor < literal_len) {
        return 0;
    }
    for (u32 index = 0; index < literal_len; index++) {
        if (data[*cursor + index] != (u8)literal[index]) {
            return 0;
        }
    }
    *cursor += literal_len;
    return 1;
}

static int parse_number(const u8 *data, u32 length, u32 *cursor) {
    u32 start = *cursor;
    if (*cursor < length && data[*cursor] == '-') {
        (*cursor)++;
    }
    if (*cursor >= length) {
        return 0;
    }
    if (data[*cursor] == '0') {
        (*cursor)++;
    } else {
        if (data[*cursor] < '1' || data[*cursor] > '9') {
            return 0;
        }
        while (*cursor < length && data[*cursor] >= '0' && data[*cursor] <= '9') {
            (*cursor)++;
        }
    }
    if (*cursor < length && data[*cursor] == '.') {
        (*cursor)++;
        u32 fractional_start = *cursor;
        while (*cursor < length && data[*cursor] >= '0' && data[*cursor] <= '9') {
            (*cursor)++;
        }
        if (*cursor == fractional_start) {
            return 0;
        }
    }
    if (*cursor < length && (data[*cursor] == 'e' || data[*cursor] == 'E')) {
        (*cursor)++;
        if (*cursor < length && (data[*cursor] == '+' || data[*cursor] == '-')) {
            (*cursor)++;
        }
        u32 exponent_start = *cursor;
        while (*cursor < length && data[*cursor] >= '0' && data[*cursor] <= '9') {
            (*cursor)++;
        }
        if (*cursor == exponent_start) {
            return 0;
        }
    }
    return *cursor > start;
}

static int skip_value(const u8 *data, u32 length, u32 *cursor, u32 depth);

static int skip_array(const u8 *data, u32 length, u32 *cursor, u32 depth) {
    if (depth > MAX_JSON_DEPTH || *cursor >= length || data[*cursor] != '[') {
        return 0;
    }
    (*cursor)++;
    skip_space(data, length, cursor);
    if (*cursor < length && data[*cursor] == ']') {
        (*cursor)++;
        return 1;
    }
    for (;;) {
        if (!skip_value(data, length, cursor, depth + 1u)) {
            return 0;
        }
        skip_space(data, length, cursor);
        if (*cursor >= length) {
            return 0;
        }
        if (data[*cursor] == ']') {
            (*cursor)++;
            return 1;
        }
        if (data[*cursor] != ',') {
            return 0;
        }
        (*cursor)++;
        skip_space(data, length, cursor);
    }
}

static int skip_object(const u8 *data, u32 length, u32 *cursor, u32 depth) {
    char key[STRING_SCRATCH_CAPACITY];
    if (depth > MAX_JSON_DEPTH || *cursor >= length || data[*cursor] != '{') {
        return 0;
    }
    (*cursor)++;
    skip_space(data, length, cursor);
    if (*cursor < length && data[*cursor] == '}') {
        (*cursor)++;
        return 1;
    }
    for (;;) {
        if (!parse_string(data, length, cursor, key, sizeof(key))) {
            return 0;
        }
        skip_space(data, length, cursor);
        if (*cursor >= length || data[*cursor] != ':') {
            return 0;
        }
        (*cursor)++;
        skip_space(data, length, cursor);
        if (!skip_value(data, length, cursor, depth + 1u)) {
            return 0;
        }
        skip_space(data, length, cursor);
        if (*cursor >= length) {
            return 0;
        }
        if (data[*cursor] == '}') {
            (*cursor)++;
            return 1;
        }
        if (data[*cursor] != ',') {
            return 0;
        }
        (*cursor)++;
        skip_space(data, length, cursor);
    }
}

static int skip_value(const u8 *data, u32 length, u32 *cursor, u32 depth) {
    if (depth > MAX_JSON_DEPTH) {
        return 0;
    }
    skip_space(data, length, cursor);
    if (*cursor >= length) {
        return 0;
    }
    switch (data[*cursor]) {
        case '"':
            return parse_string(data, length, cursor, (char *)0, 0u);
        case '{':
            return skip_object(data, length, cursor, depth);
        case '[':
            return skip_array(data, length, cursor, depth);
        case 't':
            return parse_literal(data, length, cursor, "true");
        case 'f':
            return parse_literal(data, length, cursor, "false");
        case 'n':
            return parse_literal(data, length, cursor, "null");
        default:
            return parse_number(data, length, cursor);
    }
}

typedef struct {
    char schema[64];
    char component[64];
    char source_revision[64];
    char operation[64];
    char actuation[64];
    u8 schema_seen;
    u8 component_seen;
    u8 source_revision_seen;
    u8 operation_seen;
    u8 payload_seen;
    u8 authority_seen;
    u8 actuation_seen;
} InvocationFields;

static int parse_authority(
    const u8 *data,
    u32 length,
    u32 *cursor,
    InvocationFields *fields,
    u32 depth
) {
    char key[STRING_SCRATCH_CAPACITY];
    if (depth > MAX_JSON_DEPTH || *cursor >= length || data[*cursor] != '{') {
        return 0;
    }
    (*cursor)++;
    skip_space(data, length, cursor);
    if (*cursor < length && data[*cursor] == '}') {
        (*cursor)++;
        return 1;
    }
    for (;;) {
        if (!parse_string(data, length, cursor, key, sizeof(key))) {
            return 0;
        }
        skip_space(data, length, cursor);
        if (*cursor >= length || data[*cursor] != ':') {
            return 0;
        }
        (*cursor)++;
        skip_space(data, length, cursor);
        if (cstr_equal(key, "actuation")) {
            if (fields->actuation_seen ||
                !parse_string(data, length, cursor, fields->actuation, sizeof(fields->actuation))) {
                return 0;
            }
            fields->actuation_seen = 1u;
        } else if (!skip_value(data, length, cursor, depth + 1u)) {
            return 0;
        }
        skip_space(data, length, cursor);
        if (*cursor >= length) {
            return 0;
        }
        if (data[*cursor] == '}') {
            (*cursor)++;
            return 1;
        }
        if (data[*cursor] != ',') {
            return 0;
        }
        (*cursor)++;
        skip_space(data, length, cursor);
    }
}

static int parse_invocation(const u8 *data, u32 length, InvocationFields *fields) {
    char key[STRING_SCRATCH_CAPACITY];
    u32 cursor = 0;
    for (u32 index = 0; index < (u32)sizeof(*fields); index++) {
        ((u8 *)fields)[index] = 0u;
    }
    skip_space(data, length, &cursor);
    if (cursor >= length || data[cursor] != '{') {
        return 0;
    }
    cursor++;
    skip_space(data, length, &cursor);
    if (cursor < length && data[cursor] == '}') {
        return 0;
    }
    for (;;) {
        if (!parse_string(data, length, &cursor, key, sizeof(key))) {
            return 0;
        }
        skip_space(data, length, &cursor);
        if (cursor >= length || data[cursor] != ':') {
            return 0;
        }
        cursor++;
        skip_space(data, length, &cursor);

        if (cstr_equal(key, "schema")) {
            if (fields->schema_seen ||
                !parse_string(data, length, &cursor, fields->schema, sizeof(fields->schema))) {
                return 0;
            }
            fields->schema_seen = 1u;
        } else if (cstr_equal(key, "component")) {
            if (fields->component_seen ||
                !parse_string(data, length, &cursor, fields->component, sizeof(fields->component))) {
                return 0;
            }
            fields->component_seen = 1u;
        } else if (cstr_equal(key, "source_revision")) {
            if (fields->source_revision_seen ||
                !parse_string(data, length, &cursor, fields->source_revision, sizeof(fields->source_revision))) {
                return 0;
            }
            fields->source_revision_seen = 1u;
        } else if (cstr_equal(key, "operation")) {
            if (fields->operation_seen ||
                !parse_string(data, length, &cursor, fields->operation, sizeof(fields->operation))) {
                return 0;
            }
            fields->operation_seen = 1u;
        } else if (cstr_equal(key, "payload")) {
            if (fields->payload_seen || !skip_value(data, length, &cursor, 1u)) {
                return 0;
            }
            fields->payload_seen = 1u;
        } else if (cstr_equal(key, "authority")) {
            if (fields->authority_seen || !parse_authority(data, length, &cursor, fields, 1u)) {
                return 0;
            }
            fields->authority_seen = 1u;
        } else if (!skip_value(data, length, &cursor, 1u)) {
            return 0;
        }

        skip_space(data, length, &cursor);
        if (cursor >= length) {
            return 0;
        }
        if (data[cursor] == '}') {
            cursor++;
            break;
        }
        if (data[cursor] != ',') {
            return 0;
        }
        cursor++;
        skip_space(data, length, &cursor);
    }
    skip_space(data, length, &cursor);
    if (cursor != length) {
        return 0;
    }
    return fields->schema_seen && fields->component_seen &&
           fields->source_revision_seen && fields->operation_seen &&
           fields->payload_seen && fields->authority_seen;
}

static void response_reset(void) {
    response_len = 0u;
    response_overflow = 0;
}

static void response_char(char value) {
    if (response_len < RESPONSE_CAPACITY) {
        response[response_len++] = (u8)value;
    } else {
        response_overflow = 1;
    }
}

static void response_text(const char *value) {
    for (u32 index = 0; value[index] != '\0'; index++) {
        response_char(value[index]);
    }
}

static void response_u32(u32 value) {
    char digits[10];
    u32 count = 0;
    if (value == 0u) {
        response_char('0');
        return;
    }
    while (value != 0u && count < (u32)sizeof(digits)) {
        digits[count++] = (char)('0' + (value % 10u));
        value /= 10u;
    }
    while (count != 0u) {
        response_char(digits[--count]);
    }
}

static void response_hex32(u32 value) {
    static const char digits[] = "0123456789abcdef";
    for (int shift = 28; shift >= 0; shift -= 4) {
        response_char(digits[(value >> shift) & 0x0f]);
    }
}

static u32 fnv1a32(const u8 *data, u32 length) {
    u32 hash = 2166136261u;
    for (u32 index = 0; index < length; index++) {
        hash ^= data[index];
        hash *= 16777619u;
    }
    return hash;
}

typedef enum {
    REASON_NONE = 0,
    REASON_MALFORMED_REQUEST,
    REASON_REQUEST_SCHEMA_MISMATCH,
    REASON_COMPONENT_IDENTITY_MISMATCH,
    REASON_SOURCE_REVISION_MISMATCH,
    REASON_ACTUATION_NOT_ADMITTED,
    REASON_OPERATION_NOT_ADMITTED
} RefusalReason;

static const char *reason_code(RefusalReason reason) {
    switch (reason) {
        case REASON_MALFORMED_REQUEST:
            return "MALFORMED_REQUEST";
        case REASON_REQUEST_SCHEMA_MISMATCH:
            return "REQUEST_SCHEMA_MISMATCH";
        case REASON_COMPONENT_IDENTITY_MISMATCH:
            return "COMPONENT_IDENTITY_MISMATCH";
        case REASON_SOURCE_REVISION_MISMATCH:
            return "SOURCE_REVISION_MISMATCH";
        case REASON_ACTUATION_NOT_ADMITTED:
            return "ACTUATION_NOT_ADMITTED";
        case REASON_OPERATION_NOT_ADMITTED:
            return "OPERATION_NOT_ADMITTED";
        default:
            return "NONE";
    }
}

static int operation_admitted(const char *operation) {
    return cstr_equal(operation, "admit") ||
           cstr_equal(operation, "describe") ||
           cstr_equal(operation, "self_test");
}

static void emit_response(
    const char *operation,
    u32 request_length,
    u32 request_fingerprint,
    RefusalReason refusal
) {
    const int alive = refusal == REASON_NONE;
    response_reset();
    response_text("{\"schema\":\"");
    response_text(RESPONSE_SCHEMA);
    response_text("\",\"status\":\"");
    response_text(alive ? "ALIVE" : "REFUSED");
    response_text("\",\"output\":{");
    response_text("\"adapter\":\"");
    response_text(COMPONENT);
    response_text("\",\"abi_name\":\"");
    response_text(ABI_NAME);
    response_text("\",\"abi_version\":\"");
    response_text(ABI_VERSION);
    response_text("\",\"actuation\":\"none\",\"capability_class\":\"");
    response_text(CAPABILITY_CLASS);
    response_text("\",\"operation\":\"");
    response_text(operation);
    response_text("\",\"semantic_execution\":false");
    if (alive && cstr_equal(operation, "admit")) {
        response_text(",\"admitted\":true");
    }
    if (alive && cstr_equal(operation, "self_test")) {
        response_text(",\"checks\":[\"identity\",\"authority\",\"receipt\",\"replay\"]");
    }
    if (alive && cstr_equal(operation, "describe")) {
        response_text(",\"native_surfaces\":[\"rust\",\"wasm-bindgen\",\"core-wasm-federation\"]");
    }
    if (!alive) {
        response_text(",\"reason\":\"");
        response_text(reason_code(refusal));
        response_char('"');
    }
    response_text("},\"receipt\":{\"schema\":\"");
    response_text(RECEIPT_SCHEMA);
    response_text("\",\"scope\":\"federation-adapter\",\"subject\":{\"component\":\"");
    response_text(COMPONENT);
    response_text("\",\"source_revision\":\"");
    response_text(SOURCE_REVISION);
    response_text("\"},\"authority\":{\"actuation\":\"none\"},\"execution\":{\"runtime\":\"wasm32-core\",\"operation\":\"");
    response_text(operation);
    response_text("\",\"request_len\":");
    response_u32(request_length);
    response_text(",\"request_fingerprint\":{\"algorithm\":\"fnv1a32\",\"value\":\"");
    response_hex32(request_fingerprint);
    response_text("\"}},\"standing\":\"");
    response_text(alive ? "ALIVE" : "REFUSED");
    response_text("\"}}");
}

__attribute__((visibility("default")))
u32 chatman_alloc(u32 length) {
    if (length == 0u || length > ARENA_CAPACITY) {
        return 0u;
    }
    u32 aligned = (arena_offset + 7u) & ~7u;
    if (aligned + length > ARENA_CAPACITY) {
        aligned = 0u;
    }
    arena_offset = aligned + length;
    return (u32)(u64)(arena + aligned);
}

__attribute__((visibility("default")))
void chatman_dealloc(u32 pointer, u32 length) {
    (void)pointer;
    (void)length;
}

__attribute__((visibility("default")))
u64 chatman_invoke(u32 pointer, u32 length) {
    const u8 *request = (const u8 *)(u64)pointer;
    InvocationFields fields;
    RefusalReason refusal = REASON_NONE;
    const char *operation = "";

    if (length == 0u || length > ARENA_CAPACITY || !parse_invocation(request, length, &fields)) {
        refusal = REASON_MALFORMED_REQUEST;
    } else {
        operation = fields.operation;
        if (!cstr_equal(fields.schema, REQUEST_SCHEMA)) {
            refusal = REASON_REQUEST_SCHEMA_MISMATCH;
        } else if (!cstr_equal(fields.component, COMPONENT)) {
            refusal = REASON_COMPONENT_IDENTITY_MISMATCH;
        } else if (!cstr_equal(fields.source_revision, SOURCE_REVISION)) {
            refusal = REASON_SOURCE_REVISION_MISMATCH;
        } else if (!fields.actuation_seen || !cstr_equal(fields.actuation, "none")) {
            refusal = REASON_ACTUATION_NOT_ADMITTED;
        } else if (!operation_admitted(fields.operation)) {
            refusal = REASON_OPERATION_NOT_ADMITTED;
        }
    }

    emit_response(operation, length, fnv1a32(request, length), refusal);
    if (response_overflow || response_len == 0u) {
        return 0u;
    }
    return (((u64)(u32)(u64)response) << 32) | (u64)response_len;
}
