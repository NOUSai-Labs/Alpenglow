#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PiPChatBridge, NSObject)

RCT_EXTERN_METHOD(startPiP:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopPiP:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(updateMessages:(NSArray *)messageArray resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setAgent:(NSString *)name emoji:(NSString *)emoji resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isRunning:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

@end
