#ifndef NOUS_MEMORY_MOBILE_H
#define NOUS_MEMORY_MOBILE_H

int nous_init(const char *license_key, const char *hardware_fingerprint);
char *nous_store(const char *text, const char *layer, const char *source, double score);
char *nous_recall(const char *query, int top_k);
char *nous_health(void);
char *nous_serialize(void);
int nous_deserialize(const char *data, const char *license_key, const char *hardware_fingerprint);
void nous_free_string(char *ptr);
int nous_memory_count(void);

#endif
