#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RemindersBridge, NSObject)
RCT_EXTERN_METHOD(getAll:(BOOL)showCompleted resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(create:(NSDictionary *)details resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(complete:(NSString *)reminderId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(remove:(NSString *)reminderId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
