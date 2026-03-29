#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NousMemoryBridge, NSObject)
RCT_EXTERN_METHOD(initialize:(NSString *)licenseKey fingerprint:(NSString *)fingerprint resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(store:(NSString *)text layer:(NSString *)layer source:(NSString *)source score:(double)score resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(recall:(NSString *)query topK:(NSInteger)topK resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getHealth:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getMemoryCount:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(serialize:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deserialize:(NSString *)jsonData resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
