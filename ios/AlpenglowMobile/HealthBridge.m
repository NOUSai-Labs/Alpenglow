#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HealthBridge, NSObject)
RCT_EXTERN_METHOD(getSteps:(NSString *)dateStr resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getHeartRate:(double)hours resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getSleep:(NSString *)dateStr resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getWorkouts:(int)days resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
