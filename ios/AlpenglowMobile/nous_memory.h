#ifndef nous_memory_h
#define nous_memory_h

#include <stdint.h>

// Initialize the memory engine with license key and device fingerprint
int32_t nous_init(const char* license_key, const char* fingerprint);

// Store a memory entry, returns JSON with id
const char* nous_store(const char* text, const char* layer, const char* source, double score);

// Recall memories matching a query, returns JSON array
const char* nous_recall(const char* query, int32_t top_k);

// Get health metrics, returns JSON
const char* nous_health(void);

// Get total memory count
int32_t nous_memory_count(void);

// Serialize store to JSON string (for sync/disk)
const char* nous_serialize(void);

// Deserialize and load from JSON string
int32_t nous_deserialize(const char* json_data);

// Free a string returned by Rust
void nous_free_string(const char* ptr);

#endif
