#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ContactsBridge, NSObject)
RCT_EXTERN_METHOD(search:(NSString *)query resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(create:(NSDictionary *)details resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getById:(NSString *)contactId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
