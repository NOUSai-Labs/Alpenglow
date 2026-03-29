//
//  NousMemoryBridge.m
//  AlpenglowMobile
//
//  React Native bridge exposing NOUS memory engine FFI to JavaScript.
//  All operations are async to avoid blocking the JS thread.
//

#import "NousMemoryBridge.h"
#import <React/RCTLog.h>

// C FFI declarations from Rust static library
extern int nous_init(const char *license_key, const char *hardware_fingerprint);
extern char *nous_store(const char *text, const char *layer, const char *source, double score);
extern char *nous_recall(const char *query, int top_k);
extern char *nous_health(void);
extern char *nous_serialize(void);
extern int nous_deserialize(const char *data, const char *license_key, const char *hardware_fingerprint);
extern void nous_free_string(char *ptr);
extern int nous_memory_count(void);

@implementation NousMemoryBridge

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_queue_create("com.nousai.memory", DISPATCH_QUEUE_SERIAL);
}

RCT_EXPORT_METHOD(initialize:(NSString *)licenseKey
                  fingerprint:(NSString *)fingerprint
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  int result = nous_init(
    [licenseKey UTF8String],
    [fingerprint UTF8String]
  );

  if (result == 0) {
    resolve(@{@"success": @YES, @"message": @"Memory engine initialized"});
  } else {
    reject(@"INIT_FAILED", @"Failed to initialize memory engine", nil);
  }
}

RCT_EXPORT_METHOD(store:(NSString *)text
                  layer:(NSString *)layer
                  source:(NSString *)source
                  score:(double)score
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  char *id = nous_store(
    [text UTF8String],
    [layer UTF8String],
    [source UTF8String],
    score
  );

  if (id != NULL) {
    NSString *memoryId = [NSString stringWithUTF8String:id];
    nous_free_string(id);
    resolve(@{@"id": memoryId});
  } else {
    reject(@"STORE_FAILED", @"Store not initialized", nil);
  }
}

RCT_EXPORT_METHOD(recall:(NSString *)query
                  topK:(int)topK
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  char *json = nous_recall([query UTF8String], topK);

  if (json != NULL) {
    NSString *jsonStr = [NSString stringWithUTF8String:json];
    nous_free_string(json);

    NSData *data = [jsonStr dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    NSArray *results = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

    if (error) {
      reject(@"PARSE_FAILED", @"Failed to parse recall results", error);
    } else {
      resolve(results);
    }
  } else {
    resolve(@[]);
  }
}

RCT_EXPORT_METHOD(getHealth:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  char *json = nous_health();

  if (json != NULL) {
    NSString *jsonStr = [NSString stringWithUTF8String:json];
    nous_free_string(json);

    NSData *data = [jsonStr dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    NSDictionary *health = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

    if (error) {
      reject(@"PARSE_FAILED", @"Failed to parse health data", error);
    } else {
      resolve(health);
    }
  } else {
    resolve(@{});
  }
}

RCT_EXPORT_METHOD(serialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  char *b64 = nous_serialize();

  if (b64 != NULL) {
    NSString *data = [NSString stringWithUTF8String:b64];
    nous_free_string(b64);
    resolve(data);
  } else {
    resolve(@"");
  }
}

RCT_EXPORT_METHOD(deserialize:(NSString *)data
                  licenseKey:(NSString *)licenseKey
                  fingerprint:(NSString *)fingerprint
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  int result = nous_deserialize(
    [data UTF8String],
    [licenseKey UTF8String],
    [fingerprint UTF8String]
  );

  if (result == 0) {
    resolve(@{@"success": @YES});
  } else {
    reject(@"DESERIALIZE_FAILED", @"Failed to deserialize memory data", nil);
  }
}

RCT_EXPORT_METHOD(getMemoryCount:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  int count = nous_memory_count();
  resolve(@(count));
}

@end
