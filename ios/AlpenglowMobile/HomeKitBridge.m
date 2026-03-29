#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HomeKitBridge, NSObject)
RCT_EXTERN_METHOD(listAccessories:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setValue:(NSString *)deviceName characteristic:(NSString *)charName value:(id)value resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(executeScene:(NSString *)sceneName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getStatus:(NSString *)deviceName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
